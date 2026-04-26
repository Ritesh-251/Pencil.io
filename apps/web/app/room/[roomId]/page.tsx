'use client';

import { CanvasPane } from '@/components/workspace/CanvasPane';
import { ChatPanel } from '@/components/workspace/ChatPanel';
import { MediaPanel } from '@/components/workspace/MediaPanel';
import { TranscriptPanel } from '@/components/workspace/TranscriptPanel';
import { AIPanel } from '@/components/workspace/AIPanel';
import { JoinRequestPopup } from '@/components/workspace/JoinRequestPopup';
import { WSClient } from '@/lib/ws';
import { api, ApiClientError, getAccessToken } from '@/lib/api';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore, useConnectionStore } from '@/store/auth.store';
import { usePresenceStore } from '@/store/room.store';
import {
  PANEL_KEYS,
  loadBool,
  saveBool,
  avatarPalette,
  IconCanvas,
  IconChat,
  IconMedia,
  IconShare,
  IconRefresh,
} from '@/components/workspace/roomPage.ui';

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
  const [isMounted, setIsMounted] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const membershipInFlightRef = useRef(false);
  const wsAuthRetryRef = useRef(false);

  const [isWaiting, setIsWaiting] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
        
        if (match) {
          const name = typeof match?.name === 'string' ? match.name.trim() : '';
          setRoomName(name || null);
          
          const isCreator = match.role === 'ADMIN'; 
          setIsHost(isCreator);

          if (isCreator) {
            const reqs = await api.get(`/api/v1/rooms/${roomId}/join-requests`);
            setPendingRequests(reqs.requests || []);
          }
        }
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
        if (error instanceof ApiClientError && error.status === 403 && error.payload?.approvalRequired) {
          setIsWaiting(true);
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

    const offJoinEvents = ws.on('room:event', (payload: any) => {
      if (payload.type === 'JOIN_REQUEST') {
        if (isHost) {
          setPendingRequests(prev => [...prev, { id: payload.requestId, userEmail: payload.userEmail, userId: payload.userId }]);
        }
      } else if (payload.type === 'JOIN_REQUEST_APPROVED') {
        if (payload.userId === user?.id) {
          setIsWaiting(false);
          void ensureMembership().then(joined => {
            if (joined) sendInitialRoomHandshake();
          });
        }
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
  const [insightTab, setInsightTab] = useState<'chat' | 'transcript' | 'ai'>('chat');

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

  if (isWaiting) {
    return (
      <div className="app-shell flex h-screen flex-col items-center justify-center bg-[#fffaf1] p-6 text-center">
        <div className="glass flex max-w-md flex-col items-center gap-6 rounded-[32px] p-10 shadow-2xl">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-[rgba(13,91,215,0.1)]" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[rgba(13,91,215,1)] text-white shadow-lg">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-6-6H4a2 2 0 0 0-2 2v16z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/></svg>
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">Waiting for Host</h1>
            <p className="text-[0.95rem] leading-relaxed text-[#666]">
              This room is private. We've sent a knock to the host to let you in. Please stay on this page.
            </p>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.05)]">
            <div className="h-full w-1/3 animate-[progress_2s_ease-in-out_infinite] rounded-full bg-[rgba(13,91,215,1)]" />
          </div>
        </div>
        <style jsx global>{`
          @keyframes progress {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-shell ambient-noise flex h-screen flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-3">
      {isHost && (
        <JoinRequestPopup 
          roomId={roomId} 
          requests={pendingRequests} 
          onHandled={(id) => setPendingRequests(prev => prev.filter(r => r.id !== id))} 
        />
      )}

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
          <div className="hidden items-center -space-x-1.5 sm:flex">
            {isMounted && (
              <>
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
              </>
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
            // IMPORTANT: do NOT use display:none here.
            // The canvas uses a ResizeObserver on its container.
            // display:none makes getBoundingClientRect() return {width:0,height:0}
            // which resets canvas.width/height to 1, clearing the pixel buffer.
            // Instead, keep the element in layout flow but hide it visually.
            visibility: showCanvas ? 'visible' : 'hidden',
            pointerEvents: showCanvas ? undefined : 'none',
            flex: showCanvas ? (showSidebar ? '1 1 0%' : '1 1 100%') : '0 0 0px',
            width: showCanvas ? undefined : 0,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {canvasError && (
            <div className="absolute inset-x-4 top-4 z-20 flex justify-center pointer-events-none">
              <div className="w-[min(320px,calc(100%-2rem))] rounded-xl border border-[rgba(255,122,122,.4)] bg-[rgba(255,87,91,.15)] p-3 shadow-lg pointer-events-auto backdrop-blur-sm">
                <p className="text-[0.86rem] text-[#8c2317]">{canvasError}</p>
                <button type="button" className="btn btn-outline btn-sm mt-2" onClick={retryCanvas}>
                  Retry Canvas Sync
                </button>
              </div>
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
              <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="glass flex shrink-0 items-center gap-1 rounded-[14px] px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setInsightTab('chat')}
                    className={`btn btn-sm ${insightTab === 'chat' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setInsightTab('transcript')}
                    className={`btn btn-sm ${insightTab === 'transcript' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Transcript
                  </button>
                  <button
                    type="button"
                    onClick={() => setInsightTab('ai')}
                    className={`btn btn-sm ${insightTab === 'ai' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    AI
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  <div style={{ display: insightTab === 'chat' ? 'block' : 'none', height: '100%' }}>
                    <ChatPanel />
                  </div>
                  <div style={{ display: insightTab === 'transcript' ? 'block' : 'none', height: '100%' }}>
                    <TranscriptPanel />
                  </div>
                  <div style={{ display: insightTab === 'ai' ? 'block' : 'none', height: '100%' }}>
                    <AIPanel roomId={roomId} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
