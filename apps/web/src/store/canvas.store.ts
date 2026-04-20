import { create } from 'zustand';

interface CanvasState {
  objects: Map<string, any>;
  applyUpdate: (payload: any) => void;
  replaceObjects: (nextObjects: Map<string, any>) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  objects: new Map(),
  replaceObjects: (nextObjects) => set({ objects: nextObjects }),
  applyUpdate: (payload: any) => {
    const { objectId, updates, timestamp } = payload;
    const current = get().objects;
    const existing = current.get(objectId) || { _hlc: {} };
    
    let changed = false;
    for (const key in updates) {
      if ((timestamp || 0) >= (existing._hlc[key] || 0)) {
        existing[key] = updates[key];
        existing._hlc[key] = timestamp;
        changed = true;
      }
    }
    
    if (changed) {
      const next = new Map(current);
      next.set(objectId, existing);
      set({ objects: next });
    }
  }
}));
