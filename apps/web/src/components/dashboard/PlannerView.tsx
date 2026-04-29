"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { Calendar, Clock, Users, Trash2, Plus } from "lucide-react";

interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  roomId: string;
  room: { name: string | null };
  attendees: string[];
}

export const PlannerView = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuthStore();

  const fetchMeetings = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await api.get("/api/v1/planning");
      setMeetings(res.meetings || []);
    } catch (e) {
      console.error("[PlannerView] Failed to fetch meetings:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this meeting?")) return;
    try {
      await api.delete(`/api/v1/planning/${id}`);
      setMeetings((m) => m.filter((meet) => meet.id !== id));
    } catch (e) {
      console.error("[PlannerView] Failed to delete:", e);
    }
  };

  if (loading) return <p className="soft-copy">Loading schedule...</p>;

  return (
    <div className="flex flex-col gap-6 h-full">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="ink-title m-0 text-[1.8rem]">Planner</h2>
          <p className="soft-copy mt-1">
            Manage your upcoming collaborative sessions.
          </p>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Schedule Meeting
        </button>
      </header>

      {meetings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 border border-dashed border-[rgba(26,26,26,0.1)] rounded-[32px]">
          <Calendar className="w-12 h-12 text-[var(--ink-soft)] opacity-20 mb-4" />
          <p className="soft-copy text-center">
            No meetings scheduled yet.
            <br />
            Create one to invite your team.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="glass border border-[rgba(26,26,26,0.06)] p-5 rounded-[24px] hover:border-indigo-500/30 transition-all group"
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <h3 className="m-0 text-lg font-bold text-[var(--ink)]">
                    {meeting.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5 text-xs soft-copy">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      {new Date(meeting.startTime).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs soft-copy">
                      <Users className="w-3.5 h-3.5 text-emerald-500" />
                      {meeting.attendees.length} Attendees
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(meeting.id)}
                  className="p-2 rounded-full hover:bg-red-50 text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-[rgba(26,26,26,0.05)] flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600/70">
                    Room: {meeting.room.name || "General"}
                  </span>
                </div>
                <button
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                  onClick={() =>
                    (window.location.href = `/room/${meeting.roomId}`)
                  }
                >
                  Join Room →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
