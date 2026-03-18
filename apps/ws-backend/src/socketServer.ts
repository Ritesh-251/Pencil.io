import { WebSocketServer } from "ws";
import { SocketManager } from "./socketManager";


export async function startSocketServer(){
    const port = Number(process.env.PORT) || 3002;
    const wss = new WebSocketServer({
    port
  });
  const socketManager = new SocketManager();
  wss.on("connection", (socket, request) => {
    socketManager.handleConnection(socket, request);
  });
  console.log(`WebSocket server running on port ${port}`);
};
