import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TimerState {
  isActive: boolean;
  timeLeft: number;
  totalTime: number;
  mode: "work" | "break";
  activeTaskId: string | null;
  activeTaskTitle: string | null;
  
  // Actions
  start: (taskId?: string, taskTitle?: string) => void;
  pause: () => void;
  reset: () => void;
  tick: () => void;
  setMode: (mode: "work" | "break") => void;
  setTime: (minutes: number) => void;
}

const WORK_TIME = 25 * 60;
const BREAK_TIME = 5 * 60;

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      isActive: false,
      timeLeft: WORK_TIME,
      totalTime: WORK_TIME,
      mode: "work",
      activeTaskId: null,
      activeTaskTitle: null,

      start: (taskId, taskTitle) => {
        set({ 
          isActive: true, 
          activeTaskId: taskId ?? get().activeTaskId,
          activeTaskTitle: taskTitle ?? get().activeTaskTitle
        });
      },

      pause: () => set({ isActive: false }),

      reset: () => {
        set({ 
          isActive: false, 
          timeLeft: get().totalTime 
        });
      },

      setTime: (minutes) => {
        const time = Math.floor(minutes * 60);
        set({
          timeLeft: time,
          totalTime: time,
          isActive: false
        });
      },

      tick: () => {
        const { timeLeft, isActive } = get();
        if (!isActive) return;
        
        if (timeLeft <= 1) {
          // Timer finished
          const nextMode = get().mode === "work" ? "break" : "work";
          const nextTime = nextMode === "work" ? WORK_TIME : BREAK_TIME;
          
          // Simple browser notification if permitted
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(nextMode === "break" ? "Work session complete!" : "Break over!", {
              body: nextMode === "break" ? "Take a 5 minute break." : "Ready to focus?",
            });
          }

          set({ 
            isActive: false, 
            mode: nextMode, 
            timeLeft: nextTime, 
            totalTime: nextTime 
          });
          return;
        }

        set({ timeLeft: timeLeft - 1 });
      },

      setMode: (mode) => {
        const time = mode === "work" ? WORK_TIME : BREAK_TIME;
        set({ 
          mode, 
          timeLeft: time, 
          totalTime: time,
          isActive: false 
        });
      }
    }),
    {
      name: "pencil-timer-storage",
      partialize: (state) => ({ 
        timeLeft: state.timeLeft, 
        mode: state.mode, 
        activeTaskId: state.activeTaskId,
        activeTaskTitle: state.activeTaskTitle 
      }),
    }
  )
);
