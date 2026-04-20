'use client';
import { Sidebar, RoomCard } from '@/components/dashboard/Sidebar';
import { useRoomStore } from '@/store/room.store';
import { useEffect } from 'react';
import Image from 'next/image';

export default function DashboardPage() {
  const fetchRooms = useRoomStore(s => s.fetchRooms);
  const rooms = useRoomStore(s => s.rooms);
  const loading = useRoomStore(s => s.loading);

  useEffect(() => {
    fetchRooms();
  }, []);

  return (
    <div className="app-shell ambient-noise grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_1fr]">
      <Sidebar />
      <main className="glass rounded-[20px] p-5 sm:p-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ink-title m-0 text-[2.1rem]">Creative Rooms</h1>
            <p className="soft-copy mt-1">Realtime spaces for drawing, chat, and fast decisions.</p>
          </div>
          <div className="rounded-xl border border-[rgba(26,26,26,.18)] bg-[rgba(255,250,241,.7)] px-3 py-2 text-[0.78rem] font-semibold text-[var(--ink-soft)]">
            {rooms.length} active room{rooms.length === 1 ? '' : 's'}
          </div>
        </header>
        {loading ? (
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
            <p className="mt-4 text-center text-[0.92rem] soft-copy">No rooms yet. Create one to start collaborating.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {rooms.map(r => <RoomCard key={r.id ?? r.roomId} room={r} />)}
          </div>
        )}
      </main>
    </div>
  );
}
