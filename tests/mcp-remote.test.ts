import { afterEach, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketServer } from 'ws';

let client: Client | undefined;
let wss: WebSocketServer | undefined;

afterEach(async () => {
  await client?.close();
  await new Promise<void>((resolve) => wss?.close(() => resolve()) ?? resolve());
  client = undefined;
  wss = undefined;
});

test('stdio MCP connects to a remote authenticated bridge', async () => {
  const token = 'test-bridge-token';
  const messages: Record<string, unknown>[] = [];
  wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss!.once('listening', resolve));
  wss.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      messages.push(message);
      if (message.action === 'list_browsers') {
        socket.send(JSON.stringify({ id: message.id, success: true, data: ['1'] }));
      }
    });
  });

  const address = wss.address();
  if (!address || typeof address === 'string') throw new Error('Missing test bridge port');
  const transport = new StdioClientTransport({
    command: import.meta.dir + '/../mcp.sh',
    cwd: '/tmp',
    env: {
      ...process.env,
      PROMPT_PILOT_REMOTE: `ws://127.0.0.1:${address.port}`,
      PROMPT_PILOT_TOKEN: token,
    } as Record<string, string>,
    stderr: 'pipe',
  });
  client = new Client({ name: 'prompt-pilot-test', version: '1.0.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  expect(tools.tools.some((tool) => tool.name === 'browser_list')).toBe(true);
  const result = await client.callTool({ name: 'browser_list', arguments: {} });
  expect(result.isError).not.toBe(true);
  expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual([{ id: '1', index: 1 }]);
  expect(messages).toContainEqual({ type: 'REGISTER', client: 'cli-worker', token });
  expect(messages).toContainEqual(expect.objectContaining({ action: 'list_browsers', token }));
});
