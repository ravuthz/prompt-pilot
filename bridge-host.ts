import { WebSocketServer, WebSocket } from 'ws';

export interface BridgeRequest {
  id: string;
  action: string;
  params?: Record<string, unknown>;
  targetBrowserId?: string;
  token?: string;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
  browserId?: string;
}

export interface ConnectedBrowser {
  id: string;
  ws: WebSocket;
  connectedAt: number;
}

export class BridgeHost {
  private wss: WebSocketServer | null = null;
  private clientWs: WebSocket | null = null;
  private isServer = false;
  private browserMap = new Map<string, ConnectedBrowser>();
  private wsToBrowserId = new Map<WebSocket, string>();
  private authenticatedSockets = new Set<WebSocket>();
  private authToken: string = '';
  private remoteUrl: string = '';
  private pendingRequests = new Map<string, {
    resolve: (data: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    answered: boolean;
  }>();

  constructor(private port: number = 9988, options: { token?: string; remoteUrl?: string } = {}) {
    this.authToken = options.token || process.env.PROMPT_PILOT_TOKEN || '';
    this.remoteUrl = options.remoteUrl || process.env.PROMPT_PILOT_REMOTE || '';
  }

  async start(): Promise<void> {
    // If a remote URL (e.g. wss://prompt.yourdomain.com) is specified, connect directly as remote client
    if (this.remoteUrl) {
      await this.connectToRemoteUrl(this.remoteUrl);
      return;
    }

    try {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const server = new WebSocketServer({ port: this.port });

      server.on('listening', () => {
        this.wss = server;
        this.isServer = true;
        console.error(`[BridgeServer] Listening on port ${this.port} (0.0.0.0 & 127.0.0.1)`);
        if (this.authToken) {
          console.error(`[BridgeServer] Token authentication enabled.`);
        }
        resolve();
      });

      server.on('error', (err) => {
        reject(err);
      });

      server.on('connection', (ws, req) => {
        const remote = req?.socket?.remoteAddress || 'unknown';
        console.error(`[BridgeServer] Client connected from ${remote}`);
        this.setupSocketHandlers(ws);
      });

      await promise;
    } catch (err: unknown) {
      const isAddrInUse = err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE';
      if (isAddrInUse) {
        await this.connectToExistingServer();
      } else {
        throw err;
      }
    }
  }

  private async connectToRemoteUrl(url: string): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const ws = new WebSocket(url);

    ws.on('open', () => {
      this.clientWs = ws;
      this.isServer = false;
      this.setupSocketHandlers(ws);
      ws.send(JSON.stringify({ type: 'REGISTER', client: 'cli-worker', token: this.authToken }));
      resolve();
    });

    ws.on('error', (err) => {
      reject(err);
    });

    return promise;
  }

  private async connectToExistingServer(): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);

    ws.on('open', () => {
      this.clientWs = ws;
      this.isServer = false;
      this.setupSocketHandlers(ws);
      ws.send(JSON.stringify({ type: 'REGISTER', client: 'cli-worker', token: this.authToken }));
      resolve();
    });

    ws.on('error', (err) => {
      reject(err);
    });

    return promise;
  }

  private checkAuth(ws: WebSocket, token?: string): boolean {
    if (!this.authToken) return true;
    if (this.authenticatedSockets.has(ws)) return true;
    if (token === this.authToken) {
      this.authenticatedSockets.add(ws);
      return true;
    }
    return false;
  }

  private setupSocketHandlers(ws: WebSocket) {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Validate token if authentication is enabled
        if (this.isServer && this.authToken && !this.checkAuth(ws, msg.token)) {
          ws.send(JSON.stringify({
            id: msg.id,
            success: false,
            error: 'Authentication failed: Invalid or missing token.'
          }));
          return;
        }

        if (msg.type === 'REGISTER') {
          if (msg.client === 'chrome-extension' || msg.client === 'prompt-pilot-client') {
            let index = 1;
            while (this.browserMap.has(String(index))) {
              index++;
            }
            const bId = String(index);
            this.browserMap.set(bId, { id: bId, ws, connectedAt: Date.now() });
            this.wsToBrowserId.set(ws, bId);
            console.error(`[BridgeServer] Registered browser instance: ${bId} (total active: ${this.browserMap.size})`);
          }
          return;
        }

        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          return;
        }

        if (msg.type === 'PONG') {
          return;
        }

        if (this.isServer) {
          if (msg.action === 'list_browsers') {
            const list = Array.from(this.browserMap.keys());
            ws.send(JSON.stringify({ id: msg.id, success: true, data: list }));
            return;
          }

          if (msg.action) {
            const targetId = msg.targetBrowserId || msg.params?.browser;
            if (targetId && this.browserMap.has(targetId)) {
              const target = this.browserMap.get(targetId);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(data.toString());
              }
            } else {
              for (const [, item] of this.browserMap) {
                if (item.ws !== ws && item.ws.readyState === WebSocket.OPEN) {
                  item.ws.send(data.toString());
                }
              }
            }
          } else if (msg.id && (msg.success !== undefined || msg.error !== undefined)) {
            const senderId = this.wsToBrowserId.get(ws);
            if (senderId && typeof msg === 'object') {
              msg.browserId = senderId;
            }
            if (this.wss) {
              const out = JSON.stringify(msg);
              for (const client of this.wss.clients) {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(out);
                }
              }
            }
          }
        }

        // Handle pending requests
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          if (pending.answered) return;

          if (msg.success) {
            pending.answered = true;
            this.pendingRequests.delete(msg.id);
            clearTimeout(pending.timer);
            const bId = msg.browserId || this.wsToBrowserId.get(ws);
            const enriched = (msg.data && typeof msg.data === 'object') ? { ...msg.data, browserId: bId } : msg.data;
            pending.resolve(enriched);
          } else {
            const remaining = this.browserMap.size;
            if (remaining <= 1) {
              pending.answered = true;
              this.pendingRequests.delete(msg.id);
              clearTimeout(pending.timer);
              pending.reject(new Error(msg.error || 'Request failed'));
            }
          }
        }
      } catch {
        // ignore non-json messages
      }
    });

    ws.on('close', () => {
      this.authenticatedSockets.delete(ws);
      const bId = this.wsToBrowserId.get(ws);
      if (bId) {
        this.browserMap.delete(bId);
        this.wsToBrowserId.delete(ws);
        console.error(`[BridgeServer] Disconnected browser instance: ${bId} (remaining: ${this.browserMap.size})`);
      }
      if (this.clientWs === ws) {
        this.clientWs = null;
      }
    });
  }

  async getConnectedBrowsers(): Promise<string[]> {
    if (this.isServer) {
      return Array.from(this.browserMap.keys());
    }
    const res = await this.sendAction('list_browsers');
    return Array.isArray(res) ? res : [];
  }

  isConnected(): boolean {
    if (this.isServer) {
      for (const [, item] of this.browserMap) {
        if (item.ws.readyState === WebSocket.OPEN) return true;
      }
      return false;
    }
    return this.clientWs !== null && this.clientWs.readyState === WebSocket.OPEN;
  }

  sendAction(action: string, params: Record<string, unknown> = {}, timeoutMs: number = 30000, targetBrowserId?: string): Promise<unknown> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Extension is not connected. Make sure Chrome/Brave is open with the Prompt Pilot extension enabled.'));
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload: BridgeRequest = {
      id,
      action,
      params,
      targetBrowserId,
      token: this.authToken || undefined
    };
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();

    const timer = setTimeout(() => {
      this.pendingRequests.delete(id);
      reject(new Error(`Action '${action}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    this.pendingRequests.set(id, { resolve, reject, timer, answered: false });

    const raw = JSON.stringify(payload);
    if (this.isServer) {
      if (targetBrowserId && this.browserMap.has(targetBrowserId)) {
        const item = this.browserMap.get(targetBrowserId)!;
        if (item.ws.readyState === WebSocket.OPEN) {
          item.ws.send(raw);
        }
      } else {
        for (const [, item] of this.browserMap) {
          if (item.ws.readyState === WebSocket.OPEN) {
            item.ws.send(raw);
          }
        }
      }
    } else if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(raw);
    }

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
