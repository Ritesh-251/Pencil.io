export interface SocketEvent {
  type: string;
  payload?: any;
}
export type Event<T = any> = {
  id: string
  type: string
  roomId: string
  userId: string
  timestamp: number
  version: number
  payload: T
}