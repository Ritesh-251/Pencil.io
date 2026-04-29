// Token is sent as the first WebSocket message
// {"type":"auth","payload":{"token":"..."}} after onopen. The server responds
// with {"type":"auth:ok"} before normal traffic.
//
// Q-9 FIX (revised): listeners.clear() was removed from disconnect() because
// calling disconnect() inside connect() would wipe the listeners the room page
// had just registered — preventing ws:connected from ever firing and showing
// "Realtime disconnected" immediately.  Instead, the on() method returns an
// unsubscribe function; callers must call it in their useEffect cleanup, which
// the room page already does correctly.

export class WSClient {
  private static instance: WSClient;
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(payload: any) => void>>();
  private currentRoomId: string | null = null;
  private pendingMessages: Array<object> = [];
  private currentToken: string | null = null;
  private isAuthorized = false;

  private constructor() {}

  static getInstance() {
    if (!WSClient.instance) WSClient.instance = new WSClient();
    return WSClient.instance;
  }

  connect(roomId: string, token: string) {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING) &&
      this.currentRoomId === roomId
    ) {
      // Already connected or connecting to this room — just refresh the token
      // reference in case it was silently rotated.
      this.currentToken = token;
      return;
    }

    // Close any stale connection without clearing listeners so the room page
    // can still hear auth:ok / ws:connected from the fresh socket below.
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.currentRoomId = roomId;
    this.currentToken = token;
    this.pendingMessages = [];
    this.isAuthorized = false;

    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3003";
    const finalUrl = WS_URL.startsWith("/")
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${WS_URL}`
      : WS_URL;

    this.ws = new WebSocket(finalUrl);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: "auth", payload: { token } }));
    };

    this.ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        const msgs = Array.isArray(parsed) ? parsed : [parsed];

        for (const msg of msgs) {
          const event = msg?.type || msg?.event;
          if (!event) continue;

          if (event === "auth:ok") {
            this.isAuthorized = true;
            for (const message of this.pendingMessages) {
              this.ws?.send(JSON.stringify(message));
            }
            this.pendingMessages = [];
            this.emit("ws:connected", {});
            continue;
          }

          this.emit(event, msg.payload);
        }
      } catch {
        this.emit("ws:error", { message: "Invalid websocket message" });
      }
    };

    this.ws.onerror = () => {
      this.emit("ws:error", {});
    };

    this.ws.onclose = (event) => {
      this.isAuthorized = false;
      this.emit("ws:disconnect", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    };
  }

  sendCanvas(payload: any) {
    this.send("canvas:draw", payload);
  }

  getRoomId() {
    return this.currentRoomId;
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(event: string, payload: any) {
    // Use the same wire format the server's EventRouter expects: { type, payload }
    const message = { type: event, payload };

    // BUG-1 FIX: Even if the socket is OPEN, we must wait for auth:ok before
    // sending normal traffic, otherwise the server will see a non-auth message
    // as its first frame and close the connection.
    if (!this.isAuthorized || this.ws?.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(message);
      // Cap the pending queue so we don't buffer unbounded messages offline.
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
    // Return an unsubscribe function — callers MUST call this in useEffect
    // cleanup to prevent listener accumulation across remounts.
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: string, payload: any) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }

  disconnect() {
    if (this.ws) {
      // Detach handlers before closing so the onclose event doesn't emit
      // ws:disconnect to callers that are in the middle of tearing down.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.currentRoomId = null;
    this.currentToken = null;
    this.pendingMessages = [];
    this.isAuthorized = false;
    // NOTE: listeners are intentionally NOT cleared here.  The room page
    // registers listeners before calling connectSocket() (which calls
    // disconnect() internally).  Clearing them here would silently drop all
    // event handlers and prevent ws:connected from ever being heard.
    // Callers are responsible for calling the unsubscribe functions returned
    // by on() in their useEffect cleanup — the room page already does this.
  }
}
