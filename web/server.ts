#!/usr/bin/env bun
import { join } from 'node:path';
import { BridgeHost } from '../bridge-host';

const PORT = Number(process.env.WEB_PORT || 9990);
const HOST = process.env.WEB_HOST || '127.0.0.1';
const BRIDGE_PORT = Number(process.env.PORT || 9988);
const PUBLIC_DIR = join(import.meta.dir, 'public');

// Same actions the CLI and MCP server forward to the extension
const ALLOWED_ACTIONS = new Set([
  'detect',
  'list_tabs',
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

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/api/browsers' && req.method === 'GET') {
      try {
        const browsers = await withBridge((b) => b.getConnectedBrowsers());
        return json({ success: true, data: browsers });
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
