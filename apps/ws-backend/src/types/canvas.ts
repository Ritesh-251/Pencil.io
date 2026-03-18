export type CanvasDrawPayload = {
  strokeId: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
};
export type CanvasDrawEvent = {
  type: "canvas:draw";
  roomId: string;
  payload: CanvasDrawPayload;
};