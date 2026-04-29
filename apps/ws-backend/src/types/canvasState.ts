export type StrokePoint = {
  x: number;
  y: number;
};

export type Stroke = {
  strokeId: string;
  userId: string;
  points: StrokePoint[];
  color: string;
  width: number;
  createdAt: number;
};

export type CanvasState = {
  roomId: string;
  strokes: Stroke[];
};
