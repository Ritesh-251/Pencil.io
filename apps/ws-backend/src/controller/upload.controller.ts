import { createImageUploadTicket } from "../services/imageUpload.service"
import { assertRoomMember, isRoomAccessDeniedError } from "../services/roomAccess.service"
import { getUserIdFromAuthHeader } from "../utils/auth.util"
import { normalizeHeaderValue, resolveCorsOrigin } from "../utils/http.util"

type JsonResponseWriter = {
  writeHead: (statusCode: number, headers?: Record<string, string>) => void
  end: (chunk?: string) => void
}

type IncomingRequest = {
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<Buffer | string>
}

function sendJson(req: IncomingRequest, res: JsonResponseWriter, statusCode: number, body: unknown) {
  const origin = resolveCorsOrigin(req)
  if (!origin) {
    res.writeHead(403, {
      "content-type": "application/json",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    })
    res.end(JSON.stringify({ message: "Origin not allowed" }))
    return
  }

  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingRequest, limitBytes = 64 * 1024): Promise<any> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += piece.length

    if (size > limitBytes) {
      throw new Error("request body too large")
    }

    chunks.push(piece)
  }

  const raw = Buffer.concat(chunks).toString("utf-8")
  if (!raw) return {}
  return JSON.parse(raw)
}

export async function handleUploadUrlRequest(req: IncomingRequest, res: JsonResponseWriter) {
  const authHeader = req.headers.authorization
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader
  const userId = getUserIdFromAuthHeader(bearer)

  if (!userId) {
    sendJson(req, res, 401, { message: "Unauthorized" })
    return
  }

  try {
    const body = await readJsonBody(req)
    const { roomId, fileName, contentType, sizeBytes } = body || {}

    if (!roomId || typeof roomId !== "string") {
      sendJson(req, res, 400, { message: "roomId is required" })
      return
    }

    await assertRoomMember(userId, roomId)

    const ticket = createImageUploadTicket({
      roomId,
      userId,
      fileName,
      contentType,
      sizeBytes,
    })

    sendJson(req, res, 200, {
      uploadUrl: ticket.uploadUrl,
      fileUrl: ticket.fileUrl,
      requiredHeaders: ticket.requiredHeaders,
    })
  } catch (error) {
    if (isRoomAccessDeniedError(error)) {
      sendJson(req, res, 403, { message: "Not a member of this room" })
      return
    }

    const message = error instanceof Error ? error.message : "Invalid request"
    sendJson(req, res, 400, { message })
  }
}
