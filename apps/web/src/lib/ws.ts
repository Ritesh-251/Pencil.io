export class WSClient {
  private static instance: WSClient;
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(payload: any) => void>>();
  private currentRoomId: string | null = null;
  private pendingMessages: Array<{ event: string; payload: any }> = [];
  private currentToken: string | null = null;

  private constructor() {}

  static getInstance() {
    if (!WSClient.instance) WSClient.instance = new WSClient();
    return WSClient.instance;
  }

  connect(roomId: string, token: string) {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) &&
      this.currentRoomId === roomId
    ) {
      this.currentRoomId = roomId;
      this.currentToken = token;
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CLOSING)) {
      this.disconnect();
    }

    this.currentRoomId = roomId;
    this.currentToken = token;
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3003';
    this.ws = new WebSocket(`${WS_URL}?roomId=${roomId}&token=${token}`);

    this.ws.onopen = () => {
      if (this.pendingMessages.length > 0) {
        for (const message of this.pendingMessages) {
          this.ws?.send(JSON.stringify(message));
        }
        this.pendingMessages = [];
      }
      this.emit('ws:connected', {});
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const event = msg?.event || msg?.type;
        if (!event) return;
        this.emit(event, msg.payload);
      } catch {
        this.emit('ws:error', { message: 'Invalid websocket message' });
      }
    };

    this.ws.onerror = () => {
      this.emit('ws:error', {});
    };

    this.ws.onclose = (event) => {
      this.emit('ws:disconnect', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    };
  }

  sendCanvas(payload: any) {
    this.send('canvas:draw', payload);
  }

  getRoomId() {
    return this.currentRoomId;
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(event: string, payload: any) {
    const message = { event, payload };
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(message);
      if (this.pendingMessages.length > 100) {
        this.pendingMessages.shift();
      }
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  on(event: string, callback: (payload: any) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: string, payload: any) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentRoomId = null;
    this.currentToken = null;
    this.pendingMessages = [];
  }
}
