#!/usr/bin/env bun
import { join } from 'node:path';
import { BridgeHost, waitForConfigSettle } from '../bridge-host';
import { JobQueue, downloadMedia, mediaFileNames, scanMedia, type Scene } from '../jobs';
import { TECHNIQUES, applyTechnique } from '../presets';

const PORT = Number(process.env.WEB_PORT || 9990);
const HOST = process.env.WEB_HOST || '127.0.0.1';
const BRIDGE_PORT = Number(process.env.PORT || 9988);
const PUBLIC_DIR = join(import.meta.dir, 'public');

// Same actions the CLI and MCP server forward to the extension
const ALLOWED_ACTIONS = new Set([
  'detect',
  'flow_account',
  'list_tabs',
  'open_tab',
  'focus_tab',
  'close_tab',
  'navigate_tab',
  'send_prompt',
  'flow_config',
  'flow_state',
  'scan_media',
  'open_flow_project',
  'upscale_flow',
  'response_state',
]);

let bridge: BridgeHost | null = null;
let starting: Promise<BridgeHost> | null = null;

async function getBridge(): Promise<BridgeHost> {
  if (bridge) return bridge;
  if (!starting) {
    starting = (async () => {
      const b = new BridgeHost(BRIDGE_PORT);
      await b.start();
      bridge = b;
      return b;
    })().finally(() => {
      starting = null;
    });
  }
  return starting;
}

async function resetBridge() {
  const old = bridge;
  bridge = null;
  if (old) await old.close().catch(() => {});
}

// Retry once with a fresh bridge connection if the socket dropped (e.g. bridge server restarted)
async function withBridge<T>(fn: (b: BridgeHost) => Promise<T>): Promise<T> {
  try {
    return await fn(await getBridge());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/not connected|ECONNREFUSED|Bridge closed/i.test(msg)) throw err;
    await resetBridge();
    return fn(await getBridge());
  }
}

// The queue outlives bridge reconnects, so it forwards through withBridge instead of holding one socket.
const queue = new JobQueue({
  sendAction: (action, params, timeoutMs, browser) => withBridge((b) => b.sendAction(action, params, timeoutMs, browser)),
});

const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const strList = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined);

function configFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (body.mode) options.mode = body.mode;
  if (body.aspectRatio) options.aspectRatio = body.aspectRatio;
  if (body.count) options.count = Number(body.count);
  if (body.model) options.model = body.model;
  if (body.agent !== undefined) options.agent = body.agent;
  return options;
}

// Mirrors the CLI `prompt` command / MCP flow_send_prompt: configure, let Flow settle, then send.
async function sendPrompt(body: Record<string, unknown>) {
  const site = str(body.site) ?? 'Google Flow';
  const browser = str(body.browser);
  const prompt = applyTechnique(String(body.prompt || ''), str(body.technique));
  if (!prompt.trim()) throw new Error('prompt is required');
  const options = configFromBody(body);
  let configResult;
  if (Object.keys(options).length) {
    configResult = await withBridge((b) => b.sendAction('flow_config', { options, site }, 30000, browser));
    await waitForConfigSettle();
  }
  const promptResult = await withBridge((b) => b.sendAction('send_prompt', { prompt, site, autoSend: body.autoSend !== false }, 30000, browser));
  return { configResult, promptResult };
}

function generate(body: Record<string, unknown>) {
  const scenes = Array.isArray(body.scenes) ? (body.scenes as Scene[]) : [];
  if (!scenes.length || scenes.some((s) => !s || typeof s.prompt !== 'string' || !s.prompt.trim())) {
    throw new Error('scenes must be a non-empty array and every scene needs a prompt.');
  }
  for (const scene of scenes) applyTechnique(scene.prompt, scene.technique);
  const jobs = queue.add(scenes, {
    site: str(body.site) ?? 'Google Flow',
    browser: str(body.browser),
    download: body.download !== false,
    folder: str(body.folder),
    timeoutSeconds: typeof body.timeoutSeconds === 'number' ? body.timeoutSeconds : undefined,
  });
  return { queued: jobs.map((j) => ({ id: j.id, stem: j.stem })), queue: queue.summary() };
}

async function download(body: Record<string, unknown>) {
  const site = str(body.site) ?? 'Google Flow';
  const browser = str(body.browser);
  const media = await withBridge((b) => scanMedia(b, site, browser));
  let urls = strList(body.urls) ?? [];
  const latest = Number(body.latest ?? 0);
  if (!urls.length && latest > 0) {
    const type = str(body.type);
    urls = media.filter((m) => !type || m.type === type).slice(-latest).map((m) => m.url);
  }
  if (!urls.length) throw new Error('Pass urls, or latest with a number of items to download.');
  const byUrl = new Map(media.map((m) => [m.url, m]));
  const items = urls.map((url) => byUrl.get(url) ?? { url, type: 'image' });
  const names = mediaFileNames(items, str(body.name) ?? 'media', str(body.folder));
  return { results: await withBridge((b) => downloadMedia(b, names, site, browser)) };
}

const POST_ROUTES: Record<string, (body: Record<string, unknown>) => unknown> = {
  '/api/prompt': sendPrompt,
  '/api/generate': generate,
  '/api/download': download,
  '/api/jobs/cancel': (body) => {
    const ids = strList(body.ids) ?? queue.list().filter((j) => j.status === 'queued').map((j) => j.id);
    return { cancelled: ids.map((id) => queue.cancel(id)).filter(Boolean).map((j) => ({ id: j!.id, status: j!.status })) };
  },
  '/api/jobs/retry': (body) => {
    const ids = strList(body.ids) ?? queue.list().filter((j) => j.status === 'failed').map((j) => j.id);
    return { retried: ids.map((id) => queue.retry(id)).filter(Boolean).map((j) => ({ id: j!.id, status: j!.status })) };
  },
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === '/api/browsers' && req.method === 'GET') {
      try {
        const browsers = await withBridge((b) => b.listBrowsers());
        return json({ success: true, data: browsers });
      } catch (err) {
        return json({ success: false, error: errorMessage(err) }, 502);
      }
    }

    if (url.pathname === '/api/techniques' && req.method === 'GET') {
      return json({ success: true, data: TECHNIQUES });
    }

    if (url.pathname === '/api/jobs' && req.method === 'GET') {
      return json({ success: true, data: { jobs: queue.list(), queue: queue.summary() } });
    }

    const route = req.method === 'POST' ? POST_ROUTES[url.pathname] : undefined;
    if (route) {
      let body: Record<string, unknown>;
      try {
        body = (await req.json()) ?? {};
      } catch {
        return json({ success: false, error: 'Invalid JSON body' }, 400);
      }
      try {
        return json({ success: true, data: await route(body) });
      } catch (err) {
        return json({ success: false, error: errorMessage(err) }, 502);
      }
    }

    if (url.pathname === '/api/action' && req.method === 'POST') {
      let body: { action?: string; params?: Record<string, unknown>; browser?: string; timeoutMs?: number };
      try {
        body = await req.json();
      } catch {
        return json({ success: false, error: 'Invalid JSON body' }, 400);
      }
      const { action, params = {}, browser, timeoutMs = 30000 } = body;
      // Bun closes requests idle for 10s; the bridge's timeoutMs bounds this one instead
      server.timeout(req, 0);
      if (!action || !ALLOWED_ACTIONS.has(action)) {
        return json({ success: false, error: `Unsupported action: ${action}` }, 400);
      }
      try {
        const data = await withBridge((b) => b.sendAction(action, params, timeoutMs, browser || undefined));
        return json({ success: true, data });
      } catch (err) {
        return json({ success: false, error: errorMessage(err) }, 502);
      }
    }

    if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });

    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (path.includes('..')) return new Response('Not Found', { status: 404 });
    const file = Bun.file(join(PUBLIC_DIR, path));
    if (await file.exists()) return new Response(file);
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Prompt Pilot Web running on http://${HOST}:${PORT}`);
getBridge().catch((err) => console.error(`[Web] Bridge not ready yet: ${errorMessage(err)}`));
