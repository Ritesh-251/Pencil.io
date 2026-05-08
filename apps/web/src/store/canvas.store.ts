import { create } from "zustand";

interface CanvasState {
  objects: Map<string, any>;
  version: number;
  applyUpdate: (payload: any) => void;
  replaceObjects: (nextObjects: Map<string, any>) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  objects: new Map(),
  version: 0,
  replaceObjects: (nextObjects) =>
    set((state) => ({ objects: nextObjects, version: state.version + 1 })),
  applyUpdate: (payload: any) => {
    const { objectId, updates, timestamp } = payload;
    const current = get().objects;

    // Q-1 FIX: Never mutate the existing object reference — Zustand's change
    // detection and React's reconciliation both rely on referential inequality.
    // We shallow-copy both the object and its _hlc sub-map before writing.
    const existingRaw = current.get(objectId);
    const existing = existingRaw
      ? { ...existingRaw, _hlc: { ...(existingRaw._hlc ?? {}) } }
      : { _hlc: {} };

    if (!updates || typeof updates !== "object") return;

    let changed = false;
    for (const key in updates) {
      if ((timestamp || 0) >= (existing._hlc[key] || 0)) {
        existing[key] = updates[key];
        existing._hlc[key] = timestamp;
        changed = true;
      }
    }

    if (changed) {
      const newObjects = new Map(current);
      newObjects.set(objectId, existing);
      set({ objects: newObjects, version: get().version + 1 });
    }
  },
}));
