import { DrawStrokeEvent } from "../events/canvas/canvas.types"

export class CanvasService {
  /**
   * Validates a draw stroke event payload.
   * Returns an error message string, or null if valid.
   */
  validateStroke(event: DrawStrokeEvent): string | null {
    if (!event.strokeId || typeof event.strokeId !== "string") {
      return "strokeId is required"
    }
    if (!Array.isArray(event.points) || event.points.length === 0) {
      return "points are required"
    }
    if (event.points.length > 50) {
      return "too many points in a single stroke"
    }
    if (!event.color || typeof event.color !== "string") {
      return "color is required"
    }
    if (typeof event.width !== "number" || event.width <= 0) {
      return "width must be a positive number"
    }
    return null
  }
}

export const canvasService = new CanvasService()
