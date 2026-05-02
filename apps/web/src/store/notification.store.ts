import { create } from "zustand";
import { api } from "@/lib/api";

interface NotificationStore {
  unreadCount: number;
  lastFetched: number;
  setUnreadCount: (count: number) => void;
  fetchUnreadCount: () => Promise<void>;
  incrementUnread: () => void;
  decrementUnread: () => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  unreadCount: 0,
  lastFetched: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  fetchUnreadCount: async () => {
    try {
      const res = await api.get("/api/v1/notifications");
      const unread = res.notifications?.filter((n: any) => !n.isRead).length || 0;
      set({ unreadCount: unread, lastFetched: Date.now() });
    } catch (err) {
      console.error("[NotificationStore] Failed to fetch unread count:", err);
    }
  },
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  decrementUnread: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
}));
