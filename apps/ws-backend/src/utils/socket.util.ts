import { AuthenticatedSocket } from "../types/socket"

export function sendSocketError(
  socket: AuthenticatedSocket,
  message: string,
  extra?: Record<string, unknown>,
) {
  socket.send(
    JSON.stringify({
      type: "error",
      event: "error",
      payload: {
        message,
        ...(extra || {}),
      },
    }),
  )
}

export function sendSocketCodedError(
  socket: AuthenticatedSocket,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendSocketError(socket, message, {
    code,
    ...(extra || {}),
  })
}
