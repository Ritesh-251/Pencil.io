import { CanvasAction } from "../events/canvas/canvas.types"

export class CanvasService {
  validateObject(action: CanvasAction, data: any): string | null {
    if (!action) return "Action is required"

    if (action === "CREATE_OBJECT") {
      if (!data?.type) return "Object type is required"
    }

    if (data?.type === "stroke") {
      if (!Array.isArray(data.points) || data.points.length === 0) {
        return "points are required"
      }

      if (data.points.length > 50) {
        return "too many points"
      }

      if (!data.color) return "color is required"

      if (typeof data.width !== "number" || data.width <= 0) {
        return "invalid width"
      }
    }

    if (data?.type === "rect") {
      if (typeof data.width !== "number" || typeof data.height !== "number") {
        return "invalid rectangle dimensions"
      }
    }

    if (data?.type === "text") {
      if (!data.text || typeof data.text !== "string") {
        return "text is required"
      }
    }

    return null
  }
}

export const canvasService = new CanvasService()