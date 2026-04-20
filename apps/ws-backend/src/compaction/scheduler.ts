import { compactAllRooms } from "./runCompaction"
import { logger } from "../infra/logger"

let started = false

export function startCompactionScheduler() {
  if (started) return
  started = true

  const run = async () => {
    try {
      const results = await compactAllRooms({ minEvents: 10_000 })
      const changed = results.filter((r) => r.compacted > 0)
      if (changed.length > 0) {
        logger.info({ changed }, "Compaction completed")
      }
    } catch (error) {
      logger.error({ err: error }, "Compaction failed")
    }
  }

  // Run once after startup and then periodically.
  setTimeout(run, 30_000)
  setInterval(run, 5 * 60 * 1000)
}
