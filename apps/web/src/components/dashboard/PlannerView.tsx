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
  Layout,
  Target,
  Play
} from "lucide-react";
import { useTimerStore } from "@/store/timer.store";

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
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  room: { name: string | null } | null;
  meeting: { title: string } | null;
  assignee: { email: string, avatarUrl: string | null } | null;
}

export const PlannerView = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<"schedule" | "tasks">("schedule");
  const [loading, setLoading] = useState(true);
  const { token } = useAuthStore();

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    dueDate: "",
    assigneeId: ""
  });
  const [taskAssigneeSearch, setTaskAssigneeSearch] = useState("");
  const [taskAssigneeSuggestions, setTaskAssigneeSuggestions] = useState<{id: string, email: string}[]>([]);
  const [selectedTaskAssignee, setSelectedTaskAssignee] = useState<{id: string, email: string} | null>(null);
  const [rooms, setRooms] = useState<{roomId: string, name: string}[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [userSuggestions, setUserSuggestions] = useState<{id: string, email: string}[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  
  const [newMeeting, setNewMeeting] = useState({
    title: "",
    startTime: "",
    endTime: "",
    roomId: ""
  });
  const [prepTasks, setPrepTasks] = useState<string[]>([]);
  const [currentPrepTask, setCurrentPrepTask] = useState("");

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [meetingsRes, tasksRes, roomsRes] = await Promise.all([
        api.get("/api/v1/planning"),
        api.get("/api/v1/tasks"),
        api.get("/api/v1/rooms")
      ]);
      setMeetings(meetingsRes.meetings || []);
      setTasks(tasksRes.tasks || []);
      setRooms(roomsRes.rooms || []);
    } catch (e) {
      console.error("[PlannerView] Failed to fetch data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (attendeeSearch.length >= 2) {
        try {
          const res = await api.get(`/api/v1/auth/search?q=${attendeeSearch}`);
          setUserSuggestions(res.users || []);
        } catch (e) {
          console.error("Failed to search users:", e);
        }
      } else {
        setUserSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [attendeeSearch]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (taskAssigneeSearch.length >= 2) {
        try {
          const res = await api.get(`/api/v1/auth/search?q=${taskAssigneeSearch}`);
          setTaskAssigneeSuggestions(res.users || []);
        } catch (e) {
          console.error("Failed to search users:", e);
        }
      } else {
        setTaskAssigneeSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [taskAssigneeSearch]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    try {
      const res = await api.post("/api/v1/tasks", { 
        ...newTask,
        assigneeId: selectedTaskAssignee?.id || null,
        priority: "MEDIUM"
      });
      setTasks(prev => [res.task, ...prev]);
      setNewTask({ title: "", description: "", dueDate: "", assigneeId: "" });
      setSelectedTaskAssignee(null);
      setTaskAssigneeSearch("");
      setIsTaskModalOpen(false);
    } catch (e) {
      console.error("[PlannerView] Failed to add task:", e);
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeeting.title || !newMeeting.startTime || !newMeeting.endTime) {
      alert("Please fill in the title and time for your meeting.");
      return;
    }

    const start = new Date(newMeeting.startTime);
    const end = new Date(newMeeting.endTime);

    if (start >= end) {
      alert("End time must be after start time");
      return;
    }

    if (start < new Date()) {
      alert("Meeting cannot be scheduled in the past");
      return;
    }

    try {
      const res = await api.post("/api/v1/planning", {
        ...newMeeting,
        roomId: newMeeting.roomId || null, // Send null to trigger room creation
        attendees: selectedAttendees,
        prepTasks
      });
      setMeetings(prev => [...prev, res.meeting].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
      setNewMeeting({ title: "", startTime: "", endTime: "", roomId: "" });
      setSelectedAttendees([]);
      setPrepTasks([]);
      setIsMeetingModalOpen(false);
      fetchData(); // Refresh to get the new room in the list
    } catch (e) {
      console.error("[PlannerView] Failed to schedule meeting:", e);
    }
  };

  const toggleAttendee = (email: string) => {
    setSelectedAttendees(prev => 
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
    setAttendeeSearch("");
    setUserSuggestions([]);
  };

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
    <div className="flex flex-col gap-6 h-full relative">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="ink-title m-0 text-[1.8rem]">Workspace Planner</h2>
          <div className="flex gap-4 mt-3">
            <button 
              onClick={() => setActiveTab("schedule")}
              className={`text-[0.88rem] font-semibold transition-colors relative pb-2 ${activeTab === "schedule" ? "text-[var(--brand)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
            >
              Upcoming Meetings ({meetings.length})
              {activeTab === "schedule" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--brand)] rounded-full" />}
            </button>
            <button 
              onClick={() => setActiveTab("tasks")}
              className={`text-[0.88rem] font-semibold transition-colors relative pb-2 ${activeTab === "tasks" ? "text-[var(--brand)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
            >
              Action Items ({tasks.filter(t => t.status !== "DONE").length})
              {activeTab === "tasks" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--brand)] rounded-full" />}
            </button>
          </div>
        </div>
        <button 
          onClick={() => activeTab === 'tasks' ? setIsTaskModalOpen(true) : setIsMeetingModalOpen(true)}
          className="btn btn-primary flex items-center gap-2 px-4 py-2 text-sm shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          {activeTab === "schedule" ? "Schedule" : "Add Task"}
        </button>
      </header>

      {isTaskModalOpen && (
        <div className="absolute inset-0 z-20 bg-[rgba(26,26,26,0.08)] rounded-[24px] flex items-center justify-center p-6 animate-in fade-in duration-200 backdrop-blur-[2px]">
          <form onSubmit={handleAddTask} className="bg-[var(--bg-surface)] border border-[rgba(26,26,26,0.1)] p-8 rounded-[32px] w-full max-w-lg shadow-2xl flex flex-col gap-5">
            <h3 className="text-2xl font-black tracking-tight mb-2">New Action Item</h3>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--ink-soft)] px-1">Task Title</label>
              <input 
                autoFocus
                type="text" 
                placeholder="What needs to be done?"
                className="w-full bg-[rgba(26,26,26,0.03)] border-none rounded-2xl px-4 py-3.5 text-sm font-semibold focus:ring-2 focus:ring-[var(--brand)]"
                value={newTask.title}
                onChange={(e) => setNewTask({...newTask, title: e.target.value})}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--ink-soft)] px-1">Brief Description</label>
              <textarea 
                placeholder="Add more context or notes..."
                className="w-full bg-[rgba(26,26,26,0.03)] border-none rounded-2xl px-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-[var(--brand)] min-h-[100px] resize-none"
                value={newTask.description}
                onChange={(e) => setNewTask({...newTask, description: e.target.value})}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--ink-soft)] px-1">Due Date (Optional)</label>
              <input 
                type="date" 
                className="w-full bg-[rgba(26,26,26,0.03)] border-none rounded-2xl px-4 py-3.5 text-sm font-semibold focus:ring-2 focus:ring-[var(--brand)]"
                value={newTask.dueDate}
                onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--ink-soft)] px-1">Assign To (Optional)</label>
              <div className="relative">
                {selectedTaskAssignee ? (
                  <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 text-sm">
                    <span className="font-bold text-indigo-600">{selectedTaskAssignee.email}</span>
                    <button type="button" onClick={() => setSelectedTaskAssignee(null)} className="text-indigo-400 hover:text-indigo-600">×</button>
                  </div>
                ) : (
                  <input 
                    type="text" 
                    placeholder="Search by email..."
                    className="w-full bg-[rgba(26,26,26,0.03)] border-none rounded-2xl px-4 py-3.5 text-sm font-semibold focus:ring-2 focus:ring-[var(--brand)]"
                    value={taskAssigneeSearch}
                    onChange={(e) => setTaskAssigneeSearch(e.target.value)}
                  />
                )}
                {!selectedTaskAssignee && taskAssigneeSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[rgba(26,26,26,0.1)] rounded-2xl shadow-xl z-30 max-h-40 overflow-y-auto overflow-hidden">
                    {taskAssigneeSuggestions.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedTaskAssignee(u);
                          setTaskAssigneeSearch("");
                          setTaskAssigneeSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors border-b last:border-0"
                      >
                        {u.email}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => setIsTaskModalOpen(false)} className="btn btn-ghost px-6 py-2.5 text-sm font-bold">Cancel</button>
              <button type="submit" className="btn btn-primary px-8 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25">Create Task</button>
            </div>
          </form>
        </div>
      )}

      {isMeetingModalOpen && (
        <div className="absolute inset-0 z-20 bg-[rgba(26,26,26,0.08)] rounded-[24px] flex items-center justify-center p-6 animate-in fade-in duration-200 overflow-y-auto backdrop-blur-[2px]">
          <form onSubmit={handleScheduleMeeting} className="bg-[var(--bg-surface)] border border-[rgba(26,26,26,0.1)] p-8 rounded-[32px] w-full max-w-md shadow-2xl flex flex-col gap-4 my-auto">
            <h3 className="text-2xl font-black tracking-tight">Schedule Meeting</h3>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase text-[var(--ink-soft)] px-1">Title</label>
              <input 
                autoFocus
                type="text" 
                placeholder="Meeting Topic"
                className="w-full bg-[rgba(26,26,26,0.05)] border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--brand)]"
                value={newMeeting.title}
                onChange={(e) => setNewMeeting({...newMeeting, title: e.target.value})}
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase text-[var(--ink-soft)] px-1">Invite People</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search by email..."
                  className="w-full bg-[rgba(26,26,26,0.05)] border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--brand)]"
                  value={attendeeSearch}
                  onChange={(e) => setAttendeeSearch(e.target.value)}
                />
                {userSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[rgba(26,26,26,0.1)] rounded-xl shadow-xl z-30 max-h-40 overflow-y-auto">
                    {userSuggestions.map(user => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleAttendee(user.email)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-[rgba(13,91,215,0.05)] transition-colors flex items-center justify-between"
                      >
                        <span>{user.email}</span>
                        {selectedAttendees.includes(user.email) && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedAttendees.map(email => (
                  <span key={email} className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-lg flex items-center gap-1 group">
                    {email}
                    <button type="button" onClick={() => toggleAttendee(email)} className="hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase text-[var(--ink-soft)] px-1">Start Time</label>
                <input 
                  type="datetime-local" 
                  className="w-full bg-[rgba(26,26,26,0.05)] border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--brand)]"
                  value={newMeeting.startTime}
                  onChange={(e) => setNewMeeting({...newMeeting, startTime: e.target.value})}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase text-[var(--ink-soft)] px-1">End Time</label>
                <input 
                  type="datetime-local" 
                  className="w-full bg-[rgba(26,26,26,0.05)] border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--brand)]"
                  value={newMeeting.endTime}
                  onChange={(e) => setNewMeeting({...newMeeting, endTime: e.target.value})}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase text-[var(--ink-soft)] px-1">Meeting Destination</label>
              <select 
                className="w-full bg-[rgba(26,26,26,0.05)] border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--brand)]"
                value={newMeeting.roomId}
                onChange={(e) => setNewMeeting({...newMeeting, roomId: e.target.value})}
              >
                <option value="">Create New Dedicated Room</option>
                <optgroup label="Link to Existing Room">
                  {rooms.map(r => (
                    <option key={r.roomId} value={r.roomId}>{r.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {newMeeting.roomId === "" && (
              <div className="flex flex-col gap-1 animate-in slide-in-from-top-1 duration-200">
                <label className="text-[10px] font-bold uppercase text-indigo-500 px-1">New Room Name</label>
                <input 
                  type="text" 
                  placeholder={newMeeting.title ? `${newMeeting.title} Space` : "Project Name"}
                  className="w-full bg-[rgba(13,91,215,0.03)] border-indigo-100 border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                  onChange={(e) => setNewMeeting({...newMeeting, roomName: e.target.value} as any)}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase text-[var(--ink-soft)] px-1">Prep Tasks (Contextual Actions)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="e.g. Prepare slides"
                  className="flex-1 bg-[rgba(26,26,26,0.05)] border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[var(--brand)]"
                  value={currentPrepTask}
                  onChange={(e) => setCurrentPrepTask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (currentPrepTask.trim()) {
                        setPrepTasks([...prepTasks, currentPrepTask.trim()]);
                        setCurrentPrepTask("");
                      }
                    }
                  }}
                />
                <button 
                  type="button"
                  onClick={() => {
                    if (currentPrepTask.trim()) {
                      setPrepTasks([...prepTasks, currentPrepTask.trim()]);
                      setCurrentPrepTask("");
                    }
                  }}
                  className="btn btn-ghost p-2 rounded-xl"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                {prepTasks.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[rgba(26,26,26,0.02)] px-3 py-1.5 rounded-lg border border-[rgba(26,26,26,0.05)]">
                    <span className="text-xs text-[var(--ink)] font-medium">{t}</span>
                    <button type="button" onClick={() => setPrepTasks(prepTasks.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 transition-colors">×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <button type="button" onClick={() => setIsMeetingModalOpen(false)} className="btn btn-ghost px-4 py-2 text-sm font-semibold">Cancel</button>
              <button type="submit" className="btn btn-primary px-6 py-2 text-sm font-semibold">Schedule</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {activeTab === "schedule" ? (
          meetings.length === 0 ? (
            <EmptyState icon={<Calendar className="w-12 h-12" />} text="No meetings scheduled yet." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    <div className="text-[var(--ink-soft)] opacity-20 mb-4 animate-bounce">
      {icon}
    </div>
    <p className="soft-copy text-center">{text}</p>
  </div>
);

const MeetingCard = ({ meeting, onDelete }: { meeting: Meeting, onDelete: (id: string) => void }) => (
  <div className="bg-[var(--bg-surface)] border border-[rgba(26,26,26,0.06)] p-6 rounded-[32px] hover:border-[var(--brand-soft)] transition-all group hover:shadow-xl hover:shadow-indigo-500/5 relative overflow-hidden">
    <div className="absolute top-0 right-0 p-3">
      <button onClick={() => onDelete(meeting.id)} className="p-2 rounded-full hover:bg-red-50 text-red-400 opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
    <div className="flex flex-col gap-1 pr-8">
      <h3 className="m-0 text-[1.1rem] font-bold text-[var(--ink)] leading-tight">{meeting.title}</h3>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        <div className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-indigo-500">
          <Clock className="w-3.5 h-3.5" />
          {new Date(meeting.startTime).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-emerald-500">
          <Users className="w-3.5 h-3.5" />
          {meeting.attendees.length} Members
        </div>
      </div>
    </div>
    <div className="mt-5 pt-4 border-t border-[rgba(26,26,26,0.05)] flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ink-soft)]">
          {meeting.room?.name || "General"}
        </span>
      </div>
      <button className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 px-3 py-1.5 rounded-full" onClick={() => (window.location.href = `/room/${meeting.roomId}`)}>
        Join Now
      </button>
    </div>
  </div>
);

const TaskCard = ({ task, onToggle, onDelete }: { task: Task, onToggle: () => void, onDelete: () => void }) => {
  const isDone = task.status === "DONE";
  const timer = useTimerStore();
  return (
    <div className={`flex items-center justify-between p-4 rounded-[24px] border transition-all group ${isDone ? 'bg-[rgba(26,26,26,0.02)] border-transparent opacity-60' : 'bg-[var(--bg-surface)] border-[rgba(26,26,26,0.08)] shadow-sm hover:border-[var(--brand-soft)] hover:shadow-md'}`}>
      <div className="flex items-center gap-4 flex-1">
        <button onClick={onToggle} className={`transition-all transform active:scale-90 ${isDone ? 'text-emerald-500' : 'text-[var(--ink-soft)] hover:text-[var(--brand)]'}`}>
          {isDone ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
        </button>
        <div className="flex flex-col gap-1">
          <span className={`text-[1rem] font-bold tracking-tight ${isDone ? 'line-through text-[var(--ink-soft)]' : 'text-[var(--ink)]'}`}>
            {task.title}
          </span>
          {task.description && (
            <p className="text-[0.8rem] text-[var(--ink-soft)] font-medium leading-tight mb-1">{task.description}</p>
          )}
          <div className="flex items-center gap-3">
            {!isDone && (
              <button 
                onClick={() => timer.start(task.id, task.title)}
                className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter px-2 py-1 rounded transition-all ${
                  timer.activeTaskId === task.id && timer.isActive 
                    ? 'bg-amber-100 text-amber-600 ring-1 ring-amber-200' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                }`}
              >
                {timer.activeTaskId === task.id && timer.isActive ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Focusing...
                  </>
                ) : (
                  <>
                    <Play className="w-2.5 h-2.5 fill-current" />
                    Start Focus
                  </>
                )}
              </button>
            )}
            {task.priority === "HIGH" && (
              <span className="flex items-center gap-1 text-[9px] font-black text-red-500 uppercase tracking-tighter bg-red-50 px-1.5 py-0.5 rounded">
                <AlertCircle className="w-2.5 h-2.5" /> High
              </span>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-[var(--ink-soft)] uppercase tracking-widest">
                <Clock3 className="w-2.5 h-2.5" /> {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
            {task.room && (
              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded">
                {task.room.name}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onDelete} className="p-2 text-[var(--ink-soft)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
