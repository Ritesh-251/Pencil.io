import WebSocket from "ws";

export interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  id: string;
  isAuthenticating?: boolean;
}
