import { prisma } from "@repo/db"

// 🔹 VERSION
export async function getNextVersion(roomId: string) {
  const last = await prisma.canvasObject.findFirst({
    where: { roomId },
    orderBy: { version: "desc" },
  })

  return (last?.version || 0) + 1
}

// 🔹 SNAPSHOT
export async function triggerSnapshot(roomId: string, version: number) {
  setImmediate(async () => {
    try {
      const objects = await prisma.canvasObject.findMany({
        where: {
          roomId,
          version: { lte: version },
        },
        orderBy: { version: "asc" },
      })

      await prisma.canvasSnapshot.create({
        data: {
          roomId,
          data: { objects },
          version,
          createdAt: new Date(),
        },
      })

      await prisma.canvasSnapshot.deleteMany({
        where: {
          roomId,
          version: { lt: version - 1000 },
        },
      })

      console.log(`[Snapshot] room=${roomId} version=${version}`)
    } catch (err) {
      console.error("Snapshot error:", err)
    }
  })
}