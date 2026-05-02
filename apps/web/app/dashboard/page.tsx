"use client";
import {
  Sidebar,
  RoomCard,
  DashboardTab,
} from "@/components/dashboard/Sidebar";
import { VerificationBanner } from "@/components/dashboard/VerificationBanner";
import { InboxView } from "@/components/dashboard/InboxView";
import { PlannerView } from "@/components/dashboard/PlannerView";
import { ProfileView } from "@/components/dashboard/ProfileView";
import { WSClient } from "@/lib/ws";
import { useAuthStore } from "@/store/auth.store";
import { useRoomStore } from "@/store/room.store";
import { useNotificationStore } from "@/store/notification.store";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Folder } from "lucide-react";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("ROOMS");
  const { user } = useAuthStore();
  const { rooms, fetchRooms, loading: roomsLoading } = useRoomStore();
  const { fetchUnreadCount, incrementUnread } = useNotificationStore();

  useEffect(() => {
    if (user) {
      fetchRooms();
      fetchUnreadCount();

      // Connect to global notifications pulse
      const ws = WSClient.getInstance();
      const token = localStorage.getItem("token");
      if (token) {
        ws.connect("DASHBOARD", token, {
          name: user.name || undefined,
          avatarUrl: user.avatarUrl || undefined,
        });

        const unsub = ws.on("notification:new", (payload) => {
          console.log("[WS] New Notification received:", payload);
          incrementUnread();
        });

        return () => {
          unsub();
        };
      }
    }
  }, [user, fetchRooms, fetchUnreadCount, incrementUnread]);

  const renderContent = () => {
    if (activeTab === "PLANNER") {
      return <PlannerView />;
    }

    if (activeTab === "INBOX") {
      return <InboxView />;
    }


    if (activeTab === "PROFILE") {
      return <ProfileView />;
    }

    return (
      <>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ink-title m-0 text-[2.1rem]">Creative Rooms</h1>
            <p className="soft-copy mt-1">
              Realtime spaces for drawing, chat, and fast decisions.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.4)] px-3 py-2 text-[0.78rem] font-black text-[var(--ink-soft)] uppercase tracking-widest shadow-sm">
            {rooms.length} active room{rooms.length === 1 ? "" : "s"}
          </div>
        </header>
        {roomsLoading ? (
          <p className="soft-copy">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <div className="grid min-h-[58vh] place-items-center p-8">
            <Image
              src="/empty-room.svg"
              alt="No rooms yet"
              width={360}
              height={260}
              className="h-auto w-full max-w-[360px] opacity-90 mix-blend-multiply"
              priority
            />
            <p className="mt-4 text-center text-[0.92rem] soft-copy">
              No rooms yet. Create one to start collaborating.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {rooms.map((r) => (
              <RoomCard key={r.id ?? r.roomId} room={r} />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="app-shell ambient-noise grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_1fr]">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex flex-col min-w-0">
        <VerificationBanner />
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[24px] p-5 sm:p-8 mt-2 flex-1 shadow-sm">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
