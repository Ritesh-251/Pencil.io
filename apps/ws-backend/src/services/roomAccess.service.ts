import { prisma } from "@repo/db";

const ROOM_ACCESS_DENIED = "ROOM_ACCESS_DENIED";

export async function assertRoomMember(userId: string, roomId: string) {
  const membership = await prisma.roomMember.findUnique({
    where: {
      userId_roomId: { userId, roomId },
    },
    select: { userId: true },
  });

  if (!membership) {
    throw new Error(ROOM_ACCESS_DENIED);
  }
}

export function isRoomAccessDeniedError(error: unknown) {
  return error instanceof Error && error.message === ROOM_ACCESS_DENIED;
}
