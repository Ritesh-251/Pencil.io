"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { 
  Calendar, 
  Clock, 
  Users, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  Circle, 
  AlertCircle,
  Clock3,
  Layout
} from "lucide-react";

interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  roomId: string;
  room: { name: string | null };
  attendees: string[];
}

interface Task {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  room: { name: string | null } | null;
}

export const PlannerView = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<"schedule" | "tasks">("schedule");
  const [loading, setLoading] = useState(true);
  const { token } = useAuthStore();

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [meetingsRes, tasksRes] = await Promise.all([
        api.get("/api/v1/planning"),
        api.get("/api/v1/tasks")
      ]);
      setMeetings(meetingsRes.meetings || []);
      setTasks(tasksRes.tasks || []);
    } catch (e) {
      console.error("[PlannerView] Failed to fetch data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleDeleteMeeting = async (id: string) => {
    if (!confirm("Are you sure you want to delete this meeting?")) return;
    try {
      await api.delete(`/api/v1/planning/${id}`);
      setMeetings((m) => m.filter((meet) => meet.id !== id));
    } catch (e) {
      console.error("[PlannerView] Failed to delete meeting:", e);
    }
  };

  const handleToggleTask = async (task: Task) => {
    const newStatus = task.status === "DONE" ? "TODO" : "DONE";
    try {
      const res = await api.patch(`/api/v1/tasks/${task.id}`, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? res.task : t)));
    } catch (e) {
      console.error("[PlannerView] Failed to update task:", e);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    try {
      await api.delete(`/api/v1/tasks/${id}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error("[PlannerView] Failed to delete task:", e);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
    </div>
  );

  return (
    <div className="flex flex-col gap-6 h-full">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="ink-title m-0 text-[1.8rem]">Workspace Planner</h2>
          <div className="flex gap-4 mt-3">
            <button 
              onClick={() => setActiveTab("schedule")}
              className={`text-[0.88rem] font-semibold transition-colors ${activeTab === "schedule" ? "text-[var(--brand)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
            >
              Upcoming Meetings ({meetings.length})
            </button>
            <button 
              onClick={() => setActiveTab("tasks")}
              className={`text-[0.88rem] font-semibold transition-colors ${activeTab === "tasks" ? "text-[var(--brand)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
            >
              Action Items ({tasks.filter(t => t.status !== "DONE").length})
            </button>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2 px-4 py-2 text-sm">
          <Plus className="w-4 h-4" />
          {activeTab === "schedule" ? "Schedule" : "Add Task"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {activeTab === "schedule" ? (
          meetings.length === 0 ? (
            <EmptyState icon={<Calendar className="w-12 h-12" />} text="No meetings scheduled yet." />
          ) : (
            <div className="grid gap-4">
              {meetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} onDelete={handleDeleteMeeting} />
              ))}
            </div>
          )
        ) : (
          tasks.length === 0 ? (
            <EmptyState icon={<Layout className="w-12 h-12" />} text="No tasks yet. Start planning your studio work." />
          ) : (
            <div className="grid gap-3">
              {tasks.map((task) => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onToggle={() => handleToggleTask(task)} 
                  onDelete={() => handleDeleteTask(task.id)} 
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

const EmptyState = ({ icon, text }: { icon: React.ReactNode, text: string }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-12 border border-dashed border-[rgba(26,26,26,0.1)] rounded-[32px] bg-[rgba(26,26,26,0.01)] min-h-[300px]">
    <div className="text-[var(--ink-soft)] opacity-20 mb-4">
      {icon}
    </div>
    <p className="soft-copy text-center">{text}</p>
  </div>
);

const MeetingCard = ({ meeting, onDelete }: { meeting: Meeting, onDelete: (id: string) => void }) => (
  <div className="glass border border-[rgba(26,26,26,0.06)] p-5 rounded-[24px] hover:border-[var(--brand-soft)] transition-all group">
    <div className="flex justify-between items-start">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-lg font-bold text-[var(--ink)]">{meeting.title}</h3>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs soft-copy">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            {new Date(meeting.startTime).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="flex items-center gap-1.5 text-xs soft-copy">
            <Users className="w-3.5 h-3.5 text-emerald-500" />
            {meeting.attendees.length} Attendees
          </div>
        </div>
      </div>
      <button onClick={() => onDelete(meeting.id)} className="p-2 rounded-full hover:bg-red-50 text-red-400 opacity-0 group-hover:opacity-100 transition-all">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
    <div className="mt-4 pt-4 border-t border-[rgba(26,26,26,0.05)] flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-indigo-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600/70">
          Room: {meeting.room?.name || "General"}
        </span>
      </div>
      <button className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors" onClick={() => (window.location.href = `/room/${meeting.roomId}`)}>
        Join Room →
      </button>
    </div>
  </div>
);

const TaskCard = ({ task, onToggle, onDelete }: { task: Task, onToggle: () => void, onDelete: () => void }) => {
  const isDone = task.status === "DONE";
  return (
    <div className={`flex items-center justify-between p-4 rounded-[20px] border transition-all group ${isDone ? 'bg-[rgba(26,26,26,0.02)] border-transparent opacity-60' : 'bg-white border-[rgba(26,26,26,0.08)] shadow-sm hover:border-[var(--brand-soft)]'}`}>
      <div className="flex items-center gap-4 flex-1">
        <button onClick={onToggle} className={`transition-colors ${isDone ? 'text-emerald-500' : 'text-[var(--ink-soft)] hover:text-[var(--brand)]'}`}>
          {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
        </button>
        <div className="flex flex-col gap-0.5">
          <span className={`text-[0.94rem] font-medium ${isDone ? 'line-through text-[var(--ink-soft)]' : 'text-[var(--ink)]'}`}>
            {task.title}
          </span>
          <div className="flex items-center gap-3">
            {task.priority === "HIGH" && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 uppercase">
                <AlertCircle className="w-3 h-3" /> High Priority
              </span>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--ink-soft)] uppercase tracking-wider">
                <Clock3 className="w-3 h-3" /> Due {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
            {task.room && (
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded">
                {task.room.name}
              </span>
            )}
          </div>
        </div>
      </div>
      <button onClick={onDelete} className="p-2 text-[var(--ink-soft)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};
