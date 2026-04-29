"use client";

import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";

export const VerificationBanner = () => {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [isVisible, setIsVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !user || user.isVerified || !isVisible) return null;

  const handleResend = async () => {
    setStatus("sending");
    try {
      await api.post("/api/v1/auth/resend-verification", {});
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 5000);
    } catch (error) {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  return (
    <div className="glass flex items-center justify-between gap-4 rounded-[20px] p-4 mb-4 border border-[rgba(26,26,26,0.08)] shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <p className="soft-copy text-[0.88rem] m-0 font-medium">
          Your email verification is pending. Please check your inbox for the
          link.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleResend}
          disabled={status === "sending" || status === "sent"}
          className={`btn btn-sm ${status === "sent" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "btn-primary"} transition-all`}
        >
          {status === "idle" && "Resend Email"}
          {status === "sending" && "Sending..."}
          {status === "sent" && "Email Sent!"}
          {status === "error" && "Failed to send"}
        </button>

        <button
          onClick={() => setIsVisible(false)}
          className="p-1.5 rounded-full hover:bg-[rgba(26,26,26,0.05)] transition-colors text-[var(--ink-soft)]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};
