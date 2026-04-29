"use client";

import React from "react";
import { api } from "@/lib/api";

interface JoinRequest {
  id: string;
  userEmail: string;
  userId: string;
}

interface JoinRequestPopupProps {
  roomId: string;
  requests: JoinRequest[];
  onHandled: (requestId: string) => void;
}

export function JoinRequestPopup({
  roomId,
  requests,
  onHandled,
}: JoinRequestPopupProps) {
  const latest = requests[0];
  if (!latest) return null;

  const handleApprove = async () => {
    try {
      await api.post(
        `/api/v1/rooms/${roomId}/join-requests/${latest.id}/approve`,
      );
      onHandled(latest.id);
    } catch (err) {
      console.error("Failed to approve", err);
    }
  };

  const handleReject = async () => {
    try {
      await api.post(
        `/api/v1/rooms/${roomId}/join-requests/${latest.id}/reject`,
      );
      onHandled(latest.id);
    } catch (err) {
      console.error("Failed to reject", err);
    }
  };

  return (
    <div className="fixed top-20 right-6 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="glass flex flex-col gap-3 rounded-2xl border border-[rgba(13,91,215,0.2)] bg-[rgba(255,250,241,0.95)] p-4 shadow-2xl w-80">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(13,91,215,0.1)] text-[rgba(13,91,215,1)]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[0.88rem] font-bold text-[#1a1a1a] truncate">
              New Join Request
            </p>
            <p className="text-[0.78rem] text-[#666] truncate">
              {latest.userEmail}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            className="flex-1 rounded-xl bg-[rgba(13,91,215,1)] py-2 text-[0.82rem] font-semibold text-white transition-all hover:bg-[rgba(13,91,215,0.9)] active:scale-95"
          >
            Let In
          </button>
          <button
            onClick={handleReject}
            className="flex-1 rounded-xl border border-[rgba(0,0,0,0.1)] bg-white py-2 text-[0.82rem] font-semibold text-[#666] transition-all hover:bg-[#f5f5f5] active:scale-95"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
