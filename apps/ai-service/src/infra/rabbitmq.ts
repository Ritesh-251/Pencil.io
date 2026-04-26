import { ConfirmChannel } from "amqplib";
import { RabbitMQClient } from "@repo/messaging";
import { logger } from "./logger";

export const rabbitClient = new RabbitMQClient({
  url: process.env.RABBITMQ_URL!,
  serviceName: "ai-service",
  logger,
});

rabbitClient.setTopology(async (channel: ConfirmChannel) => {
  await channel.assertQueue("ai:ingest", { durable: true });
});

export const initRabbitMQ = () => rabbitClient.connect();
export const onRabbitReady = (listener: () => void | Promise<void>) => rabbitClient.onReady(listener);
export const getChannel = () => rabbitClient.getChannel();
