import crypto from "crypto"

type CreateUploadTicketInput = {
  roomId: string
  userId: string
  fileName: string
  contentType: string
  sizeBytes?: number
}

type UploadTicket = {
  uploadUrl: string
  fileUrl: string
  objectKey: string
  expiresInSeconds: number
  expiresAt: number
  requiredHeaders: Record<string, string>
}

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const DEFAULT_UPLOAD_TTL_SECONDS = 15 * 60
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
])

const DEFAULT_UPLOAD_SIGNING_SECRET_FALLBACK = "dev-upload-secret"

function sanitizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function resolveUrl(templateOrBase: string, key: string): string {
  if (templateOrBase.includes("{key}")) {
    return templateOrBase.replace("{key}", encodeURIComponent(key))
  }

  const base = templateOrBase.replace(/\/$/, "")
  return `${base}/${key}`
}

function getUploadSigningSecret() {
  return (
    process.env.IMAGE_UPLOAD_SIGNING_SECRET ||
    process.env.ACCESS_TOKEN_SECRET ||
    DEFAULT_UPLOAD_SIGNING_SECRET_FALLBACK
  )
}

function buildUploadSignaturePayload(input: {
  objectKey: string
  contentType: string
  expiresAt: number
  userId: string
}) {
  return `${input.objectKey}:${input.contentType}:${input.expiresAt}:${input.userId}`
}

function signUploadPayload(payload: string) {
  return crypto
    .createHmac("sha256", getUploadSigningSecret())
    .update(payload)
    .digest("hex")
}

export function verifyImageUploadTicketForPut(input: {
  objectKey: string
  contentType: string
  expiresAt: number
  userId: string
  signature: string
}) {
  if (!input.signature || typeof input.signature !== "string") return false
  if (!Number.isFinite(input.expiresAt)) return false
  if (Date.now() > input.expiresAt) return false
  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.contentType)) return false

  const payload = buildUploadSignaturePayload({
    objectKey: input.objectKey,
    contentType: input.contentType,
    expiresAt: input.expiresAt,
    userId: input.userId,
  })
  const expected = signUploadPayload(payload)

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature))
  } catch {
    return false
  }
}

export function createImageUploadTicket(input: CreateUploadTicketInput): UploadTicket {
  if (!input.roomId || typeof input.roomId !== "string") {
    throw new Error("roomId is required")
  }

  if (!input.fileName || typeof input.fileName !== "string") {
    throw new Error("fileName is required")
  }

  if (!input.userId || typeof input.userId !== "string") {
    throw new Error("userId is required")
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.contentType)) {
    throw new Error("unsupported contentType")
  }

  const maxUploadBytes = Number(process.env.IMAGE_MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES)
  if (input.sizeBytes !== undefined && input.sizeBytes > maxUploadBytes) {
    throw new Error(`file exceeds max upload size (${maxUploadBytes} bytes)`)
  }

  const uploadBase = process.env.IMAGE_UPLOAD_BASE_URL
  const cdnBase = process.env.IMAGE_CDN_BASE_URL

  if (!uploadBase || !cdnBase) {
    throw new Error("image upload is not configured")
  }

  const safeFileName = sanitizeFileName(input.fileName)
  const extension = safeFileName.includes(".")
    ? safeFileName.split(".").pop()
    : undefined
  const extSuffix = extension ? `.${extension}` : ""
  const objectKey = `rooms/${input.roomId}/${Date.now()}-${crypto.randomUUID()}${extSuffix}`

  const uploadUrl = resolveUrl(uploadBase, objectKey)
  const fileUrl = resolveUrl(cdnBase, objectKey)
  const expiresInSeconds = Number(
    process.env.IMAGE_UPLOAD_TTL_SECONDS || DEFAULT_UPLOAD_TTL_SECONDS
  )
  const expiresAt = Date.now() + expiresInSeconds * 1000
  const uploadToken = signUploadPayload(
    buildUploadSignaturePayload({
      objectKey,
      contentType: input.contentType,
      expiresAt,
      userId: input.userId,
    })
  )

  return {
    uploadUrl,
    fileUrl,
    objectKey,
    expiresInSeconds,
    expiresAt,
    requiredHeaders: {
      "content-type": input.contentType,
      "x-upload-token": uploadToken,
      "x-upload-expires": String(expiresAt),
      "x-upload-content-type": input.contentType,
    },
  }
}
