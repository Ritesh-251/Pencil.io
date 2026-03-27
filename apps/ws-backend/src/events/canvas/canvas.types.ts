export type CanvasAction =
  | "CREATE_OBJECT"
  | "UPDATE_OBJECT"
  | "DELETE_OBJECT"
  | "UNDO"
  | "REDO"

export type CanvasObjectEvent = {
  id: string                
  type: "canvas.object"      
  roomId: string
  userId: string
  timestamp: number
  version: number
  payload: {
    objectId: string
    action: CanvasAction
    data: any
  }
}