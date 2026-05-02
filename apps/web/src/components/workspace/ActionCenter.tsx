"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  UserPlus, 
  Calendar,
  AlertCircle,
  Users,
  LogOut
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

interface Task {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  assignee?: { email: string, avatarUrl: string | null } | null;
}

interface Member {
  userId: string;
  user: { email: string };
}

export const ActionCenter = ({ roomId }: { roomId: string }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showAssigneePicker, setShowAssigneePicker] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksRes, membersRes] = await Promise.all([
        api.get(`/api/v1/tasks?roomId=${roomId}`),
        api.get(`/api/v1/rooms/${roomId}/members`)
      ]);
      setTasks(tasksRes.tasks || []);
      setMembers(membersRes.members || []);
    } catch (e) {
      console.error("Failed to fetch Action Center data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [roomId]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      const res = await api.post("/api/v1/tasks", { 
        title: newTaskTitle, 
        roomId,
        priority: "MEDIUM" 
      });
      setTasks(prev => [res.task, ...prev]);
      setNewTaskTitle("");
    } catch (e) {
      console.error("Failed to add task:", e);
    }
  };

  const toggleTask = async (task: Task) => {
    const newStatus = task.status === "DONE" ? "TODO" : "DONE";
    try {
      const res = await api.patch(`/api/v1/tasks/${task.id}`, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? res.task : t));
    } catch (e) {
      console.error("Failed to toggle task:", e);
    }
  };

  const handleAssign = async (taskId: string, userId: string | null) => {
    try {
      const res = await api.patch(`/api/v1/tasks/${taskId}`, { assigneeId: userId });
      setTasks(prev => prev.map(t => t.id === taskId ? res.task : t));
      setShowAssigneePicker(null);
    } catch (e) {
      console.error("Failed to assign task:", e);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await api.delete(`/api/v1/tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error("Failed to delete task:", e);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-[rgba(26,26,26,0.05)] flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--ink-soft)] flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          Project Actions
        </h3>
        <span className="px-2 py-0.5 bg-[rgba(13,91,215,0.1)] text-indigo-600 text-[10px] font-black rounded-full backdrop-blur-sm border border-[rgba(13,91,215,0.1)]">
          {tasks.filter(t => t.status !== 'DONE').length} Left
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4">
        <form onSubmit={handleAddTask} className="relative group">
          <input 
            type="text" 
            placeholder="Delegate a new task..."
            className="w-full bg-[rgba(26,26,26,0.04)] border border-[rgba(26,26,26,0.02)] rounded-2xl px-4 py-3 text-[0.82rem] font-medium focus:ring-2 focus:ring-indigo-500 transition-all pr-10 placeholder:text-[rgba(26,26,26,0.3)] shadow-inner"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-indigo-500 opacity-0 group-focus-within:opacity-100 transition-opacity">
            <Plus className="w-4 h-4" />
          </button>
        </form>

        {loading ? (
          <div className="py-20 text-center flex flex-col items-center gap-4">
            <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Syncing actions...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tasks.map((task) => (
              <div key={task.id} className={`group flex flex-col gap-3 p-4 rounded-[22px] border transition-all duration-300 ${task.status === 'DONE' ? 'bg-[rgba(26,26,26,0.02)] border-transparent opacity-50' : 'bg-[rgba(255,255,255,0.6)] border-[rgba(26,26,26,0.04)] hover:border-indigo-200 hover:shadow-xl hover:-translate-y-0.5 shadow-sm backdrop-blur-md'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <button onClick={() => toggleTask(task)} className={`mt-0.5 transition-all duration-200 transform active:scale-90 ${task.status === 'DONE' ? 'text-emerald-500' : 'text-[rgba(26,26,26,0.15)] hover:text-indigo-500'}`}>
                      {task.status === 'DONE' ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </button>
                    <span className={`text-[0.85rem] font-semibold leading-relaxed tracking-tight ${task.status === 'DONE' ? 'line-through text-[var(--ink-soft)]' : 'text-[var(--ink)]'}`}>
                      {task.title}
                    </span>
                  </div>
                  <button onClick={() => deleteTask(task.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-1 pt-3 border-t border-[rgba(26,26,26,0.03)]">
                  <div className="relative">
                    <button 
                      onClick={() => setShowAssigneePicker(showAssigneePicker === task.id ? null : task.id)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${task.assignee ? 'bg-indigo-600 text-white shadow-md' : 'bg-[rgba(26,26,26,0.05)] text-[var(--ink-soft)] hover:bg-indigo-50 hover:text-indigo-600'}`}
                    >
                      {task.assignee ? (
                        <>
                          {task.assignee.avatarUrl ? (
                            <img src={task.assignee.avatarUrl} alt="" className="w-4 h-4 rounded-full border border-white/20" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[7px] text-white">
                              {task.assignee.email?.[0]?.toUpperCase()}
                            </div>
                          )}
                          {task.assignee.email?.split('@')[0]}
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Assign
                        </>
                      )}
                    </button>

                    {showAssigneePicker === task.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowAssigneePicker(null)} />
                        <div className="absolute left-0 bottom-full mb-3 w-56 glass rounded-[20px] shadow-2xl z-20 overflow-hidden border border-[rgba(26,26,26,0.08)] animate-in fade-in slide-in-from-bottom-2 duration-200">
                          <div className="p-3 border-b border-[rgba(26,26,26,0.05)] bg-[rgba(26,26,26,0.02)] text-[10px] font-black uppercase tracking-widest text-[var(--ink-soft)] flex items-center gap-2">
                            <Users className="w-3.5 h-3.5" /> Delegate To
                          </div>
                          <div className="max-h-52 overflow-y-auto custom-scrollbar p-1">
                            <button 
                              onClick={() => handleAssign(task.id, null)}
                              className="w-full text-left px-3 py-2.5 text-[11px] hover:bg-red-50 text-red-500 font-bold border-b border-[rgba(26,26,26,0.03)] flex items-center gap-2"
                            >
                              <LogOut className="w-3 h-3" /> Unassign Task
                            </button>
                            {members.map(m => (
                              <button
                                key={m.userId}
                                onClick={() => handleAssign(task.id, m.userId)}
                                className="w-full text-left px-3 py-2.5 text-[11px] font-semibold hover:bg-indigo-50 transition-colors flex items-center justify-between rounded-lg"
                              >
                                <span className="truncate max-w-[120px]">{m.user.email}</span>
                                {task.assignee?.email === m.user.email && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {task.status !== 'DONE' && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 border border-amber-100">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[9px] font-black text-amber-600 uppercase tracking-tight">Active</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="py-24 text-center flex flex-col items-center gap-4 opacity-10">
                <Calendar className="w-12 h-12" />
                <p className="text-[11px] font-black uppercase tracking-[0.2em]">Execution Required</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
