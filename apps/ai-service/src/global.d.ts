import { AiServiceEnv } from "@repo/validation";

declare global {
  namespace NodeJS {
    interface ProcessEnv extends AiServiceEnv {}
  }
}
