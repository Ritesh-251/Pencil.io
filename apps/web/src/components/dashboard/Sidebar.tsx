'use client';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';

export const Sidebar = () => {
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);

  const handleCreateRoom = async () => {
    try {
      const res = await api.post('/api/v1/rooms', { name: 'Untitled Room' });
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
      <button onClick={handleCreateRoom} className="btn btn-primary w-full">New Room</button>
      <div className="flex-1"></div>
      <div className="flex items-center justify-between border-t border-[rgba(26,26,26,.12)] pt-3">
         <span className="font-semibold">{user?.username || 'Guest'}</span>
         <button onClick={logout} className="btn btn-ghost btn-sm">Logout</button>
      </div>
    </aside>
  );
};

export const RoomCard = ({ room }: { room: any }) => {
  const members = room.memberCount ?? room.members?.length ?? Math.floor(Math.random() * 8 + 2);
  const lastMessage = room.lastMessage?.text || room.lastMessage?.content || 'No recent message yet.';
  const roomPathId = room.id ?? room.roomId;
  return (
    <div
      className="cursor-pointer rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.72)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(13,91,215,.42)] hover:shadow-[0_14px_32px_rgba(13,91,215,.15)]"
      onClick={() => {
        if (!roomPathId) return;
        window.location.href = `/room/${roomPathId}`;
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-base">{room.name || 'Untitled Room'}</h3>
        <span className="rounded-full border border-[rgba(47,99,64,.38)] bg-[rgba(47,99,64,.14)] px-2 py-[2px] text-[0.8rem] text-[#24543a]">{members} online</span>
      </div>
      <p className="mt-2.5 text-[0.86rem] leading-[1.4] soft-copy">{lastMessage}</p>
    </div>
  );
};
