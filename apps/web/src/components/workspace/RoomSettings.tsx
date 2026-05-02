"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { 
  Users, 
  UserMinus, 
  Shield, 
  LogOut, 
  X, 
  Settings,
  MoreVertical,
  Check,
  Trash2
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

interface Member {
  userId: string;
  role: "ADMIN" | "MEMBER";
  user: {
    id: string;
    email: string;
    avatarUrl: string | null;
  };
}

export const RoomSettings = ({ roomId, isHost }: { roomId: string, isHost: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const user = useAuthStore(s => s.user);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/v1/rooms/${roomId}/members`);
      setMembers(res.members || []);
    } catch (e) {
      console.error("Failed to fetch members:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchMembers();
  }, [isOpen]);

  const handleLeave = async () => {
    const message = isHost 
      ? "As the owner, if you leave, administrative control will be transferred to the next member who joined. Are you sure you want to leave?"
      : "Are you sure you want to leave this room?";
    
    if (!confirm(message)) return;
    try {
      await api.post(`/api/v1/rooms/${roomId}/leave`);
      window.location.href = "/dashboard";
    } catch (e) {
      console.error("Failed to leave room:", e);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this member from the room?")) return;
    try {
      await api.delete(`/api/v1/rooms/${roomId}/members/${userId}`);
      setMembers(prev => prev.filter(m => m.userId !== userId));
    } catch (e) {
      console.error("Failed to remove member:", e);
    }
  };

  const toggleRole = async (member: Member) => {
    const newRole = member.role === "ADMIN" ? "MEMBER" : "ADMIN";
    try {
      await api.patch(`/api/v1/rooms/${roomId}/members/${member.userId}/role`, { role: newRole });
      setMembers(prev => prev.map(m => m.userId === member.userId ? { ...m, role: newRole } : m));
    } catch (e) {
      console.error("Failed to update role:", e);
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="icon-btn"
        title="Room Settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 glass rounded-3xl shadow-2xl z-50 border border-[rgba(26,26,26,0.08)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 border-b border-[rgba(26,26,26,0.05)] flex items-center justify-between bg-[rgba(26,26,26,0.02)]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                Room Members
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-[rgba(26,26,26,0.4)] hover:text-[rgba(26,26,26,0.8)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-2 custom-scrollbar">
              {loading ? (
                <div className="py-8 text-center text-xs text-[var(--ink-soft)]">Loading members...</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {members.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between p-2 rounded-xl hover:bg-[rgba(26,26,26,0.03)] group transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                          {m.user.email.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-semibold truncate max-w-[120px]">{m.user.email}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-widest ${m.role === 'ADMIN' ? 'text-indigo-500' : 'text-[var(--ink-soft)]'}`}>
                            {m.role}
                          </span>
                        </div>
                      </div>

                      {isHost && m.userId !== user?.id && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => toggleRole(m)}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400"
                            title={m.role === 'ADMIN' ? "Make Member" : "Make Admin"}
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleRemoveMember(m.userId)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                            title="Remove from room"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-[rgba(26,26,26,0.02)] border-t border-[rgba(26,26,26,0.05)] flex flex-col gap-2">
              <button 
                onClick={handleLeave}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-[11px] font-black uppercase tracking-wider text-[var(--ink-soft)] hover:bg-[rgba(26,26,26,0.04)] rounded-xl transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                Leave Room
              </button>

              {isHost && (
                <button 
                  onClick={async () => {
                    if (confirm("CRITICAL: This will permanently delete the room and all its data. This cannot be undone. Are you sure?")) {
                      try {
                        await api.delete(`/api/v1/rooms/${roomId}`);
                        window.location.href = "/dashboard";
                      } catch (e) {
                        console.error("Failed to delete room:", e);
                      }
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-[11px] font-black uppercase tracking-wider text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Room Permanently
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
