#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BridgeHost } from './bridge-host';

const bridge = new BridgeHost(9988);

const server = new Server(
  {
    name: 'prompt-pilot-bridge-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'flow_send_prompt',
        description: 'Send an image or video generation prompt to the open Google Flow (or other AI platform) tab in Chrome.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The text prompt to generate an image or video.',
            },
            site: {
              type: 'string',
              description: 'Target platform name or URL fragment (e.g. "Google Flow", "ChatGPT", "Claude"). Defaults to "Google Flow".',
            },
            autoSend: {
              type: 'boolean',
              description: 'Whether to automatically click Generate / Send (true) or just type the prompt into the input box (false). Default: true.',
            },
            mode: {
              type: 'string',
              enum: ['image', 'video'],
              description: 'Set generation mode before prompting ("image" or "video").',
            },
            aspectRatio: {
              type: 'string',
              description: 'Set aspect ratio before prompting (e.g. "16:9", "9:16", "1:1").',
            },
            count: {
              type: 'number',
              description: 'Set number of images/videos to generate (e.g. 1, 2, 4).',
            },
            model: {
              type: 'string',
              description: 'Select generative model name (e.g. "Veo", "Imagen", "Nano Banana").',
            },
            agent: {
              type: 'boolean',
              description: 'Toggle Google Flow Agent mode (true to enable, false to disable).',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'flow_configure',
        description: 'Configure Google Flow settings: toggle Agent mode, switch Image/Video, set aspect ratio, generation count, or select model.',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['image', 'video'],
              description: 'Switch between "image" and "video" generation.',
            },
            aspectRatio: {
              type: 'string',
              description: 'Set aspect ratio (e.g. "16:9", "9:16", "1:1").',
            },
            count: {
              type: 'number',
              description: 'Number of generations (e.g. 1, 2, 4).',
            },
            model: {
              type: 'string',
              description: 'Target model name (e.g. "Veo", "Imagen", "Nano Banana Pro").',
            },
            agent: {
              type: 'boolean',
              description: 'Set Agent mode enabled (true) or disabled (false).',
            },
          },
        },
      },
      {
        name: 'flow_state',
        description: 'Inspect active Google Flow toggles, selected options, and prompt box visibility.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'flow_scan_media',
        description: 'Scan generated media (images, videos, music links) from the active AI tab in Chrome.',
        inputSchema: {
          type: 'object',
          properties: {
            site: {
              type: 'string',
              description: 'Target platform name or URL substring to scan. Defaults to active tab or Google Flow.',
            },
          },
        },
      },
      {
        name: 'flow_upscale',
        description: 'Trigger Google Flow video upscaling on the open Google Flow tab.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'flow_open_project',
        description: 'Open an existing project or create a new project in Google Flow so the prompt input box is visible.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'tab_detect',
        description: 'Detect which AI tool or chat platform is open on the current browser tab and its readiness.',
        inputSchema: {
          type: 'object',
          properties: {
            site: {
              type: 'string',
              description: 'Optional site search filter (e.g. "Google Flow", "Suno", "Gemini").',
            },
          },
        },
      },
      {
        name: 'tab_list',
        description: 'List all open browser tabs available for prompt automation.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!bridge.isConnected()) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Error: Prompt Pilot Chrome extension is not connected. Please ensure Chrome is open with Prompt Pilot extension enabled.',
        },
      ],
    };
  }

  try {
    switch (name) {
      case 'flow_send_prompt': {
        const prompt = String(args?.prompt || '');
        const site = typeof args?.site === 'string' ? args.site : 'Google Flow';
        const autoSend = args?.autoSend !== false;

        const configOptions: Record<string, unknown> = {};
        if (args?.mode) configOptions.mode = args.mode;
        if (args?.aspectRatio) configOptions.aspectRatio = args.aspectRatio;
        if (args?.count) configOptions.count = args.count;
        if (args?.model) configOptions.model = args.model;
        if (args?.agent !== undefined) configOptions.agent = args.agent;

        let configResult;
        if (Object.keys(configOptions).length > 0) {
          configResult = await bridge.sendAction('flow_config', { options: configOptions, site });
        }

        const result = await bridge.sendAction('send_prompt', { prompt, site, autoSend });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ configResult, promptResult: result }, null, 2),
            },
          ],
        };
      }

      case 'flow_configure': {
        const site = typeof args?.site === 'string' ? args.site : 'Google Flow';
        const options: Record<string, unknown> = {};
        if (args?.mode) options.mode = args.mode;
        if (args?.aspectRatio) options.aspectRatio = args.aspectRatio;
        if (args?.count) options.count = args.count;
        if (args?.model) options.model = args.model;
        if (args?.agent !== undefined) options.agent = args.agent;

        const result = await bridge.sendAction('flow_config', { options, site });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'flow_state': {
        const result = await bridge.sendAction('flow_state');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'flow_scan_media': {
        const site = typeof args?.site === 'string' ? args.site : 'Google Flow';
        const result = await bridge.sendAction('scan_media', { site });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'flow_upscale': {
        const result = await bridge.sendAction('upscale_flow');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      case 'flow_open_project': {
        const result = await bridge.sendAction('open_flow_project');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'tab_detect': {
        const site = typeof args?.site === 'string' ? args.site : undefined;
        const result = await bridge.sendAction('detect', { site });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'tab_list': {
        const result = await bridge.sendAction('list_tabs');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Tool execution failed: ${errorMsg}`,
        },
      ],
    };
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
