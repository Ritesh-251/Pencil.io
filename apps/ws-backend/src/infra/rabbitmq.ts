import { ConfirmChannel } from "amqplib";
import { RabbitMQClient } from "@repo/messaging";
import { logger } from "./logger";

export const rabbitClient = new RabbitMQClient({
  url: process.env.RABBITMQ_URL!,
  serviceName: "ws-backend",
  logger: {
    info: (msg: string) => logger.info(msg),
    error: (msg: string, meta?: any) => logger.error(meta, msg),
  },
});

rabbitClient.setTopology(async (channel: ConfirmChannel) => {
  channel.prefetch(Number(process.env.CONSUMER_PREFETCH || 50));

  await channel.assertExchange("events.exchange", "topic", { durable: true });
  await channel.assertExchange("dlx.exchange", "topic", { durable: true });

  await channel.assertQueue("chat.queue", { durable: true });
  await channel.assertQueue("broadcast.queue", { durable: true });
  await channel.assertQueue("canvas.queue", {
    durable: true,
    deadLetterExchange: "dlx.exchange",
    deadLetterRoutingKey: "canvas.draw",
  });
  await channel.assertQueue("canvas.dlq", { durable: true });

  await channel.bindQueue("chat.queue", "events.exchange", "chat.message");
  await channel.bindQueue("broadcast.queue", "events.exchange", "chat.message");
  await channel.bindQueue("canvas.queue", "events.exchange", "canvas.draw");
  await channel.bindQueue("canvas.queue", "events.exchange", "canvas.undo");
  await channel.bindQueue("canvas.queue", "events.exchange", "canvas.redo");
  await channel.bindQueue("canvas.dlq", "dlx.exchange", "canvas.draw");
});

export const initRabbitMQ = () => rabbitClient.connect();
export const onRabbitReady = (listener: () => void | Promise<void>) => rabbitClient.onReady(listener);
export const getChannel = () => rabbitClient.getChannel();
export const isRabbitMQHealthy = () => rabbitClient.getStatus().healthy;

export async function getQueueSize(queueName: string) {
  const result = await rabbitClient.getChannel().checkQueue(queueName);
  return result.messageCount;
}

export async function getQueueStats(queueName: string) {
  const result = await rabbitClient.getChannel().checkQueue(queueName);
  return {
    messageCount: result.messageCount,
    consumerCount: result.consumerCount,
  };
}
