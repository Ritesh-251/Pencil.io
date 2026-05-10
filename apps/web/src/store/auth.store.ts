import { create } from "zustand";
import { setMemoryToken } from "../lib/api";

// ─── Shared in-memory token ref (set by api.ts, read by api.ts) ──────────────
// The access token lives ONLY in memory — never in localStorage.
// On page reload the api layer silently calls /refresh using the httpOnly cookie.
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  user: {
    id: string;
    username: string;
    email: string;
    isVerified?: boolean;
    avatarUrl?: string | null;
    name?: string | null;
    bio?: string | null;
  } | null;
  token: string | null;
  /** True once AuthBootstrap has finished its silent refresh attempt (success or failure). */
  authReady: boolean;
  setAuth: (user: any, token: string) => void;
  setToken: (token: string | null) => void;
  updateUser: (data: Partial<NonNullable<AuthState["user"]>>) => void;
  clearToken: () => void;
  setAuthReady: () => void;
  logout: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadStoredUser(): AuthState["user"] {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw || raw === "undefined" || raw === "null") return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem("user");
    return null;
  }
}

// ─── Auth Store ───────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  // User metadata is safe in localStorage (no sensitive data).
  // Token starts null — api.ts will silently refresh from the httpOnly cookie.
  user: loadStoredUser(),
  token: null,
  authReady: false,

  setAuth: (user, token) => {
    if (typeof window === "undefined" || !token || token === "undefined")
      return;
    // Persist non-sensitive user metadata so the UI loads fast on reload.
    if (user) localStorage.setItem("user", JSON.stringify(user));
    // Mark that a session exists so api.ts knows to attempt a silent refresh.
    document.cookie = `has_session=true; path=/; max-age=604800; SameSite=Lax`;
    // Token stays in memory only — never touches localStorage.
    setMemoryToken(token);
    set({ user, token });
  },

  setToken: (token) => {
    setMemoryToken(token);
    set({ token });
  },

  updateUser: (data) => {
    const user = get().user;
    if (!user) return;
    const newUser = { ...user, ...data };
    localStorage.setItem("user", JSON.stringify(newUser));
    set({ user: newUser });
  },

  // Called once by AuthBootstrap once the refresh attempt settles (success or failure).
  setAuthReady: () => set({ authReady: true }),

  // Called by api.ts when a silent refresh succeeds on page reload.
  clearToken: () => {
    setMemoryToken(null);
    set({ token: null });
  },

  logout: () => {
    localStorage.removeItem("user");
    // Expire the session marker cookie.
    document.cookie = `has_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    setMemoryToken(null);
    set({ user: null, token: null });
    window.location.href = "/auth/signin";
  },
}));

// ─── Connection Store ─────────────────────────────────────────────────────────

interface ConnectionState {
  status: "connecting" | "connected" | "disconnected";
  syncing: boolean;
  setStatus: (s: "connecting" | "connected" | "disconnected") => void;
  setSyncing: (s: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "disconnected",
  syncing: false,
  setStatus: (status) => set({ status }),
  setSyncing: (syncing) => set({ syncing }),
}));
