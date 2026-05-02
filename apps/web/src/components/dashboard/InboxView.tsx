import React, { useEffect, useState } from "react";
import { Bell, MessageSquare, CheckCircle2, UserPlus, ArrowRight, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useNotificationStore } from "@/store/notification.store";

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata: any;
  isRead: boolean;
  createdAt: string;
}

export const InboxView = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const setUnreadCount = useNotificationStore(s => s.setUnreadCount);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/notifications");
      const list = res.notifications || [];
      setNotifications(list);
      setUnreadCount(list.filter((n: any) => !n.isRead).length);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.post("/api/v1/notifications/read-all");
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.patch(`/api/v1/notifications/${id}/read`);
      setNotifications(prev => {
        const next = prev.map(n => n.id === id ? { ...n, isRead: true } : n);
        setUnreadCount(next.filter(n => !n.isRead).length);
        return next;
      });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ink-title m-0 text-[1.8rem]">Your Inbox</h2>
          <p className="soft-copy mt-1">
            Stay updated with everything happening across your creative rooms.
          </p>
        </div>
        {notifications.some(n => !n.isRead) && (
          <button 
            onClick={handleMarkAllRead}
            className="text-[11px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Mark all as read
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 opacity-20" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--ink-soft)] opacity-40">
            <Bell className="w-12 h-12 mb-4" />
            <p className="font-bold uppercase tracking-widest text-[10px]">Your inbox is empty</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.map((item) => (
              <div 
                key={item.id}
                onClick={() => !item.isRead && handleMarkRead(item.id)}
                className={`group flex items-start gap-4 p-5 rounded-[24px] border transition-all duration-300 cursor-pointer ${
                  item.isRead 
                    ? 'bg-[var(--bg-surface)] border-[rgba(26,26,26,0.06)] opacity-70 grayscale-[0.2]' 
                    : 'bg-white border-indigo-100 shadow-sm ring-1 ring-indigo-500/5 hover:shadow-md'
                }`}
              >
                <div className={`p-3 rounded-2xl shrink-0 ${
                  item.type === 'TASK_ASSIGNED' ? 'bg-indigo-50 text-indigo-500' :
                  item.type === 'MENTION' ? 'bg-amber-50 text-amber-500' :
                  'bg-emerald-50 text-emerald-500'
                }`}>
                  {item.type === 'MENTION' ? <MessageSquare className="w-5 h-5" /> :
                   item.type === 'TASK_ASSIGNED' ? <CheckCircle2 className="w-5 h-5" /> :
                   <Bell className="w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--ink-soft)] opacity-60">
                      {item.type.replace('_', ' ')} • {formatTimestamp(item.createdAt)}
                    </span>
                    {!item.isRead && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-[var(--ink)] mb-1">
                    {item.title}
                  </h4>
                  <p className="text-[0.82rem] text-[var(--ink-soft)] line-clamp-2">
                    {item.content}
                  </p>
                </div>

                <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 hover:bg-[rgba(26,26,26,0.04)] rounded-xl text-indigo-600" title="View Context">
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
