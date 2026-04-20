import { LogicalTimestamp } from "../../crdt/hlc"

export type CanvasAction =
  | "CREATE_OBJECT"
  | "UPDATE_OBJECT"
  | "DELETE_OBJECT"


export type CanvasObjectEvent = {
  id: string
  type: "canvas.draw"
  roomId: string
  userId: string
  timestamp: number

  payload: {
    objectId: string
    action: CanvasAction
    data: any
    timestamp: LogicalTimestamp
    baseVersion?: number 
  }
}