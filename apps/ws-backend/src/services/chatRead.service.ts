import { prisma } from "@repo/db";

export async function getRecentRoomMessages(roomId: string, take = 50) {
  const messages = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take,
  });

  return messages.reverse();
}
