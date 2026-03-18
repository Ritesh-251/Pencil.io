import { AuthenticatedSocket } from "../types/socket";
import { SocketEvent } from "../types/event";

export class RoomManager{
    
    private roomSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
    private socketRooms: Map<string, Set<string>> = new Map();

    joinRoom(roomId:string,socket:AuthenticatedSocket,){

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
    console.log(`Socket ${socket.userId} joined room ${roomId}`);

    }
    leaveRoom(roomId:string,socket:AuthenticatedSocket){
      const sockets = this.roomSockets.get(roomId);
      if(sockets){
        sockets.delete(socket);
      
      if (sockets.size === 0) {
        this.roomSockets.delete(roomId);
      }}
      const rooms = this.socketRooms.get(socket.id);
      if (rooms) {
      rooms.delete(roomId);

      if (rooms.size === 0) {
        this.socketRooms.delete(socket.id);
      }
    }
    console.log(`Socket ${socket.userId} left room ${roomId}`);
    }
    broadCast(roomId:string,event:SocketEvent){
      const sockets = this.roomSockets.get(roomId);
        if (!sockets) return;
      const message = JSON.stringify(event);
      for (const socket of sockets) {

      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }

    }

    }
    removeSocket(socket:AuthenticatedSocket){
    const rooms = this.socketRooms.get(socket.id);
    if (!rooms) return;
    for (const roomId of rooms) { this.leaveRoom(roomId, socket); }
      console.log(`Socket ${socket.userId} removed from all rooms`);
    }
    getRooms(socket: AuthenticatedSocket): Set<string> | undefined {
  return this.socketRooms.get(socket.id);
}
}
export const roomManager = new RoomManager();