import { Prisma, prisma } from "@repo/db"

function toPrismaJson(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export async function saveHistory({
  roomId,
  userId,
  action,
  objectId,
  before,
  after,
  version,
}: any) {
  await prisma.canvasActionHistory.create({
    data: {
      roomId,
      userId,
      action,
      objectId,
      before,
      after,
      version,
      createdAt: new Date(),
    },
  })
}

export async function handleUndo(roomId: string, userId: string) {
  const last = await prisma.canvasActionHistory.findFirst({
    where: { roomId, userId },
    orderBy: { version: "desc" },
  })

  if (!last) return null


  if (last.action === "CREATE_OBJECT") {
    await prisma.canvasObject.delete({
      where: { id: last.objectId },
    })
  }

  if (last.action === "DELETE_OBJECT") {
    if (!isRecord(last.before)) return last

    await prisma.canvasObject.create({
      data: last.before as unknown as Prisma.CanvasObjectCreateInput,
    })
  }

  if (last.action === "UPDATE_OBJECT") {
    await prisma.canvasObject.update({
      where: { id: last.objectId },
      data: {
        data: toPrismaJson(last.before),
      },
    })
  }
 
  return last
}