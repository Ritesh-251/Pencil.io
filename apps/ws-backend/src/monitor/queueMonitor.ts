import { getQueueSize } from "../infra/rabbitmq"
import { setOverloaded } from "./systemLoad"
import { recordDlqDepth } from "./metrics"
import { logger } from "../infra/logger"

const MAX_QUEUE = Number(process.env.MAX_QUEUE || 5000)
const POLL_MS = Number(process.env.QUEUE_MONITOR_INTERVAL_MS || 2000)

let monitorStarted = false

export class BackpressureError extends Error {
  code = "BACKPRESSURE"

  constructor(message = "System overloaded") {
    super(message)
  }
}

export async function assertQueueWritable(queueName: string) {
  const size = await getQueueSize(queueName)
  if (size > MAX_QUEUE) {
    throw new BackpressureError(`Queue ${queueName} overloaded: ${size}`)
  }
}

export function startQueueMonitor() {
  if (monitorStarted) return
  monitorStarted = true

  const run = async () => {
    try {
      const canvasSize = await getQueueSize("canvas.queue")
      const chatSize = await getQueueSize("chat.queue")
      const dlqSize = await getQueueSize("canvas.dlq")
      recordDlqDepth(dlqSize)
      const overloaded = canvasSize > MAX_QUEUE || chatSize > MAX_QUEUE
      setOverloaded(overloaded)

      if (overloaded) {
        logger.error({
          eventId: null,
          roomId: null,
          userId: null,
          type: "SYSTEM_OVERLOAD",
          stage: "consume",
          canvasSize,
          chatSize,
          dlqSize,
          threshold: MAX_QUEUE,
        }, "SYSTEM_OVERLOAD")
      }
    } catch (error) {
      logger.error({ error, stage: "consume", type: "QUEUE_MONITOR_ERROR" }, "Queue monitor failed")
    }
  }

  setInterval(run, POLL_MS)
  setTimeout(run, 1000)
}
