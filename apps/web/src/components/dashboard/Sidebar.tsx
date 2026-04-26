'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';

export const Sidebar = () => {
  const [mounted, setMounted] = useState(false);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCreateRoom = async () => {
    try {
      const res = await api.post('/api/v1/rooms', { 
        name: 'Untitled Room',
        visibility: visibility
      });
      window.location.href = `/room/${res.room.id}`;
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <aside className="glass flex flex-col gap-3 rounded-[20px] p-4">
      <div>
        <p className="m-0 text-[0.72rem] uppercase tracking-[0.12em] text-[var(--ink-soft)]">Workspace</p>
        <div className="mt-1 text-[1.2rem] font-bold tracking-[-0.02em]">Pencil.io</div>
      </div>
      <div className="grid gap-1">
        <div className="rounded-[10px] border border-[rgba(26,26,26,.2)] bg-[rgba(13,91,215,.13)] px-3 py-2.5 text-[var(--ink)]">Rooms</div>
        <div className="rounded-[10px] px-3 py-2.5 soft-copy">Shared Files</div>
        <div className="rounded-[10px] px-3 py-2.5 soft-copy">Activity</div>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-1 rounded-[12px] bg-[rgba(26,26,26,0.05)] p-1">
          <button 
            onClick={() => setVisibility('PUBLIC')}
            className={`flex-1 rounded-[8px] py-1.5 text-[0.75rem] font-medium transition-all ${visibility === 'PUBLIC' ? 'bg-white shadow-sm' : 'text-[var(--ink-soft)] hover:bg-[rgba(26,26,26,0.03)]'}`}
          >
            Public
          </button>
          <button 
            onClick={() => setVisibility('PRIVATE')}
            className={`flex-1 rounded-[8px] py-1.5 text-[0.75rem] font-medium transition-all ${visibility === 'PRIVATE' ? 'bg-white shadow-sm' : 'text-[var(--ink-soft)] hover:bg-[rgba(26,26,26,0.03)]'}`}
          >
            Private
          </button>
        </div>
        <button onClick={handleCreateRoom} className="btn btn-primary w-full">New Room</button>
      </div>

      <div className="flex-1"></div>
      <div className="flex items-center justify-between border-t border-[rgba(26,26,26,.12)] pt-3">
         <span className="font-semibold">{mounted ? (user?.username || 'Guest') : 'Guest'}</span>
         <button onClick={logout} className="btn btn-ghost btn-sm">Logout</button>
      </div>
    </aside>
  );
};

export const RoomCard = ({ room }: { room: any }) => {
  const members = room.memberCount ?? room.members?.length ?? 0;
  const lastMessage = room.lastMessage?.text || room.lastMessage?.content || 'No recent message yet.';
  const roomPathId = room.id ?? room.roomId;
  const isPrivate = room.visibility === 'PRIVATE';

  return (
    <div
      className="cursor-pointer rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.72)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(13,91,215,.42)] hover:shadow-[0_14px_32_rgba(13,91,215,.15)]"
      onClick={() => {
        if (!roomPathId) return;
        window.location.href = `/room/${roomPathId}`;
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-base">{room.name || 'Untitled Room'}</h3>
          {isPrivate && (
            <span className="rounded-[4px] bg-[rgba(26,26,26,0.08)] px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-[var(--ink-soft)]">Private</span>
          )}
        </div>
        <span className="rounded-full border border-[rgba(47,99,64,.38)] bg-[rgba(47,99,64,.14)] px-2 py-[2px] text-[0.8rem] text-[#24543a]">{members} online</span>
      </div>
      <p className="mt-2.5 text-[0.86rem] leading-[1.4] soft-copy">{lastMessage}</p>
    </div>
  );
};
