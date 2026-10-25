import { expect, test } from 'bun:test';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import WebSocket from 'ws';

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

test('PM2 HTTP mode serves authenticated MCP and the WebSocket bridge together', async () => {
  const port = await availablePort();
  const token = 'http-test-token';
  const url = `http://127.0.0.1:${port}/mcp`;
  const proc = Bun.spawn([process.execPath, 'run', 'mcp-server.ts', '--http'], {
    cwd: import.meta.dir + '/..',
    env: { ...process.env, PORT: String(port), PROMPT_PILOT_TOKEN: token, PROMPT_PILOT_REMOTE: '' },
    stdout: 'ignore',
    stderr: 'pipe',
  });
  let browser: WebSocket | undefined;
  let client: Client | undefined;
  try {
    let unauthorized: Response | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        unauthorized = await fetch(url, { method: 'POST' });
        break;
      } catch {
        await Bun.sleep(100);
      }
    }
    if (!unauthorized) throw new Error('HTTP MCP server did not start');
    expect(unauthorized.status).toBe(401);
    expect((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);

    browser = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      browser!.once('open', resolve);
      browser!.once('error', reject);
    });
    browser.send(JSON.stringify({ type: 'REGISTER', client: 'chrome-extension', token, browserId: 'abc123def456', browserName: 'Chrome' }));

    client = new Client({ name: 'http-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }));
    expect((await client.listTools()).tools.some((tool) => tool.name === 'browser_list')).toBe(true);
    const result = await client.callTool({ name: 'browser_list', arguments: {} });
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual([
      expect.objectContaining({ id: 'abc123def456', index: 1, name: 'Chrome' }),
    ]);
  } finally {
    await client?.close().catch(() => {});
    browser?.close();
    proc.kill();
    await proc.exited;
  }
});
