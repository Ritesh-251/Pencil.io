import { CanvasAction } from "../events/canvas/canvas.types"

const SUPPORTED_CANVAS_TYPES = new Set([
  "stroke",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "image",
  "sticky",
  "frame",
  "text",
])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function getAllowedImageUrlPrefixes(): string[] {
  const raw = process.env.CDN_URL || process.env.IMAGE_CDN_BASE_URL || ""

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

function isAllowedImageUrl(url: string): boolean {
  const prefixes = getAllowedImageUrlPrefixes()

  if (prefixes.length === 0) {
    return false
  }

  return prefixes.some((prefix) => url.startsWith(prefix))
}

function validateTransformConstraints(data: any): string | null {
  if (data?.x !== undefined && !isFiniteNumber(data.x)) return "invalid x"
  if (data?.y !== undefined && !isFiniteNumber(data.y)) return "invalid y"

  if (data?.rotation !== undefined) {
    if (!isFiniteNumber(data.rotation) || Math.abs(data.rotation) > 3600) {
      return "invalid rotation"
    }
  }

  if (data?.opacity !== undefined) {
    if (!isFiniteNumber(data.opacity) || data.opacity < 0 || data.opacity > 1) {
      return "invalid opacity"
    }
  }

  if (data?.scaleX !== undefined) {
    if (!isFiniteNumber(data.scaleX) || data.scaleX <= 0 || data.scaleX > 100) {
      return "invalid scaleX"
    }
  }

  if (data?.scaleY !== undefined) {
    if (!isFiniteNumber(data.scaleY) || data.scaleY <= 0 || data.scaleY > 100) {
      return "invalid scaleY"
    }
  }

  return null
}

function getShapeProps(data: any): any {
  if (data?.props && typeof data.props === "object" && !Array.isArray(data.props)) {
    return data.props
  }

  return data
}

export class CanvasService {
  validateObject(action: CanvasAction, data: any): string | null {
    if (!action) return "Action is required"

    if (data?.type && !SUPPORTED_CANVAS_TYPES.has(data.type)) {
      return `Unsupported object type: ${data.type}`
    }

    if (action === "CREATE_OBJECT") {
      if (!data?.type) return "Object type is required"
    }

    const shape = getShapeProps(data)

    const transformError = validateTransformConstraints(shape)
    if (transformError) return transformError

    if (data?.type === "stroke") {
      if (!Array.isArray(shape.points) || shape.points.length === 0) {
        return "points are required"
      }

      if (shape.points.length > 5000) {
        return "too many points"
      }

      if (!shape.color) return "color is required"

      if (typeof shape.width !== "number" || shape.width <= 0) {
        return "invalid width"
      }
    }

    if (data?.type === "rect") {
      if (typeof shape.width !== "number" || typeof shape.height !== "number") {
        return "invalid rectangle dimensions"
      }

      if (shape.width <= 0 || shape.height <= 0) {
        return "rectangle dimensions must be positive"
      }
    }

    if (data?.type === "ellipse") {
      if (
        typeof shape.width !== "number" ||
        typeof shape.height !== "number" ||
        shape.width <= 0 ||
        shape.height <= 0
      ) {
        return "invalid ellipse dimensions"
      }
    }

    if (data?.type === "line" || data?.type === "arrow") {
      if (!Array.isArray(shape.points) || shape.points.length < 2) {
        return "points are required"
      }
    }

    if (data?.type === "image") {
      const imageUrl = typeof shape.url === "string" ? shape.url : shape.src

      if (typeof imageUrl !== "string" || imageUrl.trim().length === 0) {
        return "image url is required"
      }

      if (imageUrl.startsWith("data:") || imageUrl.startsWith("javascript:")) {
        return "image url is not allowed"
      }

      try {
        const parsed = new URL(imageUrl)
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return "image url must use http or https"
        }
      } catch {
        return "invalid image url"
      }

      if (!isAllowedImageUrl(imageUrl)) {
        return "image url is outside allowed CDN"
      }

      if (imageUrl.length > 2048) {
        return "image url is too long"
      }

      if (
        typeof shape.binary === "string" ||
        typeof shape.base64 === "string" ||
        (typeof shape.data === "string" && shape.data.startsWith("data:"))
      ) {
        return "image binary payloads are not allowed"
      }

      if (
        (shape.width !== undefined && (!isFiniteNumber(shape.width) || shape.width <= 0)) ||
        (shape.height !== undefined && (!isFiniteNumber(shape.height) || shape.height <= 0))
      ) {
        return "invalid image dimensions"
      }
    }

    if (
      data?.type === "sticky"
    ) {
      if (!shape.text || typeof shape.text !== "string") {
        return "sticky note text is required"
      }

      if (shape.text.length > 2000) {
        return "sticky note text is too long"
      }
    }

    if (data?.type === "frame") {
      if (
        !isFiniteNumber(shape.width) ||
        !isFiniteNumber(shape.height) ||
        shape.width <= 0 ||
        shape.height <= 0
      ) {
        return "invalid frame dimensions"
      }
    }

    if (data?.type === "text") {
      if (!shape.text || typeof shape.text !== "string") {
        return "text is required"
      }

      if (shape.text.length > 1000) {
        return "text is too long"
      }
    }

    return null
  }
}

export const canvasService = new CanvasService()