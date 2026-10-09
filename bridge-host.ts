import { WebSocketServer, WebSocket } from 'ws';

export interface BridgeRequest {
  id: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export class BridgeHost {
  private wss: WebSocketServer | null = null;
  private clientWs: WebSocket | null = null;
  private isServer = false;
  private pendingRequests = new Map<string, {
    resolve: (data: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(private port: number = 9988) {}

  async start(): Promise<void> {
    try {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const server = new WebSocketServer({ port: this.port, host: '127.0.0.1' });

      server.on('listening', () => {
        this.wss = server;
        this.isServer = true;
        resolve();
      });

      server.on('error', (err) => {
        reject(err);
      });

      server.on('connection', (ws) => {
        this.clientWs = ws;
        this.setupSocketHandlers(ws);
      });

      await promise;
    } catch (err: unknown) {
      const isAddrInUse = err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE';
      if (isAddrInUse) {
        // Port 9988 is already running (e.g. background server or another CLI)
        // Connect to the existing server as an inter-process bridge client
        await this.connectToExistingServer();
      } else {
        throw err;
      }
    }
  }

  private async connectToExistingServer(): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);

    ws.on('open', () => {
      this.clientWs = ws;
      this.isServer = false;
      this.setupSocketHandlers(ws);
      ws.send(JSON.stringify({ type: 'REGISTER', client: 'cli-worker' }));
      resolve();
    });

    ws.on('error', (err) => {
      reject(err);
    });

    return promise;
  }

  private setupSocketHandlers(ws: WebSocket) {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'REGISTER') return;

        // If this is a server forwarding between extension and CLI clients
        if (this.isServer && msg.id) {
          if (this.wss) {
            for (const client of this.wss.clients) {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data.toString());
              }
            }
          }
        }

        if (msg.id && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          clearTimeout(pending.timer);

          if (msg.success) {
            pending.resolve(msg.data);
          } else {
            pending.reject(new Error(msg.error || 'Request failed'));
          }
        }
      } catch {
        // ignore non-json messages
      }
    });

    ws.on('close', () => {
      if (this.clientWs === ws) {
        this.clientWs = null;
      }
    });
  }

  isConnected(): boolean {
    return this.clientWs !== null && this.clientWs.readyState === WebSocket.OPEN;
  }

  sendAction(action: string, params: Record<string, unknown> = {}, timeoutMs: number = 30000): Promise<unknown> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Extension is not connected. Make sure Chrome/Brave is open with the Prompt Pilot extension enabled.'));
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload: BridgeRequest = { id, action, params };
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();

    const timer = setTimeout(() => {
      this.pendingRequests.delete(id);
      reject(new Error(`Action '${action}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    this.pendingRequests.set(id, { resolve, reject, timer });
    this.clientWs!.send(JSON.stringify(payload));

    return promise;
  }

  async close(): Promise<void> {
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Bridge closed'));
    }
    this.pendingRequests.clear();

    if (this.isServer && this.wss) {
      const { promise, resolve } = Promise.withResolvers<void>();
      this.wss.close(() => resolve());
      await promise;
      this.wss = null;
    } else if (this.clientWs) {
      this.clientWs.close();
      this.clientWs = null;
    }
  }
}
