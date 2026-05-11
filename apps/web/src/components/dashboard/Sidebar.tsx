"use client";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";
import { useTimerStore } from "@/store/timer.store";
import { useNotificationStore } from "@/store/notification.store";
import { Bell, Play, Pause, RotateCcw, Clock, Target } from "lucide-react";

import Link from "next/link";

export type DashboardTab = "ROOMS" | "INBOX" | "PLANNER" | "PROFILE";

interface SidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

export const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const [mounted, setMounted] = useState(false);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const timer = useTimerStore();
  const { unreadCount, fetchUnreadCount } = useNotificationStore();

  useEffect(() => {
    setMounted(true);
    fetchUnreadCount();
    const interval = setInterval(() => {
      timer.tick();
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleCreateRoom = async () => {
    try {
      const res = await api.post("/api/v1/rooms", {
        name: "Untitled Room",
        visibility: visibility,
      });
      window.location.href = `/room/${res.room.id}`;
    } catch (e) {
      console.error(e);
    }
  };

  const getTabClass = (tab: DashboardTab) => {
    const base = "rounded-[10px] px-3 py-2.5 transition-all cursor-pointer ";
    if (activeTab === tab) {
      return (
        base +
        "border border-[rgba(26,26,26,.12)] bg-[rgba(13,91,215,.06)] text-[var(--brand)] font-bold shadow-sm"
      );
    }
    return base + "soft-copy hover:bg-[rgba(26,26,26,.02)]";
  };

  return (
    <aside className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-3 rounded-[24px] p-4 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[0.72rem] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          Workspace
        </p>
        <Link href="/" className="flex items-center transition-opacity hover:opacity-90">
          <img
            src="/logo-wordmark-light.svg"
            alt="MyPencil"
            className="h-7 w-auto object-contain"
          />
        </Link>
      </div>

      <nav className="grid gap-1">
        <div
          onClick={() => onTabChange("ROOMS")}
          className={getTabClass("ROOMS")}
        >
          Rooms
        </div>
        <div
          onClick={() => onTabChange("INBOX")}
          className={`${getTabClass("INBOX")} flex items-center justify-between group`}
        >
          Inbox
          {mounted && unreadCount > 0 && (
            <div className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm ring-4 ring-red-500/10 animate-in zoom-in duration-300">
              {unreadCount > 9 ? "9+" : unreadCount}
            </div>
          )}
        </div>
        <div
          onClick={() => onTabChange("PLANNER")}
          className={getTabClass("PLANNER")}
        >
          Planner
        </div>
      </nav>

      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-1 rounded-[12px] bg-[rgba(26,26,26,0.05)] p-1">
          <button
            onClick={() => setVisibility("PUBLIC")}
            className={`flex-1 rounded-[8px] py-1.5 text-[0.75rem] font-medium transition-all ${visibility === "PUBLIC" ? "bg-white shadow-sm" : "text-[var(--ink-soft)] hover:bg-[rgba(26,26,26,0.03)]"}`}
          >
            Public
          </button>
          <button
            onClick={() => setVisibility("PRIVATE")}
            className={`flex-1 rounded-[8px] py-1.5 text-[0.75rem] font-medium transition-all ${visibility === "PRIVATE" ? "bg-white shadow-sm" : "text-[var(--ink-soft)] hover:bg-[rgba(26,26,26,0.03)]"}`}
          >
            Private
          </button>
        </div>
        <button onClick={handleCreateRoom} className="btn btn-primary w-full">
          New Room
        </button>
      </div>

      <div className="flex-1"></div>

      {/* Pomodoro Focus Widget */}
      {mounted && (
        <div className="bg-[rgba(26,26,26,0.03)] border border-[rgba(26,26,26,0.05)] rounded-[20px] p-3 flex flex-col gap-2 transition-all hover:bg-[rgba(26,26,26,0.04)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${timer.isActive ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--ink-soft)]">
                {timer.mode === 'work' ? 'Focus Session' : 'Short Break'}
              </span>
            </div>
            <button 
              onClick={timer.reset}
              className="p-1 hover:bg-white rounded-md transition-colors text-[var(--ink-soft)] opacity-40 hover:opacity-100"
              title="Reset Timer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <div className="text-2xl font-black tracking-tighter tabular-nums leading-none">
                {Math.floor(timer.timeLeft / 60)}:{(timer.timeLeft % 60).toString().padStart(2, '0')}
              </div>
              {timer.activeTaskTitle && (
                <div className="text-[10px] font-bold text-indigo-500 truncate max-w-[120px] mt-1 flex items-center gap-1">
                  <Target className="w-2.5 h-2.5" />
                  {timer.activeTaskTitle}
                </div>
              )}
            </div>

            <button 
              onClick={timer.isActive ? timer.pause : () => timer.start()}
              className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${
                timer.isActive 
                  ? 'bg-white text-amber-500 ring-1 ring-amber-500/20' 
                  : 'bg-indigo-600 text-white shadow-indigo-200'
              }`}
            >
              {timer.isActive ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
          </div>
          
          <div className="h-1 bg-[rgba(26,26,26,0.05)] rounded-full overflow-hidden mt-1">
            <div 
              className={`h-full transition-all duration-1000 ${timer.mode === 'work' ? 'bg-indigo-500' : 'bg-emerald-500'}`}
              style={{ width: `${(timer.timeLeft / timer.totalTime) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* User Profile Block */}
      <div className="border-t border-[rgba(26,26,26,.08)] pt-4 flex flex-col gap-3">
        <div 
          onClick={() => onTabChange("PROFILE")}
          className={`group flex items-center gap-3 p-2 rounded-[16px] cursor-pointer transition-all duration-300 ${activeTab === "PROFILE" ? "bg-[rgba(13,91,215,0.08)] ring-1 ring-[rgba(13,91,215,0.1)] shadow-sm" : "hover:bg-[rgba(26,26,26,0.03)]"}`}
        >
          <div className="relative shrink-0">
            <div 
              className="w-9 h-9 rounded-full border border-white/20 shadow-md flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-105"
              style={{ 
                background: mounted && user ? `linear-gradient(135deg, ${stringToColor(user.email)}, ${stringToColor(user.email + 'salt')})` : '#eee'
              }}
            >
              {mounted && user?.avatarUrl && user.avatarUrl.trim() !== "" ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-black text-white uppercase tracking-tighter">
                  {mounted && user ? (user.name?.slice(0, 2) || user.email.slice(0, 2) || "??") : "??"}
                </span>
              )}
            </div>
            {mounted && user && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className={`text-[0.78rem] font-bold truncate transition-colors ${activeTab === "PROFILE" ? "text-indigo-600" : "text-[var(--ink)]"}`}>
              {mounted && user ? (user.name || user.email.split('@')[0]) : "Loading..."}
            </p>
            <p className="text-[0.65rem] font-medium text-[var(--ink-soft)] opacity-60 truncate">
              {mounted && user ? user.email : "Connecting..."}
            </p>
          </div>
        </div>

        <button 
          onClick={logout} 
          disabled={!mounted}
          className="w-full flex items-center justify-between px-3 py-2 text-[0.72rem] font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors group disabled:opacity-50"
        >
          Logout Account
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
      </div>
    </aside>
  );
};

const formatRelativeTime = (date: string | Date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export const RoomCard = ({ room }: { room: any }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const members = room.memberCount ?? room.members?.length ?? 0;
  const lastMessage =
    room.lastMessage?.text ||
    room.lastMessage?.content ||
    "No recent message yet.";
  const roomPathId = room.id ?? room.roomId;
  const isPrivate = room.visibility === "PRIVATE";
  const timeAgo = formatRelativeTime(room.createdAt);

  return (
    <div
      className="cursor-pointer rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(13,91,215,.42)] hover:shadow-[0_14px_32px_rgba(13,91,215,.08)]"
      onClick={() => {
        if (!roomPathId) return;
        window.location.href = `/room/${roomPathId}`;
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-base">{room.name || "Untitled Room"}</h3>
          {isPrivate && (
            <span className="rounded-[4px] bg-[rgba(26,26,26,0.08)] px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
              Private
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full border border-[rgba(47,99,64,.38)] bg-[rgba(47,99,64,.14)] px-2 py-[2px] text-[0.8rem] text-[#24543a]">
            {members} {members === 1 ? "member" : "members"}
          </span>
          {mounted && timeAgo && (
            <span className="text-[0.68rem] font-medium tracking-tight text-[var(--ink-soft)] opacity-60">
              Created {timeAgo}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-[0.86rem] leading-[1.4] soft-copy line-clamp-1">
        {lastMessage}
      </p>
    </div>
  );
};

const stringToColor = (str: string) => {
  if (!str) return "#6366f1";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 55%)`;
};
