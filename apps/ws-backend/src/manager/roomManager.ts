import { AuthenticatedSocket } from "../types/socket";
import { SocketEvent } from "../types/event";
import { logger } from "../infra/logger";

export class RoomManager {
  private roomSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
  private socketRooms: Map<string, Set<string>> = new Map();
  private roomUsers: Map<string, Map<string, Set<string>>> = new Map();
  private batchBuffer: Map<string, any[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;

  private flushBatches() {
    this.batchTimer = null;
    const currentBatches = this.batchBuffer;
    this.batchBuffer = new Map();

    for (const [roomId, events] of currentBatches.entries()) {
      const sockets = this.roomSockets.get(roomId);
      if (!sockets || events.length === 0) continue;

      const message = JSON.stringify(events);
      const dead: AuthenticatedSocket[] = [];

      for (const socket of sockets) {
        if (socket.readyState !== socket.OPEN) {
          dead.push(socket);
          continue;
        }
        try {
          socket.send(message);
        } catch (error) {
          logger.error(
            {
              roomId,
              socketId: socket.id,
              userId: socket.userId,
              error,
            },
            "Broadcast send failed",
          );
          dead.push(socket);
        }
      }

      for (const socket of dead) {
        this.removeSocket(socket);
      }
    }
  }

  joinRoom(roomId: string, socket: AuthenticatedSocket) {
    let sockets = this.roomSockets.get(roomId);
    if (!sockets) {
      sockets = new Set();
      this.roomSockets.set(roomId, sockets);
    }
    sockets.add(socket);

    let users = this.roomUsers.get(roomId);
    if (!users) {
      users = new Map();
      this.roomUsers.set(roomId, users);
    }

    const userId = socket.userId;
    let wasFirstSocket = false;
    if (userId) {
      const userSockets = users.get(userId) ?? new Set<string>();
      wasFirstSocket = userSockets.size === 0;
      userSockets.add(socket.id);
      users.set(userId, userSockets);
    }

    let rooms = this.socketRooms.get(socket.id);
    if (!rooms) {
      rooms = new Set();
      this.socketRooms.set(socket.id, rooms);
    }
    rooms.add(roomId);
    logger.info(
      { roomId, userId: socket.userId, socketId: socket.id },
      "Socket joined room",
    );
    return wasFirstSocket;
  }

  leaveRoom(roomId: string, socket: AuthenticatedSocket) {
    const userId = socket.userId;
    const sockets = this.roomSockets.get(roomId);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        this.roomSockets.delete(roomId);
      }
    }

    let wasLastSocket = false;
    if (userId) {
      const users = this.roomUsers.get(roomId);
      const userSockets = users?.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        wasLastSocket = userSockets.size === 0;
        if (wasLastSocket) {
          users?.delete(userId);
        }
      }
      if (users && users.size === 0) {
        this.roomUsers.delete(roomId);
      }
    }

    const rooms = this.socketRooms.get(socket.id);
    if (rooms) {
      rooms.delete(roomId);
      if (rooms.size === 0) {
        this.socketRooms.delete(socket.id);
      }
    }
    logger.info(
      { roomId, userId: socket.userId, socketId: socket.id },
      "Socket left room",
    );
    return wasLastSocket;
  }

  broadCast(roomId: string, event: SocketEvent) {
    const sockets = this.roomSockets.get(roomId);
    if (!sockets) return;
    const message = JSON.stringify({
      ...event,
      event: event.type,
    });

    // BUG-3 FIX: Collect dead sockets during iteration and clean them up
    // afterwards.  Calling removeSocket() inside the loop would call leaveRoom()
    // on all rooms that socket is in — mutating the very Set we are iterating
    // and potentially orphaning presence state for other rooms.
    const dead: AuthenticatedSocket[] = [];

    for (const socket of sockets) {
      if (socket.readyState !== socket.OPEN) {
        dead.push(socket);
        continue;
      }
      try {
        socket.send(message);
      } catch (error) {
        logger.error(
          {
            roomId,
            socketId: socket.id,
            userId: socket.userId,
            error,
          },
          "Broadcast send failed",
        );
        dead.push(socket);
      }
    }

    for (const socket of dead) {
      this.removeSocket(socket);
    }
  }

  removeSocket(socket: AuthenticatedSocket) {
    const rooms = this.socketRooms.get(socket.id);
    if (!rooms) return;
    const offlineRoomIds: string[] = [];
    for (const roomId of Array.from(rooms)) {
      if (this.leaveRoom(roomId, socket)) {
        offlineRoomIds.push(roomId);
      }
    }
    logger.info(
      { userId: socket.userId, socketId: socket.id },
      "Socket removed from all rooms",
    );
    return offlineRoomIds;
  }

  getRooms(socket: AuthenticatedSocket): Set<string> | undefined {
    return this.socketRooms.get(socket.id);
  }

  isSocketInRoom(socket: AuthenticatedSocket, roomId: string): boolean {
    const rooms = this.socketRooms.get(socket.id);
    return !!rooms && rooms.has(roomId);
  }

  getOnlineUsers(roomId: string) {
    const users = this.roomUsers.get(roomId);
    if (!users) return [];
    return Array.from(users.keys()).map((id) => ({ id, name: "Online User" }));
  }
}

export const roomManager = new RoomManager();
