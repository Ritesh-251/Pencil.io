import { HttpBackendEnv } from "@repo/validation";

declare global {
  namespace NodeJS {
    interface ProcessEnv extends HttpBackendEnv {}
  }
}
