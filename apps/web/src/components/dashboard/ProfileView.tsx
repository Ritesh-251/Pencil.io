"use client";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";
import { User, Camera, Mail, AtSign, Check, Loader2, Monitor, Smartphone, Trash2, RefreshCcw } from "lucide-react";

interface Session {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string | null;
}

function parseUA(ua: string | null | undefined): { device: string; browser: string } {
  if (!ua) return { device: "Unknown device", browser: "Unknown browser" };
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const device = isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";
  const browser = ua.match(/Chrome\/[\d.]+/) ? "Chrome"
    : ua.match(/Firefox\/[\d.]+/) ? "Firefox"
    : ua.match(/Safari\/[\d.]+/) ? "Safari"
    : ua.match(/Edg\/[\d.]+/) ? "Edge"
    : "Browser";
  return { device, browser };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const ProfileView = () => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (user) {
      setName(user.name || "");
      setBio(user.bio || "");
      setAvatarUrl(user.avatarUrl || "");
    }
  }, [user]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await api.get("/api/v1/auth/sessions");
      setSessions(res.sessions ?? res ?? []);
    } catch {
      // silently fail
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const revokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await api.delete(`/api/v1/auth/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      // silently fail
    } finally {
      setRevokingId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch("/api/v1/auth/me", { name, bio, avatarUrl });
      updateUser({
        name: res.user.name,
        bio: res.user.bio,
        avatarUrl: res.user.avatarUrl,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4">
      <header className="mb-8">
        <h1 className="ink-title m-0 text-[2.1rem]">My Profile</h1>
        <p className="soft-copy mt-1">
          Manage your identity and how others see you in the workspace.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group">
            <div 
              className="w-40 h-40 rounded-full border-4 border-white shadow-xl overflow-hidden flex items-center justify-center transition-all duration-300 group-hover:shadow-2xl"
              style={{ 
                background: mounted && user ? `linear-gradient(135deg, ${stringToColor(user.email)}, ${stringToColor(user.email + 'salt')})` : '#eee'
              }}
            >
              {mounted && avatarUrl && avatarUrl.trim() !== "" ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[3.5rem] font-black text-white uppercase tracking-tighter">
                  {mounted && user ? (user.name?.slice(0, 2) || user.email.slice(0, 2) || "??") : "??"}
                </span>
              )}
            </div>
            
            {/* Action Badge */}
            <button 
              type="button"
              className="absolute bottom-1 right-1 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center border-4 border-white shadow-lg hover:bg-indigo-700 hover:scale-110 transition-all cursor-pointer z-10"
              onClick={() => {
                const url = window.prompt("Enter image URL (Upload coming soon):", avatarUrl);
                if (url !== null) setAvatarUrl(url);
              }}
              title="Update photo"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Section */}
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-[var(--ink-soft)]">
              Full Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should we call you?"
                className="input pl-10"
              />
              <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-soft)] opacity-40" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-[var(--ink-soft)]">
              Email Address
            </label>
            <div className="relative opacity-60">
              <input
                type="text"
                value={user?.email || ""}
                readOnly
                className="input pl-10 cursor-not-allowed bg-[rgba(0,0,0,0.02)]"
              />
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-soft)] opacity-40" />
            </div>
            <p className="text-[10px] font-medium text-[var(--ink-soft)] italic">
              Email is managed by your account provider.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-[var(--ink-soft)]">
              A brief about you
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell your team about yourself..."
              rows={4}
              className="input min-h-[120px] resize-none py-3"
            />
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button 
              type="submit" 
              disabled={saving}
              className={`btn btn-primary min-w-[140px] flex items-center justify-center gap-2 ${saving ? 'opacity-70 cursor-wait' : ''}`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved!
                </>
              ) : (
                "Save Changes"
              )}
            </button>
            {saved && (
              <span className="text-[11px] font-bold text-emerald-600 animate-in fade-in slide-in-from-left-2">
                Your profile has been updated.
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── Active Sessions ─────────────────────────────────── */}
      <section className="mt-12 border-t border-[var(--border-subtle)] pt-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="ink-title m-0 text-[1.3rem]">Active Sessions</h2>
            <p className="soft-copy mt-1 text-[0.82rem]">
              Devices currently signed in to your account. Revoke any you don't recognise.
            </p>
          </div>
          <button
            type="button"
            onClick={loadSessions}
            disabled={sessionsLoading}
            className="btn btn-sm btn-outline flex items-center gap-1.5 text-[0.78rem]"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${sessionsLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {sessionsLoading && sessions.length === 0 ? (
          <div className="flex items-center gap-2 text-[0.83rem] soft-copy py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <p className="soft-copy text-[0.83rem] py-4">No active sessions found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((session, idx) => {
              const { device, browser } = parseUA(session.userAgent);
              const isMobile = /Mobile|Android|iPhone|iPad/i.test(session.userAgent ?? "");
              const lastSeen = session.lastUsedAt
                ? timeAgo(session.lastUsedAt)
                : timeAgo(session.createdAt);
              const isFirst = idx === 0;

              return (
                <div
                  key={session.id}
                  className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                    isFirst
                      ? "border-[rgba(13,91,215,.25)] bg-[rgba(13,91,215,.04)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 text-[var(--ink-soft)]">
                      {isMobile ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[0.83rem] font-semibold text-[var(--ink)] truncate">
                        {browser} on {device}
                        {isFirst && (
                          <span className="ml-2 rounded-full bg-[rgba(13,91,215,.12)] px-1.5 py-0.5 text-[0.65rem] font-bold text-[var(--brand)] uppercase tracking-wide">
                            Current
                          </span>
                        )}
                      </p>
                      <p className="text-[0.72rem] soft-copy truncate">
                        {session.ipAddress || "IP unknown"} · Last active {lastSeen}
                      </p>
                    </div>
                  </div>
                  {!isFirst && (
                    <button
                      type="button"
                      onClick={() => revokeSession(session.id)}
                      disabled={revokingId === session.id}
                      className="flex-shrink-0 flex items-center gap-1 rounded-lg border border-[rgba(172,56,48,.3)] bg-[rgba(172,56,48,.06)] px-2.5 py-1.5 text-[0.72rem] font-semibold text-red-600 transition-colors hover:bg-[rgba(172,56,48,.12)] disabled:opacity-50"
                    >
                      {revokingId === session.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

const stringToColor = (str: string) => {
  if (!str) return "#6366f1";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 55%)`;
};

