import { WsBackendEnv } from "@repo/validation";

declare global {
  namespace NodeJS {
    interface ProcessEnv extends WsBackendEnv {}
  }
}
