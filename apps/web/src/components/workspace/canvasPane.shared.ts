export const TOOLS = [
  { id: "select", label: "Select", symbol: "Sel" },
  { id: "draw", label: "Pen", symbol: "Pen" },
  { id: "erase", label: "Erase", symbol: "Ers" },
  { id: "arrow", label: "Arrow", symbol: "Arr" },
  { id: "rectangle", label: "Rectangle", symbol: "Rect" },
  { id: "ellipse", label: "Ellipse", symbol: "Circ" },
  { id: "text", label: "Text", symbol: "Text" },
  { id: "sticky", label: "Sticky", symbol: "Note" },
  { id: "image", label: "Image", symbol: "Img" },
] as const

export type CanvasTool = "draw" | "erase" | "arrow" | "rectangle" | "ellipse" | "text" | "select" | "sticky" | "image"

export type DraftState = {
  objectId: string
  tool: CanvasTool
  startX: number
  startY: number
  lastEmitAt?: number
}

export type DragState = {
  objectId: string
  pointerStartX: number
  pointerStartY: number
  objectStart: Record<string, any>
  mode?: "move" | "resize"
  handle?:
    | "nw"
    | "n"
    | "ne"
    | "e"
    | "se"
    | "s"
    | "sw"
    | "w"
    | "arrow-start"
    | "arrow-end"
  lastEmitAt?: number
}

export type GroupDragState = {
  handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
  pointerStartX: number
  pointerStartY: number
  snapshots: Array<{ id: string; obj: Record<string, any> }>
  unionStart: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  lastEmitAt?: number
}

export type TextDraft = {
  x: number
  y: number
  value: string
  fontSize: number
  fontFamily: string
}

export type ViewState = {
  scale: number
  offsetX: number
  offsetY: number
}

export type SelectionBox = {
  startX: number
  startY: number
  endX: number
  endY: number
}

export type ObjectEditDraft = {
  objectId: string
  kind: "text" | "sticky"
  x: number
  y: number
  value: string
  fontSize?: number
}

export type HistoryEntry = {
  objectId: string
  before: Record<string, any> | null
  after: Record<string, any> | null
  groupId: string
  createdAt: number
}

export const CANVAS_EMIT_INTERVAL_MS = 40
export const GROUP_EMIT_INTERVAL_MS = 250
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3
export const ERASER_RADIUS = 14
export const MIN_POINT_DISTANCE = 3
export const HANDLE_SIZE = 10
export const TEXT_SIZE_OPTIONS = [16, 22, 30] as const

export const FONT_OPTIONS = [
  { id: "sketch", label: "Sketch", family: '"Virgil", "Comic Sans MS", "Bradley Hand", cursive' },
  { id: "sans", label: "Sans", family: "Inter, system-ui, -apple-system, sans-serif" },
  { id: "serif", label: "Serif", family: 'Georgia, "Times New Roman", "Palatino Linotype", serif' },
  { id: "mono", label: "Mono", family: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace' },
] as const

export const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0].family

export const STROKE_STYLE_OPTIONS = [
  { id: "sharp", label: "Sharp" },
  { id: "smooth", label: "Smooth" },
  { id: "fluid", label: "Fluid" },
] as const

export type StrokeStyle = "sharp" | "smooth" | "fluid"

export function measureTextBounds(value: string, fontSize: number, fontFamily?: string) {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null
  const ctx = canvas?.getContext("2d")
  const lines = value.split(/\n/g)
  const lineHeight = Math.round(fontSize * 1.24)

  let maxWidth = 60
  if (ctx) {
    ctx.font = `${fontSize}px ${fontFamily || '"Virgil", "Comic Sans MS", cursive'}`
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, Math.ceil(ctx.measureText(line).width))
    }
  } else {
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
    maxWidth = Math.max(60, Math.round(longest * fontSize * 0.62))
  }

  const height = Math.max(
    Math.round(fontSize * 1.4),
    Math.round(lines.length * lineHeight + 4),
  )
  return { width: maxWidth + 4, height }
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function getUploadApiBase() {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3003"
  if (wsUrl.startsWith("wss://")) return wsUrl.replace("wss://", "https://")
  if (wsUrl.startsWith("ws://")) return wsUrl.replace("ws://", "http://")
  return wsUrl
}

export function canLoadImageUrl(url: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image()
    let settled = false

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    const timer = setTimeout(() => finish(false), 4000)
    img.onload = () => {
      clearTimeout(timer)
      finish(true)
    }
    img.onerror = () => {
      clearTimeout(timer)
      finish(false)
    }
    img.src = url
  })
}
