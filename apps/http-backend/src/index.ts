import dotenv from "dotenv";
dotenv.config();

import { prisma } from "@repo/db";
import { app } from "./app";

const PORT = process.env.PORT;
async function startServer() {
  try {
    await prisma.$connect();
    console.log("Postgres client connected");
    app.listen(PORT, () => {
      console.log(`Server is running at Port at ${PORT}`);
    });
  } catch (error) {
    console.log("DB connection failed:", error);
    process.exit(1);
  }
}

startServer();
