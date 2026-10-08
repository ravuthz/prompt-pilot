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
  private client: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (data: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(private port: number = 9988) {}

  start(): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.wss = new WebSocketServer({ port: this.port, host: '127.0.0.1' });

    this.wss.on('listening', () => resolve());
    this.wss.on('error', (err) => reject(err));

    this.wss.on('connection', (ws) => {
      this.client = ws;

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'REGISTER') return;

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
        if (this.client === ws) {
          this.client = null;
        }
      });
    });

    return promise;
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  sendAction(action: string, params: Record<string, unknown> = {}, timeoutMs: number = 30000): Promise<unknown> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Extension is not connected. Make sure Chrome is open with the Prompt Pilot extension enabled.'));
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload: BridgeRequest = { id, action, params };
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();

    const timer = setTimeout(() => {
      this.pendingRequests.delete(id);
      reject(new Error(`Action '${action}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    this.pendingRequests.set(id, { resolve, reject, timer });
    this.client!.send(JSON.stringify(payload));

    return promise;
  }

  async close(): Promise<void> {
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Bridge closed'));
    }
    this.pendingRequests.clear();

    if (this.wss) {
      const { promise, resolve } = Promise.withResolvers<void>();
      this.wss.close(() => resolve());
      await promise;
      this.wss = null;
    }
  }
}
