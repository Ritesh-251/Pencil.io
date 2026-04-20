'use client';

import {
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'next/navigation';
import { WSClient } from '@/lib/ws';
import { useCanvasStore } from '@/store/canvas.store';

const TOOLS = [
  { id: 'select', label: 'Select', symbol: 'Sel' },
  { id: 'draw', label: 'Pen', symbol: 'Pen' },
  { id: 'erase', label: 'Erase', symbol: 'Ers' },
  { id: 'arrow', label: 'Arrow', symbol: 'Arr' },
  { id: 'rectangle', label: 'Rectangle', symbol: 'Rect' },
  { id: 'ellipse', label: 'Ellipse', symbol: 'Circ' },
  { id: 'text', label: 'Text', symbol: 'Text' },
  { id: 'sticky', label: 'Sticky', symbol: 'Note' },
  { id: 'image', label: 'Image', symbol: 'Img' },
] as const;

type CanvasTool = 'draw' | 'erase' | 'arrow' | 'rectangle' | 'ellipse' | 'text' | 'select' | 'sticky' | 'image';

type DraftState = {
  objectId: string;
  tool: CanvasTool;
  startX: number;
  startY: number;
  lastEmitAt?: number;
};

type DragState = {
  objectId: string;
  pointerStartX: number;
  pointerStartY: number;
  objectStart: Record<string, any>;
  mode?: 'move' | 'resize';
  handle?:
    | 'nw'
    | 'n'
    | 'ne'
    | 'e'
    | 'se'
    | 's'
    | 'sw'
    | 'w'
    | 'arrow-start'
    | 'arrow-end';
  lastEmitAt?: number;
};

type TextDraft = {
  x: number;
  y: number;
  value: string;
  fontSize: number;
};

type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type SelectionBox = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type ObjectEditDraft = {
  objectId: string;
  kind: 'text' | 'sticky';
  x: number;
  y: number;
  value: string;
  fontSize?: number;
};

type HistoryEntry = {
  objectId: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  groupId: string;
  createdAt: number;
};

const CANVAS_EMIT_INTERVAL_MS = 40;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ERASER_RADIUS = 14;
const HANDLE_SIZE = 10;
const TEXT_SIZE_OPTIONS = [16, 22, 30] as const;

function measureTextBounds(value: string, fontSize: number) {
  const lines = value.split(/\n/g);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.max(60, Math.round(longest * fontSize * 0.62));
  const height = Math.max(
    Math.round(fontSize * 1.4),
    Math.round(lines.length * fontSize * 1.24 + 4),
  );
  return { width, height };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getUploadApiBase() {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3003';
  if (wsUrl.startsWith('wss://')) return wsUrl.replace('wss://', 'https://');
  if (wsUrl.startsWith('ws://')) return wsUrl.replace('ws://', 'http://');
  return wsUrl;
}

function canLoadImageUrl(url: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), 4000);
    img.onload = () => {
      clearTimeout(timer);
      finish(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    img.src = url;
  });
}

export const CanvasPane = () => {
  const params = useParams<{ roomId: string }>();
  const roomId = params?.roomId;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textDraftInputRef = useRef<HTMLTextAreaElement>(null);
  const dprRef = useRef(1);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pendingImagePointRef = useRef<{ x: number; y: number } | null>(null);
  const wheelDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const wheelZoomRef = useRef<{ x: number; y: number; deltaY: number } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);

  const objects = useCanvasStore((s) => s.objects);
  const applyUpdate = useCanvasStore((s) => s.applyUpdate);
  const replaceObjects = useCanvasStore((s) => s.replaceObjects);

  const isDrawing = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const draftRef = useRef<DraftState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const historyUndoRef = useRef<HistoryEntry[]>([]);
  const historyRedoRef = useRef<HistoryEntry[]>([]);
  const historyApplyRef = useRef(false);
  const selectedObjectIdRef = useRef<string | null>(null);
  const selectedObjectIdsRef = useRef<string[]>([]);
  const drawGroupIdRef = useRef<string | null>(null);
  const eraseVisitedRef = useRef<Set<string>>(new Set());
  const eraseLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const selectionBoxRef = useRef<SelectionBox | null>(null);

  const [activeTool, setActiveTool] = useState<CanvasTool>('draw');
  const [strokeColor, setStrokeColor] = useState('#0d5bd7');
  const [brushSize, setBrushSize] = useState(3);
  const [textSize, setTextSize] = useState<number>(TEXT_SIZE_OPTIONS[1]);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [caretVisible, setCaretVisible] = useState(true);
  const [editingObject, setEditingObject] = useState<ObjectEditDraft | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [view, setView] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (!textDraft) {
      setCaretVisible(true);
      return;
    }

    const timer = window.setInterval(() => {
      setCaretVisible((prev) => !prev);
    }, 500);

    return () => window.clearInterval(timer);
  }, [textDraft]);

  useEffect(() => {
    if (!textDraft) return;

    const raf = window.requestAnimationFrame(() => {
      const input = textDraftInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });

    return () => window.cancelAnimationFrame(raf);
  }, [textDraft]);

  const drawableObjects = useMemo(() => Array.from(objects.values()), [objects]);
  const canUndo = historyUndoRef.current.length > 0;
  const canRedo = historyRedoRef.current.length > 0;

  const getActiveRoomId = () => roomId ?? WSClient.getInstance().getRoomId();

  const setSelectedObject = (objectId: string | null) => {
    selectedObjectIdRef.current = objectId;
    setSelectedObjectId(objectId);
    const nextIds = objectId ? [objectId] : [];
    selectedObjectIdsRef.current = nextIds;
    setSelectedObjectIds(nextIds);
  };

  const setSelectedObjects = (objectIds: string[]) => {
    const unique = Array.from(new Set(objectIds)).filter(Boolean);
    selectedObjectIdsRef.current = unique;
    setSelectedObjectIds(unique);
    const primary: string | null = unique.length > 0 ? unique[0]! : null;
    selectedObjectIdRef.current = primary;
    setSelectedObjectId(primary);
  };

  const getPointerPosition = (e: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

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

  const upsertObject = useCallback(
    (objectId: string, updates: Record<string, any>) => {
      applyUpdate({ objectId, updates, timestamp: Date.now() });
    },
    [applyUpdate],
  );

  const sendCanvasEvent = (
    objectId: string,
    action: 'CREATE_OBJECT' | 'UPDATE_OBJECT',
    dataType: string,
    props: Record<string, any>,
  ) => {
    const activeRoomId = getActiveRoomId();
    if (!activeRoomId) return;

    WSClient.getInstance().sendCanvas({
      roomId: activeRoomId,
      objectId,
      action,
      data: {
        type: dataType,
        props,
      },
    });
  };

  const cloneHistoryObject = (obj: any): Record<string, any> | null => {
    if (!obj || typeof obj !== 'object') return null;
    const copy = { ...obj };
    delete (copy as any)._hlc;
    return JSON.parse(JSON.stringify(copy));
  };

  const nextHistoryGroupId = () => `grp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const recordHistory = (entry: Omit<HistoryEntry, 'groupId' | 'createdAt'> & { groupId?: string }) => {
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
  };

  const applyHistoryTarget = (entry: HistoryEntry, target: 'before' | 'after', options?: { broadcast?: boolean }) => {
    const snapshot = target === 'before' ? entry.before : entry.after;
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
          sendCanvasEvent(entry.objectId, 'UPDATE_OBJECT', deleted.type || 'shape', deleted);
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
          current ? 'UPDATE_OBJECT' : 'CREATE_OBJECT',
          next.type || 'shape',
          next,
        );
      }
    } finally {
      historyApplyRef.current = false;
    }
  };

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

  const undo = () => {
    const group = popHistoryGroup(historyUndoRef.current);
    if (group.length === 0) return;
    group.forEach((entry) => applyHistoryTarget(entry, 'before', { broadcast: true }));
    historyRedoRef.current.push(...group.reverse());
    setHistoryVersion((v) => v + 1);
  };

  const redo = () => {
    const group = popHistoryGroup(historyRedoRef.current);
    if (group.length === 0) return;
    group.reverse().forEach((entry) => applyHistoryTarget(entry, 'after', { broadcast: true }));
    historyUndoRef.current.push(...group);
    setHistoryVersion((v) => v + 1);
  };

  const replayRecent = async () => {
    const history = [...historyUndoRef.current].slice(-50);
    if (history.length === 0) return;

    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i];
      if (!entry) continue;
      applyHistoryTarget(entry, 'before', { broadcast: false });
    }

    for (const entry of history) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      applyHistoryTarget(entry, 'after', { broadcast: false });
    }
  };

  const deleteObjectById = (objectId: string, groupId?: string) => {
    const existing = objects.get(objectId);
    if (!existing || existing.deleted) return false;

    const before = cloneHistoryObject(existing);
    const deleted = {
      ...existing,
      deleted: true,
    };

    upsertObject(objectId, deleted);
    sendCanvasEvent(objectId, 'UPDATE_OBJECT', deleted.type || 'shape', deleted);
    recordHistory({
      objectId,
      before,
      after: null,
      groupId,
    });
    return true;
  };

  const insertImageObject = (url: string, point?: { x: number; y: number } | null) => {
    const target = point ?? pendingImagePointRef.current;
    const fallback = screenToWorld(
      (containerRef.current?.clientWidth || 400) / 2,
      (containerRef.current?.clientHeight || 300) / 2,
    );
    const at = target ?? fallback;

    const objectId = `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const props = {
      id: objectId,
      type: 'image',
      x: at.x,
      y: at.y,
      width: 240,
      height: 180,
      url,
    };

    upsertObject(objectId, props);
    sendCanvasEvent(objectId, 'CREATE_OBJECT', 'image', props);
    recordHistory({ objectId, before: null, after: cloneHistoryObject(props) });
    pendingImagePointRef.current = null;
  };

  const uploadImageAndInsert = async (file: File) => {
    const activeRoomId = getActiveRoomId();
    if (!activeRoomId) {
      setImageStatus('No active room selected');
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setImageStatus('Session expired. Sign in again.');
      return;
    }

    setUploadingImage(true);
    setImageStatus('Uploading image...');

    try {
      const ticketRes = await fetch(`${getUploadApiBase()}/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roomId: activeRoomId,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });

      const ticketPayload = await ticketRes.json().catch(() => ({}));
      if (!ticketRes.ok) {
        throw new Error(ticketPayload?.message || 'Could not get upload URL');
      }

      const uploadUrl = ticketPayload?.uploadUrl;
      const fileUrl = ticketPayload?.fileUrl;
      const requiredHeaders = ticketPayload?.requiredHeaders || {};

      if (!uploadUrl || !fileUrl) {
        throw new Error('Upload endpoint returned invalid payload');
      }

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          ...requiredHeaders,
          'content-type': file.type,
          Authorization: `Bearer ${token}`,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Image upload failed');
      }

      const imageAccessible = await canLoadImageUrl(fileUrl);
      if (!imageAccessible) {
        throw new Error('Upload succeeded but image URL is not publicly reachable (404). Check IMAGE_CDN_BASE_URL.');
      }

      insertImageObject(fileUrl);
      setImageStatus('Image added');
      setTimeout(() => setImageStatus(null), 1500);
    } catch (error: any) {
      setImageStatus(error?.message || 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const onImageSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void uploadImageAndInsert(file);
    e.target.value = '';
  };

  const commitTextDraft = () => {
    if (!textDraft) return;
    const value = textDraft.value.replace(/\r\n/g, '\n');
    const { x, y, fontSize } = textDraft;
    setTextDraft(null);
    if (!value.trim()) return;

    const bounds = measureTextBounds(value, fontSize);

    const objectId = `text-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const props = {
      id: objectId,
      type: 'text',
      x,
      y,
      text: value,
      color: strokeColor,
      fontSize,
      width: bounds.width,
      height: bounds.height,
    };

    upsertObject(objectId, props);
    sendCanvasEvent(objectId, 'CREATE_OBJECT', 'text', props);
    recordHistory({ objectId, before: null, after: cloneHistoryObject(props) });
  };

  const commitObjectEdit = () => {
    if (!editingObject) return;

    const object = objects.get(editingObject.objectId);
    const before = cloneHistoryObject(object);
    const nextText = editingObject.value.replace(/\r\n/g, '\n');
    setEditingObject(null);
    if (!object || !nextText.trim()) return;

    const fontSize =
      editingObject.kind === 'text'
        ? (editingObject.fontSize ?? Number(object.fontSize || textSize))
        : Number(object.fontSize || textSize);
    const bounds =
      editingObject.kind === 'text'
        ? measureTextBounds(nextText, fontSize)
        : { width: Number(object.width || 180), height: Number(object.height || 140) };

    const nextProps = {
      ...object,
      text: nextText,
      ...(editingObject.kind === 'text'
        ? {
            fontSize,
            width: bounds.width,
            height: bounds.height,
          }
        : {}),
    };

    upsertObject(editingObject.objectId, nextProps);
    sendCanvasEvent(
      editingObject.objectId,
      'UPDATE_OBJECT',
      editingObject.kind,
      nextProps,
    );
    recordHistory({
      objectId: editingObject.objectId,
      before,
      after: cloneHistoryObject(nextProps),
    });
  };

  const drawObject = useCallback((ctx: CanvasRenderingContext2D, obj: any) => {
    if (obj?.deleted) return;

    const type = obj?.type ?? 'stroke';
    const color = obj?.color || '#0d5bd7';
    const width = typeof obj?.width === 'number' ? obj.width : 2;
    const strokeWidth = typeof obj?.strokeWidth === 'number' ? obj.strokeWidth : 2;

    if (type === 'rect') {
      if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return;
      if (typeof obj.width !== 'number' || typeof obj.height !== 'number') return;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, strokeWidth);
      drawRoundedRect(ctx, obj.x, obj.y, obj.width, obj.height, Math.max(8, strokeWidth * 2));
      if (obj.fill && obj.fill !== 'transparent') {
        ctx.fillStyle = obj.fill;
        ctx.fill();
      }
      ctx.stroke();
      return;
    }

    if (type === 'ellipse') {
      if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return;
      if (typeof obj.width !== 'number' || typeof obj.height !== 'number') return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, strokeWidth);
      ctx.ellipse(
        obj.x + obj.width / 2,
        obj.y + obj.height / 2,
        Math.abs(obj.width / 2),
        Math.abs(obj.height / 2),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      return;
    }

    if (type === 'text') {
      if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return;
      if (typeof obj.text !== 'string') return;
      const fontSize = typeof obj.fontSize === 'number' ? obj.fontSize : 16;
      const lines = obj.text.split(/\n/g);
      ctx.fillStyle = color;
      ctx.textBaseline = 'top';
      ctx.font = `${fontSize}px "Virgil", "Comic Sans MS", "Bradley Hand", cursive`;
      const lineHeight = Math.round(fontSize * 1.24);
      lines.forEach((line: string, index: number) => {
        ctx.fillText(line, obj.x, obj.y + index * lineHeight);
      });
      return;
    }

    if (type === 'sticky') {
      const x = Number(obj.x);
      const y = Number(obj.y);
      const widthPx = typeof obj.width === 'number' ? obj.width : 180;
      const heightPx = typeof obj.height === 'number' ? obj.height : 140;
      const fill = obj.fill || '#fde68a';
      const border = obj.border || '#e7b008';
      const text = typeof obj.text === 'string' ? obj.text : 'Sticky note';

      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      ctx.fillStyle = fill;
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, x, y, widthPx, heightPx, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#3b2f0b';
      ctx.font = '14px sans-serif';
      const words = text.split(' ');
      let line = '';
      let lineY = y + 22;
      const maxWidth = widthPx - 14;

      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth) {
          ctx.fillText(line, x + 7, lineY);
          line = word;
          lineY += 18;
          if (lineY > y + heightPx - 8) break;
        } else {
          line = test;
        }
      }

      if (lineY <= y + heightPx - 8 && line) {
        ctx.fillText(line, x + 7, lineY);
      }
      return;
    }

    if (type === 'image') {
      const x = Number(obj.x);
      const y = Number(obj.y);
      const widthPx = typeof obj.width === 'number' ? obj.width : 220;
      const heightPx = typeof obj.height === 'number' ? obj.height : 160;
      const src = typeof obj.url === 'string' ? obj.url : typeof obj.src === 'string' ? obj.src : '';

      if (!Number.isFinite(x) || !Number.isFinite(y) || !src) return;

      let img = imageCacheRef.current.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        imageCacheRef.current.set(src, img);
      }

      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, widthPx, heightPx);
      } else {
        ctx.fillStyle = '#dbeafe';
        ctx.fillRect(x, y, widthPx, heightPx);
        ctx.strokeStyle = '#94a3b8';
        ctx.strokeRect(x, y, widthPx, heightPx);
      }
      return;
    }

    if (type === 'arrow') {
      const points = Array.isArray(obj.points) ? obj.points : [];
      if (points.length < 2) return;

      const start = points[0];
      const end = points[points.length - 1];
      if (!start || !end) return;

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, width);
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLength = Math.max(10, width * 3);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLength * Math.cos(angle - Math.PI / 6),
        end.y - headLength * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        end.x - headLength * Math.cos(angle + Math.PI / 6),
        end.y - headLength * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (type === 'stroke') {
      const points = Array.isArray(obj.points) ? obj.points : [];
      if (points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, width);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        const point = points[i];
        if (typeof point?.x !== 'number' || typeof point?.y !== 'number') continue;
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
  }, []);

  const drawSelectionOverlay = useCallback((ctx: CanvasRenderingContext2D, obj: any) => {
    if (!obj || obj.deleted) return;
    const bounds = getObjectBounds(obj);
    if (!bounds) return;

    const scale = view.scale;
    const line = Math.max(1, 1.25 / Math.max(1, scale));
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = line;
    ctx.setLineDash([6 / Math.max(1, scale), 4 / Math.max(1, scale)]);
    ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.setLineDash([]);

    const drawHandle = (hx: number, hy: number) => {
      const size = HANDLE_SIZE / Math.max(1, scale);
      ctx.beginPath();
      ctx.rect(hx - size / 2, hy - size / 2, size, size);
      ctx.fill();
      ctx.stroke();
    };

    const type = obj?.type;
    if (type === 'arrow' || type === 'line') {
      const handles = getArrowHandles(obj);
      handles.forEach((h) => drawHandle(h.x, h.y));
    } else {
      const handles = getResizeHandles(obj);
      handles.forEach((h) => drawHandle(h.x, h.y));
    }

    ctx.restore();
  }, [view.scale]);

  const getObjectBounds = (obj: any) => {
    const type = obj?.type ?? 'stroke';

    if (type === 'rect' || type === 'ellipse' || type === 'sticky' || type === 'image') {
      const x = Number(obj.x);
      const y = Number(obj.y);
      const width = Number(obj.width || 0);
      const height = Number(obj.height || 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { left: x, top: y, right: x + width, bottom: y + height };
    }

    if (type === 'text') {
      const x = Number(obj.x);
      const y = Number(obj.y);
      const text = typeof obj.text === 'string' ? obj.text : '';
      const fontSize = Number(obj.fontSize || 16);
      const lines = text.split(/\n/g);
      const estimatedWidth = Math.max(...lines.map((line: string) => Math.max(1, line.length) * (fontSize * 0.6)));
      const width = Math.max(20, Number(obj.width || estimatedWidth));
      const height = Math.max(18, Number(obj.height || (fontSize * 1.24 * lines.length + 4)));
      return { left: x, top: y, right: x + width, bottom: y + height };
    }

    if (type === 'stroke' || type === 'arrow' || type === 'line') {
      const points = Array.isArray(obj.points) ? obj.points : [];
      if (points.length === 0) return null;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      points.forEach((p: any) => {
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
      const pad = Math.max(6, Number(obj.width || 2) * 2);
      return { left: minX - pad, top: minY - pad, right: maxX + pad, bottom: maxY + pad };
    }

    return null;
  };

  const hitTestObjectId = (x: number, y: number) => {
    for (let i = drawableObjects.length - 1; i >= 0; i -= 1) {
      const obj: any = drawableObjects[i];
      if (obj?.deleted) continue;
      const bounds = getObjectBounds(obj);
      if (!bounds) continue;
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        return obj?.id || null;
      }
    }
    return null;
  };

  const hitTestObjectIdsWithinRadius = (x: number, y: number, radius: number) => {
    const matched: string[] = [];
    for (let i = drawableObjects.length - 1; i >= 0; i -= 1) {
      const obj: any = drawableObjects[i];
      if (obj?.deleted) continue;
      const bounds = getObjectBounds(obj);
      if (!bounds) continue;
      const nearestX = Math.max(bounds.left, Math.min(x, bounds.right));
      const nearestY = Math.max(bounds.top, Math.min(y, bounds.bottom));
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy <= radius * radius && obj?.id) {
        matched.push(obj.id);
      }
    }
    return matched;
  };

  const getObjectIdsInSelectionBox = (box: SelectionBox) => {
    const left = Math.min(box.startX, box.endX);
    const right = Math.max(box.startX, box.endX);
    const top = Math.min(box.startY, box.endY);
    const bottom = Math.max(box.startY, box.endY);

    const matched: string[] = [];
    drawableObjects.forEach((obj: any) => {
      if (!obj?.id || obj.deleted) return;
      const bounds = getObjectBounds(obj);
      if (!bounds) return;

      const intersects =
        bounds.right >= left &&
        bounds.left <= right &&
        bounds.bottom >= top &&
        bounds.top <= bottom;
      if (intersects) {
        matched.push(obj.id);
      }
    });

    return matched;
  };

  const eraseAtPoint = (x: number, y: number, groupId?: string) => {
    const targets = hitTestObjectIdsWithinRadius(x, y, ERASER_RADIUS);
    targets.forEach((id) => {
      if (eraseVisitedRef.current.has(id)) return;
      eraseVisitedRef.current.add(id);
      deleteObjectById(id, groupId);
    });
  };

  const eraseAlongPath = (from: { x: number; y: number }, to: { x: number; y: number }, groupId?: string) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, ERASER_RADIUS * 0.7)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      eraseAtPoint(from.x + dx * t, from.y + dy * t, groupId);
    }
  };

  const buildMovedObject = (base: any, dx: number, dy: number) => {
    const next = { ...base };
    const type = next?.type ?? 'stroke';

    if (typeof next.x === 'number') next.x = next.x + dx;
    if (typeof next.y === 'number') next.y = next.y + dy;

    if ((type === 'stroke' || type === 'arrow' || type === 'line') && Array.isArray(next.points)) {
      next.points = next.points.map((p: any) => ({
        ...p,
        x: typeof p?.x === 'number' ? p.x + dx : p?.x,
        y: typeof p?.y === 'number' ? p.y + dy : p?.y,
      }));
    }

    return next;
  };

  const getResizeHandles = (obj: any) => {
    const bounds = getObjectBounds(obj);
    if (!bounds) return [] as Array<{ key: DragState['handle']; x: number; y: number }>;

    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.top + bounds.bottom) / 2;
    return [
      { key: 'nw' as const, x: bounds.left, y: bounds.top },
      { key: 'n' as const, x: cx, y: bounds.top },
      { key: 'ne' as const, x: bounds.right, y: bounds.top },
      { key: 'e' as const, x: bounds.right, y: cy },
      { key: 'se' as const, x: bounds.right, y: bounds.bottom },
      { key: 's' as const, x: cx, y: bounds.bottom },
      { key: 'sw' as const, x: bounds.left, y: bounds.bottom },
      { key: 'w' as const, x: bounds.left, y: cy },
    ];
  };

  const getArrowHandles = (obj: any) => {
    const points = Array.isArray(obj?.points) ? obj.points : [];
    const start = points[0];
    const end = points[points.length - 1];
    if (!start || !end) return [] as Array<{ key: DragState['handle']; x: number; y: number }>;
    return [
      { key: 'arrow-start' as const, x: Number(start.x), y: Number(start.y) },
      { key: 'arrow-end' as const, x: Number(end.x), y: Number(end.y) },
    ];
  };

  const hitTestHandle = (x: number, y: number, objectId: string | null) => {
    if (!objectId) return null as DragState['handle'] | null;
    const obj = objects.get(objectId);
    if (!obj || obj.deleted) return null;

    const type = obj.type;
    const handleRadius = Math.max(8, HANDLE_SIZE / view.scale);
    const handles =
      type === 'arrow' || type === 'line'
        ? getArrowHandles(obj)
        : getResizeHandles(obj);

    for (const handle of handles) {
      const dx = x - handle.x;
      const dy = y - handle.y;
      if (dx * dx + dy * dy <= handleRadius * handleRadius) {
        return handle.key;
      }
    }

    return null;
  };

  const normalizeRect = (x1: number, y1: number, x2: number, y2: number) => {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    return {
      x: left,
      y: top,
      width: Math.max(1, Math.abs(x2 - x1)),
      height: Math.max(1, Math.abs(y2 - y1)),
    };
  };

  const buildResizedObject = (
    base: any,
    pointerWorldX: number,
    pointerWorldY: number,
    handle: DragState['handle'],
  ) => {
    if (!handle) return base;
    const type = base?.type;

    if (handle === 'arrow-start' || handle === 'arrow-end') {
      const points = Array.isArray(base.points) ? [...base.points] : [];
      if (points.length < 2) return base;
      if (handle === 'arrow-start') {
        points[0] = { x: pointerWorldX, y: pointerWorldY };
      } else {
        points[points.length - 1] = { x: pointerWorldX, y: pointerWorldY };
      }
      return {
        ...base,
        points,
      };
    }

    if (!['rect', 'ellipse', 'sticky', 'image', 'text'].includes(type)) {
      return base;
    }

    const x = Number(base.x) || 0;
    const y = Number(base.y) || 0;
    const width = Math.max(1, Number(base.width) || 1);
    const height = Math.max(1, Number(base.height) || (type === 'text' ? Number(base.fontSize || 16) + 8 : 1));

    const left = x;
    const top = y;
    const right = x + width;
    const bottom = y + height;

    let nextLeft = left;
    let nextRight = right;
    let nextTop = top;
    let nextBottom = bottom;

    if (handle.includes('w')) nextLeft = pointerWorldX;
    if (handle.includes('e')) nextRight = pointerWorldX;
    if (handle.includes('n')) nextTop = pointerWorldY;
    if (handle.includes('s')) nextBottom = pointerWorldY;

    if (handle === 'n' || handle === 's') {
      nextLeft = left;
      nextRight = right;
    }
    if (handle === 'e' || handle === 'w') {
      nextTop = top;
      nextBottom = bottom;
    }

    const normalized = normalizeRect(nextLeft, nextTop, nextRight, nextBottom);

    if (type === 'text') {
      return {
        ...base,
        x: normalized.x,
        y: normalized.y,
        width: normalized.width,
      };
    }

    return {
      ...base,
      x: normalized.x,
      y: normalized.y,
      width: normalized.width,
      height: normalized.height,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const ws = WSClient.getInstance();

    const offObject = ws.on('canvas:object', (payload) => {
      if (!payload?.objectId) return;
      const rawData = payload?.data;
      const rawProps = rawData?.props ?? rawData ?? {};
      const normalized = {
        id: payload.objectId,
        ...rawProps,
        type: rawData?.type ?? rawProps?.type,
      };
      upsertObject(payload.objectId, normalized);
    });

    const offLoad = ws.on('canvas:load', (payload) => {
      const hasSnapshot = Array.isArray(payload?.updates);
      const updates = hasSnapshot ? payload.updates : [];

      if (hasSnapshot) {
        const nextObjects = new Map<string, any>();
        updates.forEach((entry: any) => {
          if (!entry?.objectId) return;
          const rawData = entry?.data;
          const rawProps = rawData?.props ?? rawData ?? {};
          const normalized = {
            id: entry.objectId,
            ...rawProps,
            type: rawData?.type ?? rawProps?.type,
          };
          nextObjects.set(entry.objectId, {
            ...normalized,
            _hlc: {},
          });
        });
        replaceObjects(nextObjects);
      }

      const events = Array.isArray(payload?.events) ? payload.events : [];
      events.forEach((event: any) => {
        if (!event?.objectId) return;
        const rawAfter = event?.after;
        const rawProps = rawAfter?.props ?? rawAfter ?? {};
        const normalized = {
          id: event.objectId,
          ...rawProps,
          type: rawProps?.type,
        };
        upsertObject(event.objectId, normalized);
      });
    });

    return () => {
      offObject();
      offLoad();
    };
  }, [replaceObjects, upsertObject]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const dpr = dprRef.current;
    const cssWidth = ctx.canvas.width / dpr;
    const cssHeight = ctx.canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.setTransform(
      dpr * view.scale,
      0,
      0,
      dpr * view.scale,
      dpr * view.offsetX,
      dpr * view.offsetY,
    );

    drawableObjects.forEach((obj: any) => drawObject(ctx, obj));

    if (textDraft) {
      drawObject(ctx, {
        type: 'text',
        x: textDraft.x,
        y: textDraft.y,
        text: textDraft.value,
        color: strokeColor,
        fontSize: textDraft.fontSize,
      });

      if (caretVisible) {
        const lines = (textDraft.value || '').split(/\n/g);
        const lastLine = lines[lines.length - 1] || '';
        const fontSize = textDraft.fontSize;
        const lineHeight = Math.round(fontSize * 1.24);

        ctx.save();
        ctx.fillStyle = strokeColor;
        ctx.font = `${fontSize}px "Virgil", "Comic Sans MS", "Bradley Hand", cursive`;
        const caretX = textDraft.x + ctx.measureText(lastLine).width + 1;
        const caretY = textDraft.y + (lines.length - 1) * lineHeight;
        ctx.fillRect(caretX, caretY, Math.max(1, Math.round(fontSize * 0.08)), Math.max(12, Math.round(fontSize * 1.08)));
        ctx.restore();
      }
    }

    selectedObjectIdsRef.current.forEach((id) => {
      const selected = objects.get(id);
      if (selected) drawSelectionOverlay(ctx, selected);
    });

    if (selectionBox) {
      const left = Math.min(selectionBox.startX, selectionBox.endX);
      const top = Math.min(selectionBox.startY, selectionBox.endY);
      const width = Math.abs(selectionBox.endX - selectionBox.startX);
      const height = Math.abs(selectionBox.endY - selectionBox.startY);

      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
      ctx.lineWidth = Math.max(1, 1.1 / Math.max(1, view.scale));
      ctx.setLineDash([6 / Math.max(1, view.scale), 4 / Math.max(1, view.scale)]);
      ctx.fillRect(left, top, width, height);
      ctx.strokeRect(left, top, width, height);
      ctx.restore();
    }
  }, [caretVisible, drawObject, drawSelectionOverlay, drawableObjects, objects, selectionBox, strokeColor, textDraft, view]);

  const zoomAtPoint = useCallback((screenX: number, screenY: number, factor: number) => {
    setView((prev) => {
      const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.scale * factor));
      if (nextScale === prev.scale) return prev;
      const worldX = (screenX - prev.offsetX) / prev.scale;
      const worldY = (screenY - prev.offsetY) / prev.scale;
      return {
        scale: nextScale,
        offsetX: screenX - worldX * nextScale,
        offsetY: screenY - worldY * nextScale,
      };
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const flushWheel = () => {
      wheelFrameRef.current = null;
      const zoomPayload = wheelZoomRef.current;
      const panPayload = wheelDeltaRef.current;
      wheelZoomRef.current = null;
      wheelDeltaRef.current = null;

      if (zoomPayload) {
        zoomAtPoint(zoomPayload.x, zoomPayload.y, zoomPayload.deltaY > 0 ? 0.92 : 1.08);
      }

      if (panPayload) {
        setView((prev) => ({
          ...prev,
          offsetX: prev.offsetX - panPayload.dx,
          offsetY: prev.offsetY - panPayload.dy,
        }));
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        wheelZoomRef.current = { x, y, deltaY: e.deltaY };
      } else {
        const existing = wheelDeltaRef.current || { dx: 0, dy: 0 };
        existing.dx += e.deltaX;
        existing.dy += e.deltaY;
        wheelDeltaRef.current = existing;
      }

      if (wheelFrameRef.current == null) {
        wheelFrameRef.current = window.requestAnimationFrame(flushWheel);
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      if (wheelFrameRef.current != null) {
        window.cancelAnimationFrame(wheelFrameRef.current);
        wheelFrameRef.current = null;
      }
    };
  }, [zoomAtPoint]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.button === 2) {
      e.currentTarget.setPointerCapture(e.pointerId);
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: view.offsetX,
        offsetY: view.offsetY,
      };
      return;
    }

    const pointer = getPointerPosition(e);
    const { x, y } = screenToWorld(pointer.x, pointer.y);

    const beginTextDraftAt = (worldX: number, worldY: number, initialValue = '') => {
      setTextDraft({
        x: worldX,
        y: worldY,
        value: initialValue,
        fontSize: textSize,
      });
      isDrawing.current = false;
    };

    const beginSelectInteraction = (
      objectId: string,
      options?: { allowInlineEditOnDoubleClick?: boolean },
    ) => {
      const objectStart = objects.get(objectId);
      if (!objectStart) return;

      setSelectedObject(objectId);

      if (options?.allowInlineEditOnDoubleClick && e.detail >= 2) {
        const target = objects.get(objectId);
        if (target?.type === 'text' || target?.type === 'sticky') {
          setEditingObject({
            objectId,
            kind: target.type,
            x: Number(target.x) || x,
            y: Number(target.y) || y,
            value: typeof target.text === 'string' ? target.text : '',
            fontSize: Number(target.fontSize || textSize),
          });
          isDrawing.current = false;
          dragRef.current = null;
          return;
        }
      }

      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        objectId,
        pointerStartX: x,
        pointerStartY: y,
        objectStart: { ...objectStart },
        mode: 'move',
        lastEmitAt: 0,
      };
      isDrawing.current = true;
    };

    if (activeTool !== 'erase' && activeTool !== 'image') {
      const hitObjectId = hitTestObjectId(x, y);
      if (hitObjectId && activeTool !== 'select') {
        setActiveTool('select');
        beginSelectInteraction(hitObjectId);
        return;
      }
    }

    if (activeTool === 'select') {
      const selectedHandle = hitTestHandle(x, y, selectedObjectIdRef.current);
      if (selectedHandle && selectedObjectIdRef.current) {
        const objectId = selectedObjectIdRef.current;
        const objectStart = objects.get(objectId);
        if (!objectStart) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          objectId,
          pointerStartX: x,
          pointerStartY: y,
          objectStart: { ...objectStart },
          mode: 'resize',
          handle: selectedHandle,
          lastEmitAt: 0,
        };
        isDrawing.current = true;
        return;
      }

      const objectId = hitTestObjectId(x, y);
      if (!objectId) {
        e.currentTarget.setPointerCapture(e.pointerId);
        isDrawing.current = true;
        dragRef.current = null;
        selectionBoxRef.current = {
          startX: x,
          startY: y,
          endX: x,
          endY: y,
        };
        setSelectionBox(selectionBoxRef.current);
        setSelectedObjects([]);
        return;
      }

      beginSelectInteraction(objectId, { allowInlineEditOnDoubleClick: true });
      return;
    }

    if (activeTool === 'erase') {
      const groupId = nextHistoryGroupId();
      eraseVisitedRef.current = new Set();
      eraseLastPointRef.current = { x, y };
      eraseAtPoint(x, y, groupId);
      isDrawing.current = true;
      drawGroupIdRef.current = groupId;
      return;
    }

    isDrawing.current = true;

    if (activeTool === 'text') {
      beginTextDraftAt(x, y);
      return;
    }

    if (activeTool === 'sticky') {
      const objectId = `sticky-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const props = {
        id: objectId,
        type: 'sticky',
        x,
        y,
        width: 180,
        height: 140,
        text: 'New note',
        fill: '#fde68a',
        border: '#e7b008',
      };
      upsertObject(objectId, props);
      sendCanvasEvent(objectId, 'CREATE_OBJECT', 'sticky', props);
      recordHistory({ objectId, before: null, after: cloneHistoryObject(props), groupId: nextHistoryGroupId() });
      setEditingObject({
        objectId,
        kind: 'sticky',
        x,
        y,
        value: props.text,
      });
      isDrawing.current = false;
      return;
    }

    if (activeTool === 'image') {
      pendingImagePointRef.current = { x, y };
      imageInputRef.current?.click();
      isDrawing.current = false;
      return;
    }

    if (activeTool === 'arrow') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const objectId = `arrow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const props = {
        id: objectId,
        type: 'arrow',
        color: strokeColor,
        width: brushSize,
        points: [
          { x, y },
          { x: x + 1, y: y + 1 },
        ],
      };
      draftRef.current = { objectId, tool: 'arrow', startX: x, startY: y, lastEmitAt: 0 };
      upsertObject(objectId, props);
      sendCanvasEvent(objectId, 'CREATE_OBJECT', 'arrow', props);
      drawGroupIdRef.current = nextHistoryGroupId();
      return;
    }

    if (activeTool === 'rectangle' || activeTool === 'ellipse') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const objectId = `${activeTool}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      draftRef.current = { objectId, tool: activeTool, startX: x, startY: y, lastEmitAt: 0 };

      const shapeType = activeTool === 'rectangle' ? 'rect' : 'ellipse';
      const props = {
        id: objectId,
        type: shapeType,
        x,
        y,
        width: 1,
        height: 1,
        color: strokeColor,
        fill: 'transparent',
        strokeWidth: brushSize,
      };
      upsertObject(objectId, props);
      sendCanvasEvent(objectId, 'CREATE_OBJECT', shapeType, props);
      drawGroupIdRef.current = nextHistoryGroupId();
      return;
    }

    const objectId = `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawGroupIdRef.current = nextHistoryGroupId();
    draftRef.current = { objectId, tool: 'draw', startX: x, startY: y, lastEmitAt: 0 };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current && panStartRef.current) {
      const start = panStartRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      setView((prev) => ({
        ...prev,
        offsetX: start.offsetX + dx,
        offsetY: start.offsetY + dy,
      }));
      return;
    }

    if (!isDrawing.current) return;

    const pointer = getPointerPosition(e);
    const { x, y } = screenToWorld(pointer.x, pointer.y);

    if (activeTool === 'erase') {
      const last = eraseLastPointRef.current;
      if (last) {
        eraseAlongPath(last, { x, y }, drawGroupIdRef.current || undefined);
      } else {
        eraseAtPoint(x, y, drawGroupIdRef.current || undefined);
      }
      eraseLastPointRef.current = { x, y };
      return;
    }

    if (activeTool === 'select') {
      if (selectionBoxRef.current) {
        const nextBox = {
          ...selectionBoxRef.current,
          endX: x,
          endY: y,
        };
        selectionBoxRef.current = nextBox;
        setSelectionBox(nextBox);
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;

      let nextObject = drag.objectStart;
      if (drag.mode === 'resize') {
        nextObject = buildResizedObject(drag.objectStart, x, y, drag.handle);
      } else {
        const dx = x - drag.pointerStartX;
        const dy = y - drag.pointerStartY;
        nextObject = buildMovedObject(drag.objectStart, dx, dy);
      }
      upsertObject(drag.objectId, nextObject);

      const now = Date.now();
      if (now - (drag.lastEmitAt ?? 0) >= CANVAS_EMIT_INTERVAL_MS) {
        dragRef.current = { ...drag, lastEmitAt: now };
        sendCanvasEvent(drag.objectId, 'UPDATE_OBJECT', nextObject.type || 'shape', nextObject);
      }
      return;
    }

    const draft = draftRef.current;
    if (!draft) return;

    const now = Date.now();
    if (now - (draft.lastEmitAt ?? 0) < CANVAS_EMIT_INTERVAL_MS) return;

    if (draft.tool === 'draw') {
      const segmentId = `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const points = [
        { x: draft.startX, y: draft.startY },
        { x, y },
      ];

      const props = {
        id: segmentId,
        type: 'stroke',
        x,
        y,
        color: strokeColor,
        width: brushSize,
        points,
      };

      draftRef.current = { ...draft, startX: x, startY: y, lastEmitAt: now };
      upsertObject(segmentId, props);
      sendCanvasEvent(segmentId, 'CREATE_OBJECT', 'stroke', props);
      recordHistory({
        objectId: segmentId,
        before: null,
        after: cloneHistoryObject(props),
        groupId: drawGroupIdRef.current || undefined,
      });
      return;
    }

    if (draft.tool === 'arrow') {
      const props = {
        id: draft.objectId,
        type: 'arrow',
        color: strokeColor,
        width: brushSize,
        points: [
          { x: draft.startX, y: draft.startY },
          { x, y },
        ],
      };
      draftRef.current = { ...draft, lastEmitAt: now };
      upsertObject(draft.objectId, props);
      sendCanvasEvent(draft.objectId, 'UPDATE_OBJECT', 'arrow', props);
      return;
    }

    const nextX = Math.min(draft.startX, x);
    const nextY = Math.min(draft.startY, y);
    const nextWidth = Math.max(1, Math.abs(x - draft.startX));
    const nextHeight = Math.max(1, Math.abs(y - draft.startY));
    const shapeType = draft.tool === 'rectangle' ? 'rect' : 'ellipse';

    const props = {
      id: draft.objectId,
      type: shapeType,
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
      color: strokeColor,
      fill: 'transparent',
      strokeWidth: brushSize,
    };

    draftRef.current = { ...draft, lastEmitAt: now };
    upsertObject(draft.objectId, props);
    sendCanvasEvent(draft.objectId, 'UPDATE_OBJECT', shapeType, props);
  };

  const onPointerUp = () => {
    isPanningRef.current = false;
    panStartRef.current = null;

    if (activeTool === 'select' && dragRef.current) {
      const drag = dragRef.current;
      const latest = objects.get(drag.objectId);
      if (latest) {
        sendCanvasEvent(drag.objectId, 'UPDATE_OBJECT', latest.type || 'shape', latest);
        recordHistory({
          objectId: drag.objectId,
          before: cloneHistoryObject(drag.objectStart),
          after: cloneHistoryObject(latest),
          groupId: nextHistoryGroupId(),
        });
      }
    }

    if (activeTool === 'select' && selectionBoxRef.current) {
      const box = selectionBoxRef.current;
      const distance = Math.hypot(box.endX - box.startX, box.endY - box.startY);
      if (distance < 3) {
        setSelectedObjects([]);
      } else {
        const matched = getObjectIdsInSelectionBox(box);
        setSelectedObjects(matched);
      }
      selectionBoxRef.current = null;
      setSelectionBox(null);
    }

    if (draftRef.current && (draftRef.current.tool === 'arrow' || draftRef.current.tool === 'rectangle' || draftRef.current.tool === 'ellipse')) {
      const objectId = draftRef.current.objectId;
      const latest = objects.get(objectId);
      if (latest) {
        recordHistory({
          objectId,
          before: null,
          after: cloneHistoryObject(latest),
          groupId: drawGroupIdRef.current || nextHistoryGroupId(),
        });
      }
    }

    isDrawing.current = false;
    eraseVisitedRef.current.clear();
    eraseLastPointRef.current = null;
    drawGroupIdRef.current = null;
    draftRef.current = null;
    dragRef.current = null;
  };

  const onDoubleClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const pointer = getPointerPosition(e);
    const { x, y } = screenToWorld(pointer.x, pointer.y);
    const objectId = hitTestObjectId(x, y);
    if (objectId) {
      const target = objects.get(objectId);
      if (target && (target.type === 'text' || target.type === 'sticky')) {
        setSelectedObject(objectId);
        setEditingObject({
          objectId,
          kind: target.type,
          x: Number(target.x) || x,
          y: Number(target.y) || y,
          value: typeof target.text === 'string' ? target.text : '',
          fontSize: Number(target.fontSize || textSize),
        });
        return;
      }
    }

    // Excalidraw-like text behavior: double-click anywhere creates a text draft at pointer.
    setActiveTool('text');
    setEditingObject(null);
    setTextDraft({ x, y, value: '', fontSize: textSize });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isTypingElement = targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;

      // Excalidraw-like behavior: if text tool is active, start typing immediately.
      if (!isTypingElement && activeTool === 'text' && !textDraft && !editingObject) {
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          const centerX = (containerRef.current?.clientWidth || 400) / 2;
          const centerY = (containerRef.current?.clientHeight || 300) / 2;
          const world = screenToWorld(centerX, centerY);
          setTextDraft({ x: world.x, y: world.y, value: e.key, fontSize: textSize });
          return;
        }
      }

      if (!isTypingElement && (e.key === 'Delete' || e.key === 'Backspace')) {
        const selectedIds = selectedObjectIdsRef.current;
        if (selectedIds.length > 0) {
          e.preventDefault();
          const groupId = nextHistoryGroupId();
          selectedIds.forEach((id) => {
            deleteObjectById(id, groupId);
          });
          setSelectedObjects([]);
        }
      }

      const isCmd = e.metaKey || e.ctrlKey;
      if (!isCmd) return;

      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, editingObject, historyVersion, screenToWorld, textDraft, textSize]);

  return (
    <div className="glass dot-grid relative h-full overflow-hidden rounded-[18px]">
      <div ref={containerRef} className="relative h-full">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
          className="hidden"
          onChange={onImageSelected}
        />

        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          style={{ touchAction: 'none' }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onDoubleClick={onDoubleClick}
        />

        {textDraft && (
          <textarea
            ref={textDraftInputRef}
            autoFocus
            value={textDraft.value}
            onChange={(e) => setTextDraft((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            onBlur={commitTextDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitTextDraft();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setTextDraft(null);
              }
            }}
            rows={1}
            aria-label="canvas-text-input"
            className="fixed h-px w-px opacity-0"
            style={{
              left: '-9999px',
              top: '-9999px',
              pointerEvents: 'none',
            }}
          />
        )}

        <div className="glass absolute left-4 top-4 z-10 flex w-[220px] flex-col gap-2 rounded-2xl p-3">
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">Tools</div>

          <div className="grid grid-cols-4 gap-1.5">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`rounded-[10px] border px-2 py-1.5 text-[0.72rem] font-semibold transition duration-150 ${activeTool === tool.id ? 'border-[rgba(13,91,215,.56)] bg-[rgba(13,91,215,.14)] text-[var(--brand-strong)] shadow-[0_0_18px_rgba(13,91,215,.24)]' : 'border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.65)] text-[var(--ink-soft)] hover:-translate-y-0.5 hover:bg-[rgba(26,26,26,.05)]'}`}
                onClick={() => {
                  const nextTool = tool.id as CanvasTool;
                  setActiveTool(nextTool);
                  if (nextTool === 'image') {
                    pendingImagePointRef.current = null;
                    imageInputRef.current?.click();
                  }
                }}
                title={tool.label}
              >
                {tool.symbol}
              </button>
            ))}
          </div>

          <div className="rounded-md border border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.8)] px-2 py-1 text-[0.65rem] text-[var(--ink-soft)]">
            Wheel: pan canvas, Cmd/Ctrl + wheel: zoom, drag empty area in Select to multi-select, Delete/Backspace removes selected.
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={selectedObjectIds.length === 0}
            onClick={() => {
              if (selectedObjectIds.length === 0) return;
              const groupId = nextHistoryGroupId();
              selectedObjectIds.forEach((id) => {
                deleteObjectById(id, groupId);
              });
              setSelectedObjects([]);
            }}
          >
            Delete Selected ({selectedObjectIds.length})
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" className="btn btn-outline btn-sm" onClick={undo} disabled={!canUndo}>
              Undo
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={redo} disabled={!canRedo}>
              Redo
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void replayRecent()} disabled={!canUndo}>
              Replay
            </button>
          </div>

          <div className="mt-1 flex items-center justify-between rounded-lg border border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.75)] px-2 py-1 text-[0.72rem]">
            <span>Zoom</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => zoomAtPoint((containerRef.current?.clientWidth || 0) / 2, (containerRef.current?.clientHeight || 0) / 2, 0.9)}
              >
                -
              </button>
              <span className="min-w-[40px] text-center">{Math.round(view.scale * 100)}%</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => zoomAtPoint((containerRef.current?.clientWidth || 0) / 2, (containerRef.current?.clientHeight || 0) / 2, 1.1)}
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-1 grid gap-1.5">
            <label className="text-[0.72rem] font-semibold text-[var(--ink-soft)]">Color</label>
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              className="h-8 w-full cursor-pointer rounded-md border border-[rgba(26,26,26,.2)] bg-transparent"
            />

            <label className="mt-1 text-[0.72rem] font-semibold text-[var(--ink-soft)]">Brush {brushSize}px</label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />

            <label className="mt-1 text-[0.72rem] font-semibold text-[var(--ink-soft)]">Text Size</label>
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`rounded-[10px] border px-2 py-1.5 text-[0.72rem] font-semibold transition duration-150 ${textSize === size ? 'border-[rgba(13,91,215,.56)] bg-[rgba(13,91,215,.14)] text-[var(--brand-strong)] shadow-[0_0_18px_rgba(13,91,215,.24)]' : 'border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.65)] text-[var(--ink-soft)] hover:bg-[rgba(26,26,26,.05)]'}`}
                  onClick={() => setTextSize(size)}
                >
                  {size}px
                </button>
              ))}
            </div>

            {(uploadingImage || imageStatus) && (
              <div className="rounded-md border border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.86)] px-2 py-1 text-[0.68rem] text-[var(--ink-soft)]">
                {uploadingImage ? 'Uploading image...' : imageStatus}
              </div>
            )}
          </div>
        </div>
      </div>

      {editingObject && (
        <div
          className="absolute z-30"
          style={{
            left: worldToScreen(editingObject.x, editingObject.y).x,
            top: worldToScreen(editingObject.x, editingObject.y).y,
          }}
        >
          {editingObject.kind === 'sticky' ? (
            <textarea
              autoFocus
              rows={5}
              value={editingObject.value}
              onChange={(e) => setEditingObject((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              onBlur={commitObjectEdit}
              className="w-[180px] resize-none rounded-md border border-[rgba(231,176,8,.65)] bg-[#fde68a] p-2 text-[13px] text-[#3b2f0b] outline-none"
            />
          ) : (
            <textarea
              autoFocus
              rows={Math.max(1, editingObject.value.split(/\n/g).length)}
              value={editingObject.value}
              onChange={(e) => setEditingObject((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              onBlur={commitObjectEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitObjectEdit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingObject(null);
                }
              }}
              className="min-w-[180px] resize-none rounded-md border border-[rgba(13,91,215,.45)] bg-[rgba(255,250,241,.95)] px-2 py-1 text-[14px] leading-[1.3] outline-none"
              style={{
                fontSize: `${Math.max(12, editingObject.fontSize ?? textSize)}px`,
                width: `${Math.max(180, measureTextBounds(editingObject.value || ' ', Math.max(12, editingObject.fontSize ?? textSize)).width + 16)}px`,
                height: `${Math.max(38, measureTextBounds(editingObject.value || ' ', Math.max(12, editingObject.fontSize ?? textSize)).height + 10)}px`,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};
