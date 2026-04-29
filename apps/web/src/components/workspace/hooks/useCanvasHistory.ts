import { useRef, useState, useCallback } from "react";
import { HistoryEntry } from "../canvasPane.shared";

type HistoryOptions = {
  objects: Map<string, any>;
  upsertObject: (id: string, updates: any) => void;
  sendCanvasEvent: (id: string, action: any, type: string, props: any) => void;
};

export const useCanvasHistory = ({
  objects,
  upsertObject,
  sendCanvasEvent,
}: HistoryOptions) => {
  const historyUndoRef = useRef<HistoryEntry[]>([]);
  const historyRedoRef = useRef<HistoryEntry[]>([]);
  const historyApplyRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const cloneHistoryObject = (obj: any): Record<string, any> | null => {
    if (!obj || typeof obj !== "object") return null;
    const copy = { ...obj };
    delete (copy as any)._hlc;
    return JSON.parse(JSON.stringify(copy));
  };

  const nextHistoryGroupId = () =>
    `grp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const recordHistory = useCallback(
    (
      entry: Omit<HistoryEntry, "groupId" | "createdAt"> & { groupId?: string },
    ) => {
      if (historyApplyRef.current) return;
      historyUndoRef.current.push({
        ...entry,
        groupId: entry.groupId || nextHistoryGroupId(),
        createdAt: Date.now(),
      });
      if (historyUndoRef.current.length > 300) {
        historyUndoRef.current = historyUndoRef.current.slice(-300);
      }
      historyRedoRef.current = [];
      setHistoryVersion((v) => v + 1);
    },
    [],
  );

  const applyHistoryTarget = useCallback(
    (
      entry: HistoryEntry,
      target: "before" | "after",
      options?: { broadcast?: boolean },
    ) => {
      const snapshot = target === "before" ? entry.before : entry.after;
      const current = objects.get(entry.objectId);
      const broadcast = options?.broadcast ?? true;

      historyApplyRef.current = true;
      try {
        if (!snapshot) {
          if (!current) return;
          const deleted: Record<string, any> = {
            ...cloneHistoryObject(current),
            deleted: true,
          };
          upsertObject(entry.objectId, deleted);
          if (broadcast) {
            sendCanvasEvent(
              entry.objectId,
              "UPDATE_OBJECT",
              deleted.type || "shape",
              deleted,
            );
          }
          return;
        }

        const next: Record<string, any> = {
          ...snapshot,
          deleted: false,
        };
        upsertObject(entry.objectId, next);
        if (broadcast) {
          sendCanvasEvent(
            entry.objectId,
            current ? "UPDATE_OBJECT" : "CREATE_OBJECT",
            next.type || "shape",
            next,
          );
        }
      } finally {
        historyApplyRef.current = false;
      }
    },
    [objects, upsertObject, sendCanvasEvent],
  );

  const undo = useCallback(() => {
    const popHistoryGroup = (stack: HistoryEntry[]) => {
      const last = stack[stack.length - 1];
      if (!last) return [] as HistoryEntry[];
      const groupId = last.groupId;
      const group: HistoryEntry[] = [];
      while (stack.length > 0 && stack[stack.length - 1]?.groupId === groupId) {
        const item = stack.pop();
        if (item) group.push(item);
      }
      return group;
    };

    const group = popHistoryGroup(historyUndoRef.current);
    if (group.length === 0) return;
    group.forEach((entry) =>
      applyHistoryTarget(entry, "before", { broadcast: true }),
    );
    historyRedoRef.current.push(...group.reverse());
    setHistoryVersion((v) => v + 1);
  }, [applyHistoryTarget]);

  const redo = useCallback(() => {
    const popHistoryGroup = (stack: HistoryEntry[]) => {
      const last = stack[stack.length - 1];
      if (!last) return [] as HistoryEntry[];
      const groupId = last.groupId;
      const group: HistoryEntry[] = [];
      while (stack.length > 0 && stack[stack.length - 1]?.groupId === groupId) {
        const item = stack.pop();
        if (item) group.push(item);
      }
      return group;
    };

    const group = popHistoryGroup(historyRedoRef.current);
    if (group.length === 0) return;
    group
      .reverse()
      .forEach((entry) =>
        applyHistoryTarget(entry, "after", { broadcast: true }),
      );
    historyUndoRef.current.push(...group);
    setHistoryVersion((v) => v + 1);
  }, [applyHistoryTarget]);

  return {
    historyVersion,
    recordHistory,
    undo,
    redo,
    canUndo: historyUndoRef.current.length > 0,
    canRedo: historyRedoRef.current.length > 0,
    cloneHistoryObject,
    nextHistoryGroupId,
    applyHistoryTarget,
    historyUndoRef,
  };
};
