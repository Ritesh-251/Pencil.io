import { create } from "zustand";
import { api } from "../lib/api";

// ─── Proper Types ─────────────────────────────────────────────────────────────

export interface Room {
  roomId: string;
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  memberCount: number;
  visibility: "PUBLIC" | "PRIVATE";
  lastMessage: { content: string; createdAt: string } | null;
}

export interface ChatMessage {
  id?: string;
  messageId?: string;
  content: string;
  userId: string;
  roomId?: string;
  createdAt?: string;
  timestamp?: number;
}

export interface PresenceUser {
  id: string;
  name: string;
  status?: "online" | "offline";
  avatarUrl?: string | null;
}

// ─── Room Store ───────────────────────────────────────────────────────────────

interface RoomState {
  rooms: Room[];
  currentRoom: Room | null;
  loading: boolean;
  fetchRooms: () => void;
  setCurrentRoom: (r: Room | null) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  currentRoom: null,
  loading: false,
  fetchRooms: async () => {
    set({ loading: true });
    try {
      const res = await api.get("/api/v1/rooms");
      const rooms: Room[] = (res.rooms ?? []).map((room: any) => ({
        ...room,
        // Normalize: API may return either roomId or id depending on the endpoint
        id: room.id ?? room.roomId,
        roomId: room.roomId ?? room.id,
      }));
      set({ rooms });
    } catch (error) {
      console.error("Failed to fetch rooms:", error);
      set({ rooms: [] });
    } finally {
      set({ loading: false });
    }
  },
  setCurrentRoom: (currentRoom) => set({ currentRoom }),
}));

// ─── Chat Store ───────────────────────────────────────────────────────────────

interface ChatState {
  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
}));

// ─── Presence Store ───────────────────────────────────────────────────────────

interface PresenceState {
  users: Map<string, PresenceUser>;
  setOnline: (id: string, name: string, avatarUrl?: string | null) => void;
  setOffline: (id: string) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  users: new Map(),
  setOnline: (id, name, avatarUrl) =>
    set((s) => {
      const next = new Map(s.users);
      next.set(id, { id, name, status: "online", avatarUrl });
      return { users: next };
    }),
  setOffline: (id) =>
    set((s) => {
      const next = new Map(s.users);
      next.delete(id);
      return { users: next };
    }),
}));
