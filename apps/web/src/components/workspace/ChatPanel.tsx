"use client";

import { useEffect, useRef, useState } from "react";
import { WSClient } from "@/lib/ws";
import { useParams } from "next/navigation";
import { useAuthStore, useConnectionStore } from "@/store/auth.store";

type ChatMessage = {
  id: string;
  text: string;
  author: string;
  createdAt: number;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconSend = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconChat = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// Typing dots animation (inline)
const TypingIndicator = () => (
  <div className="flex items-center gap-0.5 px-3 py-2">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="block h-1.5 w-1.5 rounded-full bg-[var(--ink-soft)]"
        style={{ animation: `typing-bounce 1.2s ease infinite ${i * 0.18}s` }}
      />
    ))}
  </div>
);

// Format a timestamp as "HH:MM"
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ChatPanel = () => {
  const params = useParams<{ roomId: string }>();
  const roomId = params?.roomId;
  const user = useAuthStore((s) => s.user);
  const status = useConnectionStore((s) => s.status);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "seed-1",
      text: "Welcome to the room. Start sketching your idea.",
      author: "System",
      createdAt: Date.now() - 15000,
    },
  ]);

  // Auto-scroll to newest message
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!text.trim() || !roomId) return;
    if (!WSClient.getInstance().isConnected()) {
      setSendError("Realtime connection is not ready yet.");
      return;
    }
    WSClient.getInstance().send("chat:send", { roomId, content: text.trim() });
    setText("");
    setTyping(false);
    setSendError(null);
  };

  useEffect(() => {
    const ws = WSClient.getInstance();

    const offNew = ws.on("chat:new", (payload) => {
      if (!payload?.content) return;
      const messageId =
        payload.messageId ||
        `server-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setMessages((prev) =>
        prev.some((m) => m.id === messageId)
          ? prev
          : [
              ...prev,
              {
                id: messageId,
                text: payload.content,
                author:
                  payload.userId && payload.userId === user?.id
                    ? "You"
                    : payload.userId
                      ? `User ${String(payload.userId).slice(0, 6)}`
                      : "Collaborator",
                createdAt: payload.timestamp ?? Date.now(),
              },
            ],
      );
    });

    const offHistory = ws.on("chat:history", (payload) => {
      const history = Array.isArray(payload?.messages) ? payload.messages : [];
      const normalized = history.map((item: any) => ({
        id: item.id,
        text: item.content,
        author:
          item.userId === user?.id
            ? "You"
            : item.userId
              ? `User ${String(item.userId).slice(0, 6)}`
              : "Collaborator",
        createdAt: new Date(item.createdAt).getTime(),
      }));
      setMessages((prev) => {
        const seeded = prev.filter((m) => m.id.startsWith("seed-"));
        return normalized.length > 0 ? normalized : seeded;
      });
    });

    const offError = ws.on("error", (payload) => {
      if (payload?.message) setSendError(payload.message);
    });

    return () => {
      offNew();
      offHistory();
      offError();
    };
  }, [roomId, user?.id]);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onType = (value: string) => {
    setText(value);

    if (value.trim()) {
      setTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(false);
        typingTimeoutRef.current = null;
      }, 1500);
    } else {
      setTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  };

  // Group consecutive messages by the same author
  type AuthorGroup = { author: string; messages: ChatMessage[] };
  const grouped = messages.reduce<AuthorGroup[]>((acc, msg) => {
    const last = acc[acc.length - 1];
    if (last && last.author === msg.author) {
      last.messages.push(msg);
    } else {
      acc.push({ author: msg.author, messages: [msg] });
    }
    return acc;
  }, []);

  const isConnected = status === "connected";

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-[20px]">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(13,91,215,.12)] text-[var(--brand)]">
            <IconChat />
          </span>
          <span className="panel-header-title">Chat</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <span className="status-pill status-pill-green">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              Live
            </span>
          ) : (
            <span className="status-pill status-pill-red">Offline</span>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        <div className="flex flex-col gap-3">
          {grouped.map((group, i) => {
            const isSelf = group.author === "You";
            const isSystem = group.author === "System";

            if (isSystem) {
              return (
                <div
                  key={`${group.author}-${i}`}
                  className="flex justify-center"
                >
                  <div className="bubble-system animate-fade">
                    {group.messages.map((m) => m.text).join(" ")}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${group.author}-${i}`}
                className={`flex flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}
                style={{
                  animation:
                    "slideInUp 220ms cubic-bezier(0.2,0.86,0.2,1) both",
                }}
              >
                {/* Author label */}
                {!isSelf && (
                  <div className="ml-1 text-[0.68rem] font-semibold text-[var(--brand-strong)] opacity-70">
                    {group.author}
                  </div>
                )}

                {/* Message bubbles */}
                <div
                  className={`flex flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}
                >
                  {group.messages.map((m) => (
                    <div key={m.id} className="group relative">
                      <div className={isSelf ? "bubble-self" : "bubble-other"}>
                        {m.text}
                      </div>
                      {/* Timestamp on hover */}
                      <span
                        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[0.62rem] text-[var(--ink-soft)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${isSelf ? "right-[calc(100%+6px)]" : "left-[calc(100%+6px)]"}`}
                      >
                        {formatTime(m.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {typing && (
            <div className="flex items-start">
              <div className="rounded-2xl border border-[rgba(26,26,26,.12)] bg-[rgba(255,250,241,.88)]">
                <TypingIndicator />
              </div>
            </div>
          )}
        </div>
      </div>

      {sendError && (
        <div className="mx-2.5 mb-1 rounded-xl border border-[rgba(172,56,48,.24)] bg-[rgba(172,56,48,.1)] px-3 py-1.5 text-[0.75rem] text-[#8c2317]">
          {sendError}
        </div>
      )}

      <form
        onSubmit={send}
        className="flex items-center gap-2 border-t border-[var(--border-subtle)] p-2.5"
      >
        <input
          className="input flex-1 rounded-[14px] py-2.5 text-[0.9rem]"
          value={text}
          onChange={(e) => onType(e.target.value)}
          placeholder={isConnected ? "Message collaborators…" : "Reconnecting…"}
          disabled={!isConnected}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!isConnected || !text.trim()}
          aria-label="Send message"
          className="btn btn-primary btn-sm flex h-[42px] w-[42px] items-center justify-center rounded-[14px] p-0 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ flexShrink: 0 }}
        >
          <IconSend />
        </button>
      </form>
    </div>
  );
};
