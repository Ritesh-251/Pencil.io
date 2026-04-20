import amqp, { ChannelModel, ConfirmChannel } from "amqplib"
import { logger } from "./logger"

let channel: ConfirmChannel
let connection: ChannelModel | null = null
let rabbitHealthy = false
let reconnectTimer: NodeJS.Timeout | null = null
let reconnecting = false
const readyListeners = new Set<() => void | Promise<void>>()

const RECONNECT_DELAY_MS = Number(process.env.RABBITMQ_RECONNECT_DELAY_MS || 2000)

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function setupTopology(activeChannel: ConfirmChannel) {
  activeChannel.prefetch(Number(process.env.CONSUMER_PREFETCH || 50))

  await activeChannel.assertExchange("events.exchange", "topic", {
    durable: true,
  })
  await activeChannel.assertExchange("dlx.exchange", "topic", {
    durable: true,
  })

  // queues
  await activeChannel.assertQueue("chat.queue", { durable: true })
  await activeChannel.assertQueue("broadcast.queue", { durable: true })
  await activeChannel.assertQueue("canvas.queue", {
    durable: true,
    deadLetterExchange: "dlx.exchange",
    deadLetterRoutingKey: "canvas.draw",
  })
  await activeChannel.assertQueue("canvas.dlq", { durable: true })

  // bindings
  await activeChannel.bindQueue("chat.queue", "events.exchange", "chat.message")
  await activeChannel.bindQueue("broadcast.queue", "events.exchange", "chat.message")
  await activeChannel.bindQueue("canvas.queue", "events.exchange", "canvas.draw")
  await activeChannel.bindQueue("canvas.queue", "events.exchange", "canvas.undo")
  await activeChannel.bindQueue("canvas.queue", "events.exchange", "canvas.redo")
  await activeChannel.bindQueue("canvas.dlq", "dlx.exchange", "canvas.draw")
}

function scheduleReconnect(reason: string) {
  if (reconnecting || reconnectTimer) return

  rabbitHealthy = false
  reconnecting = true

  logger.error({ reason }, "RabbitMQ disconnected, scheduling reconnect")

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connectWithRetry().finally(() => {
      reconnecting = false
    })
  }, RECONNECT_DELAY_MS)
}

async function connectWithRetry() {
  while (true) {
    try {
      connection = await amqp.connect(process.env.RABBITMQ_URL!)

      connection.on("close", () => {
        scheduleReconnect("connection-closed")
      })

      connection.on("error", (error) => {
        logger.error({ err: error }, "RabbitMQ connection error")
        scheduleReconnect("connection-error")
      })

      channel = await connection.createConfirmChannel()

      channel.on("close", () => {
        scheduleReconnect("channel-closed")
      })

      channel.on("error", (error) => {
        logger.error({ err: error }, "RabbitMQ channel error")
        scheduleReconnect("channel-error")
      })

      await setupTopology(channel)
      await Promise.all(
        Array.from(readyListeners).map(async (listener) => {
          try {
            await listener()
          } catch (error) {
            logger.error({ err: error }, "RabbitMQ ready listener failed")
          }
        }),
      )

      rabbitHealthy = true
      logger.info("RabbitMQ connected")
      return
    } catch (error) {
      rabbitHealthy = false
      logger.error({ err: error }, "RabbitMQ connect failed, retrying")
      await sleep(RECONNECT_DELAY_MS)
    }
  }
}

export async function initRabbitMQ() {
  await connectWithRetry()
}

export function onRabbitReady(listener: () => void | Promise<void>) {
  readyListeners.add(listener)
  return () => {
    readyListeners.delete(listener)
  }
}

export function getChannel() {
  if (!channel) throw new Error("RabbitMQ not initialized")
  return channel
}

export async function getQueueSize(queueName: string) {
  if (!channel) throw new Error("RabbitMQ not initialized")
  const result = await channel.checkQueue(queueName)
  return result.messageCount
}

export async function getQueueStats(queueName: string) {
  if (!channel) throw new Error("RabbitMQ not initialized")
  const result = await channel.checkQueue(queueName)
  return {
    messageCount: result.messageCount,
    consumerCount: result.consumerCount,
  }
}

export function isRabbitMQHealthy() {
  return rabbitHealthy
}