#!/usr/bin/env bun
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BridgeHost, waitForConfigSettle } from './bridge-host';
import { JobQueue, downloadMedia, mediaFileNames, scanMedia, type Scene } from './jobs';
import { PLAYBOOK, TECHNIQUES, applyTechnique } from './presets';

const bridge = new BridgeHost(9988, { isServer: true });
const queue = new JobQueue(bridge);

// Most MCP clients give up on a tool call after about 60s. Anything slower answers with a task id and keeps running;
// flow_wait collects the result, so the agent never re-runs work that is still in progress.
const PATIENCE_MS = Number(process.env.PROMPT_PILOT_PATIENCE_MS ?? 45000);
const WAIT_MS = Math.max(5000, PATIENCE_MS - 5000);

type Task = { task_id: string; tool: string; started: string; status: 'running' | 'done' | 'failed'; result?: unknown; error?: string };
const tasks = new Map<string, Task>();

async function patient(tool: string, work: Promise<unknown>): Promise<unknown> {
  const task: Task = { task_id: `task-${randomUUID().slice(0, 8)}`, tool, started: new Date().toISOString(), status: 'running' };
  const settled = work.then(
    (result) => { task.status = 'done'; task.result = result; },
    (err) => { task.status = 'failed'; task.error = err instanceof Error ? err.message : String(err); },
  );
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((resolve) => (timer = setTimeout(() => resolve('late'), PATIENCE_MS)));
  const first = await Promise.race([settled.then(() => 'settled' as const), late]);
  clearTimeout(timer);
  if (first === 'settled') return work;
  tasks.set(task.task_id, task);
  return {
    still_working: true,
    task_id: task.task_id,
    note: `Still running - this is not a failure. Call flow_wait with ids ["${task.task_id}"] for the result, and do not call ${tool} again.`,
  };
}

async function waitFor(ids: string[] | undefined, timeoutSeconds: number) {
  const deadline = Date.now() + Math.min(timeoutSeconds * 1000, WAIT_MS);
  const isTask = (id: string) => id.startsWith('task-');
  const taskIds = (ids ?? []).filter(isTask);
  const jobIds = ids?.filter((id) => !isTask(id));
  while (Date.now() < deadline && taskIds.some((id) => tasks.get(id)?.status === 'running')) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const taskResults = taskIds.map((id) => tasks.get(id) ?? {
    task_id: id,
    status: 'unknown',
    note: 'The MCP server restarted since that call, so its answer is lost. Check flow_scan_media / flow_state before running it again.',
  });
  const tasksFinished = taskResults.every((t) => t.status !== 'running');
  if (taskIds.length && !jobIds?.length) return { finished: tasksFinished, tasks: taskResults };
  const jobs = await queue.wait(jobIds, Math.max(1000, deadline - Date.now()));
  return taskIds.length ? { ...jobs, finished: jobs.finished && tasksFinished, tasks: taskResults } : jobs;
}

const browserProp = {
  type: 'string',
  description: 'Target browser ID from browser_list (optional, defaults to "1").',
};
const siteProp = {
  type: 'string',
  description: 'Target platform name or URL fragment (e.g. "Google Flow", "ChatGPT", "Claude"). Defaults to "Google Flow".',
};
const configProps = {
  mode: { type: 'string', enum: ['image', 'video'], description: 'Generation mode ("image" or "video").' },
  aspectRatio: { type: 'string', description: 'Aspect ratio (e.g. "16:9", "9:16", "1:1").' },
  count: { type: 'number', description: 'Number of images/videos per generation (1-4).' },
  model: { type: 'string', description: 'Model name (e.g. "Veo 3.1 - Lite", "Nano Banana Pro").' },
  agent: { type: 'boolean', description: 'Google Flow Agent mode (true to enable, false to disable).' },
};
// flow_image / flow_video fix the mode themselves.
const { mode: _mode, ...modeFixedConfigProps } = configProps;
const readOnly = { readOnlyHint: true, openWorldHint: true };
const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

const TOOLS = [
  {
    name: 'flow_status',
    description: 'Call this first. Returns connected browsers, the Flow tab state (prompt box ready, active toggles), the generation queue, and a playbook for planning prompts.',
    inputSchema: { type: 'object', properties: { site: siteProp, browser: browserProp } },
    annotations: readOnly,
  },
  {
    name: 'flow_generate',
    description: 'Queue one generation per scene in Google Flow. Scenes run one at a time with a randomised 20-45s pause between them; each waits until its new media appears on the page and can be downloaded automatically. Video scenes spend the user\'s Flow credits. Returns job ids immediately; use flow_wait for results.',
    inputSchema: {
      type: 'object',
      properties: {
        scenes: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Prompt text for this scene.' },
              ...configProps,
              technique: { type: 'string', description: 'Technique preset id from flow_techniques, appended to the prompt.' },
              name: { type: 'string', description: 'File name stem for downloads (default scene-NN).' },
            },
            required: ['prompt'],
          },
        },
        download: { type: 'boolean', description: 'Download each scene\'s media to Downloads/Prompt-Pilot/<folder>/ when it finishes. Default: true.' },
        folder: { type: 'string', description: 'Subfolder under Downloads/Prompt-Pilot for this batch.' },
        timeoutSeconds: { type: 'number', description: 'Max seconds to wait for each scene\'s media (default 600 for video, 180 otherwise).' },
        site: siteProp,
        browser: browserProp,
      },
      required: ['scenes'],
    },
    annotations: writes,
  },
  {
    name: 'flow_wait',
    description: 'Wait for queued jobs (default: all) or for the task_id of a call that answered still_working, then return status, media URLs and download results. Returns within about 40s even if work is still running: call again until finished is true.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Job ids from flow_generate and/or task ids. Omit for all jobs.' },
        timeoutSeconds: { type: 'number', description: 'Max seconds to wait (capped at about 40). Default 40.' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'flow_cancel',
    description: 'Cancel queued jobs that have not started yet. A running generation cannot be cancelled.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Job ids to cancel. Omit to cancel every queued job.' } },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'flow_retry',
    description: 'Re-queue failed or cancelled jobs with the same settings and file names (default: all failed). Check flow_scan_media first when a job failed with a timeout: the media may already exist.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Job ids to retry. Omit for all failed jobs.' } },
    },
    annotations: writes,
  },
  {
    name: 'flow_techniques',
    description: 'List camera-move, product-shot, transition and image prompt presets. Pass an id as a scene\'s `technique` in flow_generate or as `technique` in flow_send_prompt.',
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string', enum: ['camera', 'product', 'transition', 'image'], description: 'Filter by category.' } },
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'flow_download',
    description: 'Download media already on the page without regenerating it (Downloads/Prompt-Pilot/<folder>/). Pass explicit urls, or `latest` to take the newest N items from flow_scan_media.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'Media URLs to download.' },
        latest: { type: 'number', description: 'Download the last N scanned media items instead of explicit urls.' },
        type: { type: 'string', enum: ['image', 'video', 'audio'], description: 'Only consider media of this type when using `latest`.' },
        name: { type: 'string', description: 'File name stem (default "media").' },
        folder: { type: 'string', description: 'Subfolder under Downloads/Prompt-Pilot.' },
        site: siteProp,
        browser: browserProp,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'flow_send_prompt',
    description: 'Send one prompt to the open Google Flow (or other AI platform) tab and return immediately, without waiting for the result. Prefer flow_generate for Flow generations you want tracked and downloaded.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The text prompt.' },
        site: siteProp,
        autoSend: { type: 'boolean', description: 'Click Generate / Send (true) or only type the prompt (false). Default: true.' },
        ...configProps,
        technique: { type: 'string', description: 'Technique preset id from flow_techniques, appended to the prompt.' },
        browser: browserProp,
      },
      required: ['prompt'],
    },
    annotations: writes,
  },
  {
    name: 'flow_image',
    description: 'Switch Google Flow to Image generation (Agent off), with optional aspect ratio, count, model or agent options.',
    inputSchema: { type: 'object', properties: { ...modeFixedConfigProps, browser: browserProp } },
    annotations: writes,
  },
  {
    name: 'flow_video',
    description: 'Switch Google Flow to Video generation (Agent off), with optional aspect ratio, count, model or agent options.',
    inputSchema: { type: 'object', properties: { ...modeFixedConfigProps, browser: browserProp } },
    annotations: writes,
  },
  {
    name: 'flow_configure',
    description: 'Configure Google Flow settings without prompting: Agent mode, Image/Video, aspect ratio, generation count, model.',
    inputSchema: { type: 'object', properties: { ...configProps, browser: browserProp } },
    annotations: writes,
  },
  {
    name: 'browser_list',
    description: 'List all connected browser instances (Chrome / Brave windows).',
    inputSchema: { type: 'object', properties: {} },
    annotations: readOnly,
  },
  {
    name: 'flow_state',
    description: 'Inspect active Google Flow toggles, selected options, and prompt box visibility.',
    inputSchema: { type: 'object', properties: { browser: browserProp } },
    annotations: readOnly,
  },
  {
    name: 'flow_scan_media',
    description: 'Scan generated media (images, videos, music links) from the active AI tab.',
    inputSchema: { type: 'object', properties: { site: siteProp, browser: browserProp } },
    annotations: readOnly,
  },
  {
    name: 'flow_upscale',
    description: 'Trigger Google Flow 1080p upscaled downloads across visible video cards.',
    inputSchema: { type: 'object', properties: { browser: browserProp } },
    annotations: writes,
  },
  {
    name: 'flow_open_project',
    description: 'Open an existing project or create a new one in Google Flow so the prompt box is visible.',
    inputSchema: { type: 'object', properties: { browser: browserProp } },
    annotations: writes,
  },
  {
    name: 'tab_detect',
    description: 'Detect which AI tool or chat platform is open on the current browser tab.',
    inputSchema: { type: 'object', properties: { site: { type: 'string', description: 'Optional site filter (e.g. "Google Flow", "Suno").' }, browser: browserProp } },
    annotations: readOnly,
  },
  {
    name: 'tab_list',
    description: 'List all open browser tabs available for prompt automation.',
    inputSchema: { type: 'object', properties: { browser: browserProp } },
    annotations: readOnly,
  },
];

const server = new Server(
  { name: 'prompt-pilot-bridge-mcp', version: '1.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

const NO_BRIDGE_TOOLS = new Set(['flow_techniques', 'flow_wait', 'flow_cancel', 'flow_retry']);

function configFromArgs(args: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (args.mode) options.mode = args.mode;
  if (args.aspectRatio) options.aspectRatio = args.aspectRatio;
  if (args.count) options.count = args.count;
  if (args.model) options.model = args.model;
  if (args.agent !== undefined) options.agent = args.agent;
  return options;
}

const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const strList = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined);

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const site = str(args.site) ?? 'Google Flow';
  const browser = str(args.browser) ?? '1';

  switch (name) {
    case 'flow_status': {
      const browsers = await bridge.getConnectedBrowsers().catch(() => []);
      const state = bridge.isConnected()
        ? await bridge.sendAction('flow_state', { site }, 30000, browser).catch((err: Error) => ({ error: err.message }))
        : { error: 'Prompt Pilot extension is not connected.' };
      return {
        connected: bridge.isConnected(),
        browsers,
        state,
        queue: queue.summary(),
        ...(tasks.size ? { slow_calls: [...tasks.values()].map(({ result, ...t }) => t) } : {}),
        playbook: PLAYBOOK,
      };
    }

    case 'flow_generate': {
      const scenes = Array.isArray(args.scenes) ? (args.scenes as Scene[]) : [];
      if (!scenes.length || scenes.some((s) => !s || typeof s.prompt !== 'string' || !s.prompt.trim())) {
        throw new Error('scenes must be a non-empty array and every scene needs a prompt.');
      }
      // Fail fast on a bad technique id instead of after the job has started.
      for (const scene of scenes) applyTechnique(scene.prompt, scene.technique);
      const jobs = queue.add(scenes, {
        site,
        browser,
        download: args.download !== false,
        folder: str(args.folder),
        timeoutSeconds: typeof args.timeoutSeconds === 'number' ? args.timeoutSeconds : undefined,
      });
      return {
        queued: jobs.map((j) => ({ id: j.id, stem: j.stem, prompt: j.scene.prompt })),
        queue: queue.summary(),
        next: 'Call flow_wait until finished is true.',
      };
    }

    case 'flow_wait': {
      const timeout = typeof args.timeoutSeconds === 'number' ? args.timeoutSeconds : 40;
      return waitFor(strList(args.ids), timeout);
    }

    case 'flow_cancel': {
      const ids = strList(args.ids) ?? queue.list().filter((j) => j.status === 'queued').map((j) => j.id);
      return { cancelled: ids.map((id) => queue.cancel(id)).filter(Boolean).map((j) => ({ id: j!.id, status: j!.status })) };
    }

    case 'flow_retry': {
      const ids = strList(args.ids) ?? queue.list().filter((j) => j.status === 'failed').map((j) => j.id);
      return { retried: ids.map((id) => queue.retry(id)).filter(Boolean).map((j) => ({ id: j!.id, status: j!.status })) };
    }

    case 'flow_techniques': {
      const category = str(args.category);
      return category ? TECHNIQUES.filter((t) => t.category === category) : TECHNIQUES;
    }

    case 'flow_download': {
      let urls = strList(args.urls) ?? [];
      const media = await scanMedia(bridge, site, browser);
      if (!urls.length && typeof args.latest === 'number' && args.latest > 0) {
        const type = str(args.type);
        urls = media.filter((m) => !type || m.type === type).slice(-args.latest).map((m) => m.url);
      }
      if (!urls.length) throw new Error('Pass urls, or latest with a number of items to download.');
      const byUrl = new Map(media.map((m) => [m.url, m]));
      const items = urls.map((url) => byUrl.get(url) ?? { url, type: 'image' });
      const names = mediaFileNames(items, str(args.name) ?? 'media', str(args.folder));
      return patient('flow_download', downloadMedia(bridge, names, site, browser).then((results) => ({ results })));
    }

    case 'flow_send_prompt': {
      const prompt = applyTechnique(String(args.prompt || ''), str(args.technique));
      const autoSend = args.autoSend !== false;
      const options = configFromArgs(args);
      let configResult;
      if (Object.keys(options).length > 0) {
        configResult = await bridge.sendAction('flow_config', { options, site }, 30000, browser);
        await waitForConfigSettle();
      }
      const promptResult = await bridge.sendAction('send_prompt', { prompt, site, autoSend }, 30000, browser);
      return { configResult, promptResult };
    }

    case 'flow_image':
    case 'flow_video':
    case 'flow_configure': {
      const options = configFromArgs(args);
      if (name !== 'flow_configure') {
        options.mode = name === 'flow_image' ? 'image' : 'video';
        if (args.agent === undefined) options.agent = false;
      }
      const result = await bridge.sendAction('flow_config', { options, site }, 30000, browser);
      await waitForConfigSettle();
      return result;
    }

    case 'browser_list':
      return bridge.getConnectedBrowsers();
    case 'flow_state':
      return bridge.sendAction('flow_state', { site }, 30000, browser);
    case 'flow_scan_media':
      return bridge.sendAction('scan_media', { site }, 30000, browser);
    case 'flow_upscale':
      return patient('flow_upscale', bridge.sendAction('upscale_flow', { site }, 180000, browser));
    case 'flow_open_project':
      return patient('flow_open_project', bridge.sendAction('open_flow_project', { site }, 60000, browser));
    case 'tab_detect':
      return bridge.sendAction('detect', { site: str(args.site) }, 30000, browser);
    case 'tab_list':
      return bridge.sendAction('list_tabs', {}, 30000, browser);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!NO_BRIDGE_TOOLS.has(name) && name !== 'flow_status' && !bridge.isConnected()) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: 'Error: Prompt Pilot Chrome extension is not connected. Please ensure Chrome is open with Prompt Pilot extension enabled.',
      }],
    };
  }

  try {
    const result = await callTool(name, (args ?? {}) as Record<string, unknown>);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: 'text', text: `Tool execution failed: ${errorMsg}` }] };
  }
});

async function run() {
  await bridge.start();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error('Fatal MCP server error:', err);
  process.exit(1);
});
