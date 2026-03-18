import { AuthenticatedSocket } from "../types/socket";
import { prisma } from "@repo/db";


function sendError(socket: AuthenticatedSocket, message: string) {
  socket.send(JSON.stringify({
    type: "error",
    payload: { message }
  }));
}

export const handleChatHistory = async function(socket:AuthenticatedSocket,payload:any) {
     if (!payload || typeof payload !== "object") {
  return sendError(socket, "Invalid payload");
}
const {roomId} = payload;
if (!roomId) {
  return sendError(socket, "roomId is required");
}

try {
     const membership = await prisma.roomMember.findUnique({
          where: {
            userId_roomId: {
              userId: socket.userId,
              roomId
            }
          }
        });
    
        if (!membership) {
          return sendError(socket, "Not a member of this room");
        }
         const messages = await prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    const orderedMessages = messages.reverse();
     socket.send(JSON.stringify({
      type: "chat:history",
      payload: {
        messages: orderedMessages
      }
    }));
    
} catch (error) {
    console.error("Chat history error:", error);
    sendError(socket, "Internal server error");
    
}

    
}