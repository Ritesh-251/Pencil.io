import { create } from 'zustand';
import { api } from '../lib/api';

interface RoomState {
  rooms: any[];
  currentRoom: any | null;
  loading: boolean;
  fetchRooms: () => void;
  setCurrentRoom: (r: any) => void;
}
export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  currentRoom: null,
  loading: false,
  fetchRooms: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/api/v1/rooms');
      const rooms = (res.rooms ?? []).map((room: any) => ({
        ...room,
        id: room.id ?? room.roomId,
      }));
      set({ rooms });
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      set({ rooms: [] });
    } finally {
      set({ loading: false });
    }
  },
  setCurrentRoom: (currentRoom) => set({ currentRoom })
}));

interface ChatState {
  messages: any[];
  addMessage: (m: any) => void;
}
export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] }))
}));

interface PresenceState {
  users: Map<string, any>;
  setOnline: (id: string, name: string) => void;
  setOffline: (id: string) => void;
}
export const usePresenceStore = create<PresenceState>((set) => ({
  users: new Map(),
  setOnline: (id, name) => set((s) => {
    const next = new Map(s.users);
    next.set(id, { id, name });
    return { users: next };
  }),
  setOffline: (id) => set((s) => {
    const next = new Map(s.users);
    next.delete(id);
    return { users: next };
  })
}));
