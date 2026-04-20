import { AuthenticatedSocket } from "../types/socket";
import { SocketEvent } from "../types/event";
import { logger } from "../infra/logger";

export class RoomManager {
  private roomSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
  private socketRooms: Map<string, Set<string>> = new Map();

  joinRoom(roomId: string, socket: AuthenticatedSocket) {
    let sockets = this.roomSockets.get(roomId);
    if (!sockets) {
      sockets = new Set();
      this.roomSockets.set(roomId, sockets);
    }
    sockets.add(socket);

    let rooms = this.socketRooms.get(socket.id);
    if (!rooms) {
      rooms = new Set();
      this.socketRooms.set(socket.id, rooms);
    }
    rooms.add(roomId);
    logger.info({ roomId, userId: socket.userId, socketId: socket.id }, "Socket joined room")
  }
  leaveRoom(roomId: string, socket: AuthenticatedSocket) {
    const sockets = this.roomSockets.get(roomId);
    if (sockets) {
      sockets.delete(socket);

      if (sockets.size === 0) {
        this.roomSockets.delete(roomId);
      }
    }
    const rooms = this.socketRooms.get(socket.id);
    if (rooms) {
      rooms.delete(roomId);

      if (rooms.size === 0) {
        this.socketRooms.delete(socket.id);
      }
    }
    logger.info({ roomId, userId: socket.userId, socketId: socket.id }, "Socket left room")
  }
  broadCast(roomId: string, event: SocketEvent) {
    const sockets = this.roomSockets.get(roomId);
    if (!sockets) return;
    const message = JSON.stringify({
      ...event,
      event: event.type,
    });
    for (const socket of sockets) {
      if (socket.readyState !== socket.OPEN) {
        this.removeSocket(socket)
        continue
      }

      try {
        socket.send(message);
      } catch (error) {
        logger.error({
          roomId,
          socketId: socket.id,
          userId: socket.userId,
          error,
        }, "Broadcast send failed")
        this.removeSocket(socket)
      }
    }
  }
  removeSocket(socket: AuthenticatedSocket) {
    const rooms = this.socketRooms.get(socket.id);
    if (!rooms) return;
    for (const roomId of rooms) {
      this.leaveRoom(roomId, socket);
    }
    logger.info({ userId: socket.userId, socketId: socket.id }, "Socket removed from all rooms")
  }
  getRooms(socket: AuthenticatedSocket): Set<string> | undefined {
    return this.socketRooms.get(socket.id);
  }

  isSocketInRoom(socket: AuthenticatedSocket, roomId: string): boolean {
    const rooms = this.socketRooms.get(socket.id)
    return !!rooms && rooms.has(roomId)
  }
}
export const roomManager = new RoomManager();
