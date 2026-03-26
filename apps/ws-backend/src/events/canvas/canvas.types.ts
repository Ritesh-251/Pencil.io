export type CanvasEventType =
  | "DRAW_STROKE"
  | "CREATE_OBJECT"
  | "UPDATE_OBJECT"
  | "DELETE_OBJECT"
  | "CLEAR_CANVAS"

export type BaseCanvasEvent = {
  eventId: string
  roomId: string
  userId: string
  type: CanvasEventType
  timestamp: number
}

export type DrawStrokeEvent = BaseCanvasEvent & {
  type: "DRAW_STROKE"
  strokeId: string
  points: { x: number; y: number }[]
  color: string
  width: number
}

export type CanvasEvent = DrawStrokeEvent
// future: | CreateObjectEvent | UpdateObjectEvent | ...
