export const MEDIA_AUTOREJOIN_PREFIX = "media-autojoin:"
export const RAISE_HAND_TIMEOUT_MS = 60_000
export const REACTION_TTL_MS = 3_000
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "😮"]

export function nanoid6() {
  return Math.random().toString(36).slice(2, 8)
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "??"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

export const IconScreen = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v8h10V5H5zM8 17h4v-2H8v2z" />
  </svg>
)

export const IconVideo = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
)

export const IconMic = ({ active }: { active: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ opacity: active ? 1 : 0.35 }}>
    <path d="M10 1a3 3 0 00-3 3v6a3 3 0 006 0V4a3 3 0 00-3-3zM5 9a1 1 0 10-2 0 7 7 0 0014 0 1 1 0 10-2 0 5 5 0 01-10 0zM9 18v-2h2v2h2a1 1 0 010 2H7a1 1 0 010-2h2z" />
  </svg>
)

export const IconCamera = ({ active }: { active: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ opacity: active ? 1 : 0.35 }}>
    <path d="M2 6a2 2 0 012-2h8a2 2 0 012 2v2l4-2v8l-4-2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
)

export const IconHand = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18 11V7a2 2 0 00-4 0v4M14 7V5a2 2 0 00-4 0v6M10 5V4a2 2 0 00-4 0v9l-1.27-1.67A1.75 1.75 0 002 12.83v.33A8 8 0 0010 21h4a8 8 0 008-8v-2a2 2 0 00-4 0" />
  </svg>
)

export const IconNoise = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
)

export const IconPin = ({ filled }: { filled?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </svg>
)

export const IconPiP = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="2" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
)
