import amqp, { Channel, Connection } from "amqplib"

let channel: Channel

export async function initRabbitMQ() {
  const connection: Connection = await amqp.connect(process.env.RABBITMQ_URL!)

  channel = await connection.createChannel()

  await channel.assertExchange("events.exchange", "topic", {
    durable: true,
  })

  // queues
  await channel.assertQueue("chat.queue", { durable: true })
  await channel.assertQueue("broadcast.queue", { durable: true })

  // bindings
  await channel.bindQueue("chat.queue", "events.exchange", "chat.message")
  await channel.bindQueue("broadcast.queue", "events.exchange", "chat.message")

  console.log("[RabbitMQ] Connected")
}

export function getChannel() {
  if (!channel) throw new Error("RabbitMQ not initialized")
  return channel
}