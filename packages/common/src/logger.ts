import pino, { Logger } from "pino";

export type { Logger };

export const createLogger = (serviceName: string): Logger => {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          }
        : undefined,
  });
};
