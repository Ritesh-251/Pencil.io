import { useCallback, useState } from "react";
import { ViewState, MIN_ZOOM, MAX_ZOOM } from "../canvasPane.shared";

export const useCanvasView = (initialView?: Partial<ViewState>) => {
  const [view, setView] = useState<ViewState>({
    scale: initialView?.scale ?? 1,
    offsetX: initialView?.offsetX ?? 0,
    offsetY: initialView?.offsetY ?? 0,
  });

  const screenToWorld = useCallback(
    (x: number, y: number) => ({
      x: (x - view.offsetX) / view.scale,
      y: (y - view.offsetY) / view.scale,
    }),
    [view],
  );

  const worldToScreen = useCallback(
    (x: number, y: number) => ({
      x: x * view.scale + view.offsetX,
      y: y * view.scale + view.offsetY,
    }),
    [view],
  );

  const zoomAtPoint = useCallback(
    (screenX: number, screenY: number, deltaScale: number) => {
      setView((v) => {
        const nextScale = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, v.scale * deltaScale),
        );
        if (nextScale === v.scale) return v;

        // The world point under the pointer should remain under the pointer after zoom
        // Screen = World * Scale + Offset
        // World = (Screen - Offset) / Scale
        const worldX = (screenX - v.offsetX) / v.scale;
        const worldY = (screenY - v.offsetY) / v.scale;

        const nextOffsetX = screenX - worldX * nextScale;
        const nextOffsetY = screenY - worldY * nextScale;

        return { scale: nextScale, offsetX: nextOffsetX, offsetY: nextOffsetY };
      });
    },
    [],
  );

  const pan = useCallback((dx: number, dy: number) => {
    setView((v) => ({
      ...v,
      offsetX: v.offsetX + dx,
      offsetY: v.offsetY + dy,
    }));
  }, []);

  return {
    view,
    setView,
    screenToWorld,
    worldToScreen,
    zoomAtPoint,
    pan,
  };
};
