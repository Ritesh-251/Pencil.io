import { ConfirmChannel } from "amqplib";
import { RabbitMQClient } from "@repo/messaging";
import { logger } from "./logger";

export const rabbitClient = new RabbitMQClient({
  url: process.env.RABBITMQ_URL!,
  serviceName: "http-backend",
  logger,
});

rabbitClient.setTopology(async (channel: ConfirmChannel) => {
  await channel.assertExchange("events.exchange", "topic", { durable: true });
  await channel.assertQueue("email.queue", { durable: true });
  await channel.bindQueue("email.queue", "events.exchange", "email.*");
});

export const initRabbitMQ = () => rabbitClient.connect();
export const onRabbitReady = (listener: () => void | Promise<void>) =>
  rabbitClient.onReady(listener);
export const getChannel = () => rabbitClient.getChannel();
