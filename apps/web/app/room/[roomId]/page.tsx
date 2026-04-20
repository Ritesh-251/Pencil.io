'use client';

import { CanvasPane } from '@/components/workspace/CanvasPane';
import { ChatPanel } from '@/components/workspace/ChatPanel';
import { MediaPanel } from '@/components/workspace/MediaPanel';
import { WSClient } from '@/lib/ws';
import { api, ApiClientError, getAccessToken } from '@/lib/api';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore, useConnectionStore } from '@/store/auth.store';
import { usePresenceStore } from '@/store/room.store';

// ─── Layout helpers ───────────────────────────────────────────────────────────

const PANEL_KEYS = {
  canvas: 'pencil:panel:canvas',
  chat:   'pencil:panel:chat',
  media:  'pencil:panel:media',
} as const;

function loadBool(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch { return fallback; }
}
function saveBool(key: string, val: boolean) {
  try { localStorage.setItem(key, String(val)); } catch { /* noop */ }
}

const avatarPalette = ['#7c6af7', '#f97316', '#22c55e', '#06b6d4', '#f43f5e', '#eab308'];

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const IconCanvas = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </svg>
);

const IconChat = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconMedia = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
);

const IconShare = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const status = useConnectionStore((s) => s.status);
  const syncing = useConnectionStore((s) => s.syncing);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const setSyncing = useConnectionStore((s) => s.setSyncing);
  const usersMap = usePresenceStore((s) => s.users);
  const setOnline = usePresenceStore((s) => s.setOnline);
  const setOffline = usePresenceStore((s) => s.setOffline);

  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [isEditingRoomName, setIsEditingRoomName] = useState(false);
  const [draftRoomName, setDraftRoomName] = useState('');
  const [roomNameSaving, setRoomNameSaving] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const membershipInFlightRef = useRef(false);
  const wsAuthRetryRef = useRef(false);

  const stopSyncing = useCallback(() => {
    setSyncing(false);
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, [setSyncing]);

  const startSyncing = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    setSyncing(true);
    syncTimeoutRef.current = setTimeout(() => {
      setSyncing(false);
      setCanvasError((prev) => prev ?? 'Sync timed out. Tap Retry.');
    }, 6000);
  }, [setSyncing]);

  const presence = useMemo(() => {
    const users = Array.from(usersMap.values());
    if (users.length === 0) {
      const fallback = user?.username || 'You';
      users.push({ id: user?.id || 'self', name: fallback });
    }

    return users.slice(0, 8).map((entry: any, index) => {
      const name = entry?.name || (entry?.id ? `User ${String(entry.id).slice(0, 6)}` : 'User');
      return {
        id: entry?.id || `u-${index}`,
        name,
        color: avatarPalette[index % avatarPalette.length],
        initials: name.slice(0, 2).toUpperCase(),
      };
    });
  }, [usersMap, user?.id, user?.username]);

  const sendInitialRoomHandshake = useCallback(() => {
    const ws = WSClient.getInstance();
    ws.send('room:join', { roomId });
    ws.send('chat:history', { roomId });
    ws.send('canvas:sync', { roomId });
  }, [roomId]);

  const connectSocket = useCallback(async (forceRefresh = false) => {
    const nextToken = await getAccessToken({ forceRefresh });
    if (!nextToken) {
      setStatus('disconnected');
      setCanvasError('Session expired. Please sign in again.');
      return;
    }

    const ws = WSClient.getInstance();
    setStatus('connecting');
    ws.disconnect();
    ws.connect(roomId, nextToken);
  }, [roomId, setStatus]);

  useEffect(() => {
    if (!token) return;

    let active = true;
    (async () => {
      try {
        const res = await api.get('/api/v1/rooms');
        if (!active) return;
        const rooms = Array.isArray(res?.rooms) ? res.rooms : [];
        const match = rooms.find((r: any) => (r?.roomId ?? r?.id) === roomId);
        const name = typeof match?.name === 'string' ? match.name.trim() : '';
        setRoomName(name || null);
      } catch {
        if (!active) return;
        setRoomName(null);
      }
    })();

    return () => { active = false; };
  }, [roomId, token]);

  useEffect(() => {
    if (!token) return;

    const ws = WSClient.getInstance();

    const ensureMembership = async () => {
      if (membershipInFlightRef.current) return false;
      membershipInFlightRef.current = true;
      try {
        await api.post(`/api/v1/rooms/${roomId}/join`);
        setCanvasError(null);
        return true;
      } catch (error: any) {
        if (error instanceof ApiClientError && error.status === 401) {
          window.location.href = '/auth/signin';
          return false;
        }
        setCanvasError(error?.message || 'Could not join room.');
        return false;
      } finally {
        membershipInFlightRef.current = false;
      }
    };

    const offConnected = ws.on('ws:connected', () => {
      wsAuthRetryRef.current = false;
      setStatus('connected');
      setCanvasError(null);
      if (user?.id) setOnline(user.id, user.username || 'You');
      startSyncing();
      sendInitialRoomHandshake();
    });

    const offPresence = ws.on('presence:update', (payload) => {
      const targetId = payload?.userId;
      const state = payload?.status;
      if (!targetId || typeof targetId !== 'string') return;
      if (state === 'online') {
        const name = targetId === user?.id
          ? user?.username || 'You'
          : `User ${targetId.slice(0, 6)}`;
        setOnline(targetId, name);
      } else if (state === 'offline') {
        setOffline(targetId);
      }
    });

    const offAccessError = ws.on('error', (payload) => {
      const rawMessage = String(payload?.message || '').trim();
      const message = rawMessage.toLowerCase();

      if (message.includes('not a member')) {
        void (async () => {
          const joined = await ensureMembership();
          if (!joined) return;
          sendInitialRoomHandshake();
        })();
        return;
      }
      if (message.includes('rate limit')) {
        setCanvasError('Too many realtime requests. Pause for a second and continue.');
        return;
      }
      if (message.includes('canvas')) {
        setCanvasError(rawMessage || 'Canvas failed to load');
        stopSyncing();
        return;
      }
      if (rawMessage) setCanvasError(rawMessage);
    });

    const offCanvasLoad = ws.on('canvas:load', () => {
      setCanvasError(null);
      stopSyncing();
    });

    const offDisconnect = ws.on('ws:disconnect', (payload) => {
      if (payload?.code === 4401) {
        if (!wsAuthRetryRef.current) {
          wsAuthRetryRef.current = true;
          void connectSocket(true);
          return;
        }
        window.location.href = '/auth/signin';
        return;
      }
      setStatus('disconnected');
      stopSyncing();
    });

    const offWsError = ws.on('ws:error', () => {
      setStatus('disconnected');
      stopSyncing();
    });

    void connectSocket();

    return () => {
      offConnected();
      offPresence();
      offAccessError();
      offCanvasLoad();
      offDisconnect();
      offWsError();
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      ws.disconnect();
    };
  }, [
    connectSocket,
    roomId,
    sendInitialRoomHandshake,
    setOffline,
    setOnline,
    setStatus,
    startSyncing,
    stopSyncing,
    token,
    user?.id,
    user?.username,
  ]);

  const retryConnection = () => {
    setCanvasError(null);
    const ws = WSClient.getInstance();
    if (ws.isConnected()) {
      startSyncing();
      sendInitialRoomHandshake();
      return;
    }
    void connectSocket();
  };

  const retryCanvas = () => {
    setCanvasError(null);
    startSyncing();
    const ws = WSClient.getInstance();
    ws.send('canvas:sync', { roomId });
  };

  const shareRoom = async () => {
    const url = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const startRoomNameEdit = () => {
    const current = (roomName || 'Untitled Room').trim();
    setDraftRoomName(current);
    setIsEditingRoomName(true);
  };

  const saveRoomName = async () => {
    const nextName = draftRoomName.trim();
    if (!nextName) {
      setCanvasError('Room name cannot be empty.');
      return;
    }
    setRoomNameSaving(true);
    try {
      const res = await api.patch(`/api/v1/rooms/${roomId}`, { name: nextName });
      const saved = res?.room?.name;
      setRoomName(typeof saved === 'string' && saved.trim() ? saved.trim() : nextName);
      setIsEditingRoomName(false);
      setCanvasError(null);
    } catch (error: any) {
      setCanvasError(error?.message || 'Failed to update room name.');
    } finally {
      setRoomNameSaving(false);
    }
  };

  // ─── Panel visibility ─────────────────────────────────────────────────────
  const [showCanvas, setShowCanvas] = useState(true);
  const [showChat,   setShowChat]   = useState(true);
  const [showMedia,  setShowMedia]  = useState(true);

  useEffect(() => {
    const nextCanvas = loadBool(PANEL_KEYS.canvas, true);
    const nextChat   = loadBool(PANEL_KEYS.chat,   true);
    const nextMedia  = loadBool(PANEL_KEYS.media,  true);

    if (!nextCanvas && !nextChat && !nextMedia) {
      setShowCanvas(true);
      setShowChat(false);
      setShowMedia(false);
      return;
    }
    setShowCanvas(nextCanvas);
    setShowChat(nextChat);
    setShowMedia(nextMedia);
  }, []);

  const toggle = (panel: keyof typeof PANEL_KEYS) => {
    if (panel === 'canvas') {
      if (showCanvas && !showChat && !showMedia) return;
      const next = !showCanvas;
      setShowCanvas(next);
      saveBool(PANEL_KEYS.canvas, next);
    } else if (panel === 'chat') {
      if (showChat && !showCanvas && !showMedia) return;
      const next = !showChat;
      setShowChat(next);
      saveBool(PANEL_KEYS.chat, next);
    } else {
      if (showMedia && !showCanvas && !showChat) return;
      const next = !showMedia;
      setShowMedia(next);
      saveBool(PANEL_KEYS.media, next);
    }
  };

  const showSidebar  = showChat || showMedia;
  const sidebarOnly  = !showCanvas && showSidebar;
  const canvasOnly   = showCanvas && !showSidebar;
  const mediaChatOnly = !showCanvas && showMedia && showChat;

  return (
    <div className="app-shell ambient-noise flex h-screen flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-3">

      {/* ── Disconnected banner ───────────────────────────────────────────── */}
      {status === 'disconnected' && (
        <div role="status" aria-live="polite"
          className="animate-fade fixed inset-x-3 top-3 z-40 rounded-xl border border-[rgba(172,56,48,.24)] bg-[rgba(172,56,48,.15)] px-3.5 py-2 text-center text-[0.82rem] text-[#8c2317] sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2 sm:inset-x-auto">
          Realtime disconnected — use Reconnect to continue.
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="glass flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">

        {/* Room name / edit */}
        <div className="min-w-0 flex-1">
          {isEditingRoomName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus value={draftRoomName}
                onChange={(e) => setDraftRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  { e.preventDefault(); void saveRoomName(); }
                  if (e.key === 'Escape') { e.preventDefault(); setIsEditingRoomName(false); }
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-[rgba(13,91,215,.45)] bg-[rgba(255,250,241,.95)] px-2 text-[0.95rem] outline-none sm:min-w-[180px]"
                disabled={roomNameSaving}
              />
              <button type="button" className="btn btn-outline btn-sm shrink-0"
                onClick={() => void saveRoomName()} disabled={roomNameSaving}>
                {roomNameSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={startRoomNameEdit}
              className="m-0 block max-w-[180px] truncate text-left text-[0.95rem] font-semibold tracking-[-0.02em] hover:underline sm:max-w-none sm:text-[1.05rem]"
              title="Click to rename">
              {roomName || 'Untitled Room'}
            </button>
          )}
          <p className="m-0 hidden items-center gap-1.5 text-[0.74rem] soft-copy sm:flex">
            <span className="live-dot" />
            {status === 'connected' ? 'Live collaboration active' : 'Realtime disconnected'}
            {' · ID '}{roomId.slice(0, 8)}
          </p>
        </div>

        {/* ── Panel toggle pill group ───────────────────────────────────── */}
        <div className="flex shrink-0 items-center rounded-full border border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.6)] p-0.5">
          {([
            { key: 'canvas', label: 'Canvas', icon: <IconCanvas />, active: showCanvas },
            { key: 'chat',   label: 'Chat',   icon: <IconChat />,   active: showChat   },
            { key: 'media',  label: 'Media',  icon: <IconMedia />,  active: showMedia  },
          ] as const).map(({ key, label, icon, active }, idx) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              title={active ? `Hide ${label}` : `Show ${label}`}
              className={[
                'flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.7rem] font-semibold transition-all duration-150 sm:px-3',
                active
                  ? 'bg-[rgba(13,91,215,1)] text-white shadow-sm'
                  : 'text-[rgba(26,26,26,.5)] hover:text-[rgba(26,26,26,.85)]',
                idx > 0 ? 'ml-0.5' : '',
              ].join(' ')}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Right controls ────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Online count */}
          <span className="status-pill status-pill-green hidden sm:inline-flex">
            {presence.length} online
          </span>

          {/* Syncing indicator */}
          {syncing && (
            <span className="relative overflow-hidden rounded-full border border-[rgba(13,91,215,.45)] px-2.5 py-1 text-[0.72rem] text-[#13489a] before:absolute before:inset-0 before:animate-[shimmer_1.2s_linear_infinite] before:bg-[linear-gradient(100deg,transparent,rgba(13,91,215,.24),transparent)] hidden sm:block">
              Syncing…
            </span>
          )}

          {/* Avatar stack */}
          <div className="flex items-center -space-x-1.5 hidden sm:flex">
            {presence.slice(0, 3).map((p) => (
              <div key={p.id}
                className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--bg-surface)] text-[0.68rem] font-bold text-white shadow-sm"
                style={{ backgroundColor: p.color }} title={p.name}>
                {p.initials}
                <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full border border-[var(--bg-base)] bg-[#2f6340]" />
              </div>
            ))}
            {presence.length > 3 && (
              <div className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--bg-surface)] bg-[#d6ccbb] text-[0.65rem] font-bold text-[#1a1a1a] shadow-sm">
                +{presence.length - 3}
              </div>
            )}
          </div>

          {/* Reconnect — icon on mobile, labeled on desktop */}
          <button type="button" onClick={retryConnection}
            className="icon-btn sm:hidden" title="Reconnect">
            <IconRefresh />
          </button>
          <button type="button" onClick={retryConnection}
            className="btn btn-outline btn-sm hidden whitespace-nowrap sm:inline-flex items-center gap-1.5">
            <IconRefresh />
            Reconnect
          </button>

          {/* Share — icon on mobile, labeled on desktop */}
          <button type="button" onClick={shareRoom} aria-label="Copy room link"
            className="icon-btn sm:hidden" title="Share room">
            <IconShare />
          </button>
          <button type="button" onClick={shareRoom}
            className="btn btn-outline btn-sm hidden whitespace-nowrap sm:inline-flex items-center gap-1.5">
            <IconShare />
            {copied ? 'Copied ✓' : 'Share'}
          </button>
        </div>
      </header>

      {/* ── Workspace ─────────────────────────────────────────────────────── */}
      <div
        className="workspace-row flex min-h-0 flex-1 gap-2 overflow-hidden sm:gap-3"
      >

        {/* ── Canvas ───────────────────────────────────────────────────────── */}
        <div
          className="workspace-canvas-pane relative min-h-0 min-w-0 overflow-hidden rounded-[20px]"
          style={{
            display: showCanvas ? undefined : 'none',
            flex: showCanvas ? (showSidebar ? '1 1 0%' : '1 1 100%') : undefined,
          }}
        >
          {canvasError && (
            <div className="absolute left-4 top-4 z-10 w-[min(320px,calc(100%-2rem))] rounded-xl border border-[rgba(255,122,122,.4)] bg-[rgba(255,87,91,.15)] p-3">
              <p className="text-[0.86rem] text-[#8c2317]">{canvasError}</p>
              <button type="button" className="btn btn-outline btn-sm mt-2" onClick={retryCanvas}>
                Retry Canvas Sync
              </button>
            </div>
          )}
          <CanvasPane />
        </div>

        {/* ── Sidebar (Media + Chat) ──────────────────────────────────── */}
        {showSidebar && (
          <div
            className={`workspace-sidebar-pane min-h-0 overflow-hidden ${showCanvas ? '' : 'no-canvas'}`}
            style={{
              flex:     showCanvas ? '0 0 var(--sidebar-width)' : '1 1 0%',
              width:    showCanvas ? 'var(--sidebar-width)'      : '100%',
              minWidth: 0,
              display:  'flex',
              flexDirection: mediaChatOnly ? 'row' : 'column',
              alignItems: 'stretch',
              gap: '0px',
            }}
          >
            {/*
              Media — always mounted, hidden when off.
              Renders at its full natural height — never capped.
              When it's the only panel, it stretches to fill the sidebar.
            */}
            <div
              style={{
                display:  showMedia ? undefined : 'none',
                // In media+chat-only mode: fixed 60/40 horizontal split.
                // Otherwise keep current vertical behavior.
                // Solo mode: fill the full sidebar.
                flex:     showChat ? '0 0 60%' : '1 1 auto',
                maxHeight: mediaChatOnly ? '100%' : (showChat ? '60%' : '100%'),
                minHeight: 0,
                minWidth: 0,
                width: mediaChatOnly ? '60%' : '100%',
                overflow: 'hidden',
              }}
            >
              <MediaPanel roomId={roomId} isExpanded={!showCanvas && !showChat} />
            </div>

            {/*
              Chat — always mounted, hidden when off.
              Solo: stretches to fill. Paired with media: takes remaining space
              (min 320px so it's always usable without needing to scroll far).
            */}
            <div
              style={{
                display:   showChat ? undefined : 'none',
                // In media+chat-only mode: fixed 60/40 horizontal split.
                // Otherwise keep current vertical behavior.
                // Solo mode: fill the full sidebar.
                flex:      showMedia ? '0 0 40%' : '1 1 auto',
                maxHeight: mediaChatOnly ? '100%' : (showMedia ? '40%' : '100%'),
                minHeight: 0,
                minWidth: 0,
                width: mediaChatOnly ? '40%' : '100%',
                overflow: 'hidden',
              }}
            >
              <ChatPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
