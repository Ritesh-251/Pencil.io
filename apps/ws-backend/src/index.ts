import dotenv from "dotenv";
dotenv.config();
import { initRabbitMQ } from "./infra/rabbitmq"
import { startChatConsumer } from "./consumers/chat.consumer"
import { startBroadcastConsumer } from "./consumers/broadcast.consumer"
import { startCanvasConsumer } from "./consumers/canvas.consumer"
import { prisma } from "@repo/db";
import { startSocketServer } from "./socketServer";
import { initRedis, pubsub } from "./infra/redis";
import { roomManager } from "./manager/roomManager";
async function bootstrap() {
  try {
    await prisma.$connect();
    console.log("Postgres connected");

    await initRedis();
    console.log("Redis connected");
    await initRabbitMQ()   // ✅ NEW

  // start consumers
  await startChatConsumer()
  await startBroadcastConsumer()
  await startCanvasConsumer()

  

    pubsub.subscribe((event) => {
      roomManager.broadCast(event.roomId, event.payload);
    });

    await startSocketServer();
  } catch (err) {
    console.error("Server failed to start:", err);
    process.exit(1);
  }
}

bootstrap();
