"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RoomEvent } from "livekit-client";
import { useMediaStore } from "@/store/media.store";

type TranscriptEntry = {
  id: string;
  participantIdentity: string;
  speaker: string;
  text: string;
  ts: number;
};

const IconTranscript = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 5h16M4 12h16M4 19h10" />
  </svg>
);

const IconMic = ({ active }: { active: boolean }) => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
    style={{ opacity: active ? 1 : 0.35 }}
  >
    <path d="M10 1a3 3 0 00-3 3v6a3 3 0 006 0V4a3 3 0 00-3-3zM5 9a1 1 0 10-2 0 7 7 0 0014 0 1 1 0 10-2 0 5 5 0 01-10 0zM9 18v-2h2v2h2a1 1 0 010 2H7a1 1 0 010-2h2z" />
  </svg>
);

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toSpeakerName(participant: {
  name?: string | null;
  identity?: string;
}) {
  if (participant?.name && participant.name.trim()) {
    return participant.name.trim();
  }
  const identity = participant?.identity ?? "speaker";
  return `User ${identity.slice(0, 6)}`;
}

export function TranscriptPanel() {
  const room = useMediaStore((s) => s.room);
  const status = useMediaStore((s) => s.status);
  const activeSpeakers = useMediaStore((s) => s.activeSpeakers);
  const transcriptEnabled = useMediaStore((s) => s.transcriptEnabled);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!room || !transcriptEnabled) return;

    const onTranscriptionReceived = (segments: any[], participant?: any) => {
      if (!Array.isArray(segments) || segments.length === 0) return;
      const combinedText = segments
        .map((segment) => String(segment?.text ?? "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!combinedText) return;

      const finalSeen = segments.some((segment) => Boolean(segment?.final));
      setIsTranscribing(!finalSeen);
      if (!finalSeen) return;

      const firstSegment = segments[0] ?? {};
      const tsRaw =
        firstSegment?.firstReceivedTime ??
        firstSegment?.lastReceivedTime ??
        Date.now();
      const ts = typeof tsRaw === "number" ? tsRaw : Date.now();

      const identity = String(participant?.identity ?? "unknown");
      const speaker = toSpeakerName(participant);

      setEntries((prev) => {
        const next = [
          ...prev,
          {
            id: `${ts}-${identity}-${Math.random().toString(36).slice(2, 8)}`,
            participantIdentity: identity,
            speaker,
            text: combinedText,
            ts,
          },
        ];
        return next.slice(-300);
      });
    };

    room.on(RoomEvent.TranscriptionReceived, onTranscriptionReceived);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, onTranscriptionReceived);
      setIsTranscribing(false);
    };
  }, [room, transcriptEnabled]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  const panelStatus = useMemo(() => {
    if (!transcriptEnabled) {
      return {
        label: "Transcript off",
        className: "status-pill status-pill-red",
      };
    }
    if (!room || status === "disconnected" || status === "failed") {
      return {
        label: "Agent disconnected",
        className: "status-pill status-pill-red",
      };
    }
    if (isTranscribing) {
      return {
        label: "Transcribing…",
        className: "status-pill status-pill-blue",
      };
    }
    return {
      label: "Agent connected",
      className: "status-pill status-pill-green",
    };
  }, [isTranscribing, room, status, transcriptEnabled]);

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-[20px]">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(13,91,215,.12)] text-[var(--brand)]">
            <IconTranscript />
          </span>
          <span className="panel-header-title">Transcript</span>
        </div>
        <span className={panelStatus.className}>{panelStatus.label}</span>
      </div>

      <div
        ref={scrollRef}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {!transcriptEnabled ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[rgba(255,250,241,.66)] px-3 py-2 text-[0.82rem] text-[var(--ink-soft)]">
            Transcript is turned off. Enable it from the AI panel toggle.
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[rgba(255,250,241,.66)] px-3 py-2 text-[0.82rem] text-[var(--ink-soft)]">
            Live captions will appear here once someone speaks.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const speaking = activeSpeakers.includes(
                entry.participantIdentity,
              );
              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[rgba(26,26,26,.12)] bg-[rgba(255,250,241,.86)] px-3 py-2"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[0.7rem] text-[var(--ink-soft)]">
                    <span>[{formatClock(entry.ts)}]</span>
                    <span>·</span>
                    <span className="font-semibold text-[var(--brand-strong)]">
                      {entry.speaker}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      <IconMic active={speaking} />
                    </span>
                  </div>
                  <div className="text-[0.86rem] leading-5 text-[var(--ink)]">
                    {entry.text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
