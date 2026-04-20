'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ConnectionState,
  ParticipantEvent,
  RoomEvent,
  type Participant,
  type Room,
} from 'livekit-client';
import {
  connectionStateToMediaStatus,
  createMediaRoom,
  getParticipantCameraPublication,
  getParticipantScreenSharePublication,
  requestMediaToken,
  snapshotRoomParticipants,
} from '@/lib/livekit';
import { useMediaStore } from '@/store/media.store';

type MediaPanelProps = {
  roomId: string;
  /** True when this is the only visible panel — fills the full workspace */
  isExpanded?: boolean;
};

type TileParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  participant: Participant;
};

const MEDIA_AUTOREJOIN_PREFIX = 'media-autojoin:';

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconScreen = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v8h10V5H5zM8 17h4v-2H8v2z" />
  </svg>
);

const IconVideo = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
);

const IconMic = ({ active }: { active: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
    style={{ opacity: active ? 1 : 0.35 }}>
    <path d="M10 1a3 3 0 00-3 3v6a3 3 0 006 0V4a3 3 0 00-3-3zM5 9a1 1 0 10-2 0 7 7 0 0014 0 1 1 0 10-2 0 5 5 0 01-10 0zM9 18v-2h2v2h2a1 1 0 010 2H7a1 1 0 010-2h2z" />
  </svg>
);

const IconCamera = ({ active }: { active: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
    style={{ opacity: active ? 1 : 0.35 }}>
    <path d="M2 6a2 2 0 012-2h8a2 2 0 012 2v2l4-2v8l-4-2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

// ─── Camera tile ──────────────────────────────────────────────────────────────

type TileProps = TileParticipant & { expanded?: boolean };

function ParticipantTile({ participant, identity, isLocal, expanded }: TileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [version, setVersion] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    participant
      .on(ParticipantEvent.TrackPublished, refresh)
      .on(ParticipantEvent.TrackSubscribed, refresh)
      .on(ParticipantEvent.TrackUnpublished, refresh)
      .on(ParticipantEvent.TrackUnsubscribed, refresh)
      .on(ParticipantEvent.TrackMuted, refresh)
      .on(ParticipantEvent.TrackUnmuted, refresh)
      .on(ParticipantEvent.LocalTrackPublished, refresh)
      .on(ParticipantEvent.LocalTrackUnpublished, refresh)
      .on(ParticipantEvent.ParticipantNameChanged, refresh);
    return () => {
      participant
        .off(ParticipantEvent.TrackPublished, refresh)
        .off(ParticipantEvent.TrackSubscribed, refresh)
        .off(ParticipantEvent.TrackUnpublished, refresh)
        .off(ParticipantEvent.TrackUnsubscribed, refresh)
        .off(ParticipantEvent.TrackMuted, refresh)
        .off(ParticipantEvent.TrackUnmuted, refresh)
        .off(ParticipantEvent.LocalTrackPublished, refresh)
        .off(ParticipantEvent.LocalTrackUnpublished, refresh)
        .off(ParticipantEvent.ParticipantNameChanged, refresh);
    };
  }, [participant]);

  useEffect(() => {
    const videoElement = videoRef.current;
    const publication = getParticipantCameraPublication(participant);
    const track = publication?.videoTrack ?? publication?.track;
    if (!videoElement || !track || track.kind !== 'video' || track.isMuted) {
      setHasVideo(false);
      return;
    }
    track.attach(videoElement);
    setHasVideo(true);
    return () => { track.detach(videoElement); setHasVideo(false); };
  }, [participant, version]);

  const fallbackName = participant.name || `User ${identity.slice(0, 6)}`;

  if (expanded) {
    // Full-screen / expanded mode — tile fills its grid cell, warm design
    return (
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.7)]">
        <video
          ref={videoRef}
          autoPlay playsInline muted={isLocal}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ display: hasVideo ? 'block' : 'none' }}
        />
        {!hasVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3
            bg-[linear-gradient(135deg,rgba(13,91,215,.12),rgba(47,99,64,.10))]">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-[rgba(13,91,215,.18)] text-[2rem] font-bold text-[var(--brand-strong)]">
              {initialsFromName(fallbackName)}
            </div>
            {participant.isCameraEnabled && (
              <div className="text-[0.8rem] font-medium text-[rgba(13,91,215,.8)]">Camera starting…</div>
            )}
          </div>
        )}
        {/* Bottom label — same style as sidebar tiles but slightly taller */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2
          bg-[rgba(26,26,26,.65)] px-3 pb-3 pt-5 text-white
          [background:linear-gradient(to_top,rgba(26,26,26,.7),transparent)]">
          <span className="text-[0.82rem] font-medium">
            {isLocal ? `${fallbackName} (You)` : fallbackName}
          </span>
          <div className="flex items-center gap-1.5">
            <span title={participant.isMicrophoneEnabled ? 'Mic on' : 'Mic off'}
              className={`flex h-6 w-6 items-center justify-center rounded-full border ${participant.isMicrophoneEnabled ? 'border-[rgba(255,255,255,.25)] bg-[rgba(255,255,255,.15)]' : 'border-[rgba(255,80,80,.5)] bg-[rgba(255,80,80,.3)]'}`}>
              <IconMic active={participant.isMicrophoneEnabled} />
            </span>
            <span title={participant.isCameraEnabled ? 'Camera on' : 'Camera off'}
              className={`flex h-6 w-6 items-center justify-center rounded-full border ${participant.isCameraEnabled ? 'border-[rgba(255,255,255,.25)] bg-[rgba(255,255,255,.15)]' : 'border-[rgba(255,80,80,.5)] bg-[rgba(255,80,80,.3)]'}`}>
              <IconCamera active={participant.isCameraEnabled} />
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Sidebar / compact mode
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.64)]"
      style={{ aspectRatio: '16/9' }}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal}
        className="media-tile-video absolute inset-0 h-full w-full bg-[#1a1a1a] object-cover"
        style={{ display: hasVideo ? 'block' : 'none' }} />
      {!hasVideo && (
        <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,rgba(13,91,215,.14),rgba(47,99,64,.14))] text-[1rem] font-semibold text-[var(--brand-strong)]">
          <div className="grid gap-2 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[rgba(13,91,215,.16)] text-[1.2rem] mx-auto">
              {initialsFromName(fallbackName)}
            </div>
            {participant.isCameraEnabled && (
              <div className="text-[0.72rem] font-medium text-[rgba(13,91,215,.82)]">Camera starting...</div>
            )}
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-[rgba(26,26,26,.72)] px-2.5 py-2 text-[0.75rem] text-white"
        style={{ background: 'linear-gradient(to top, rgba(26,26,26,.82), transparent)' }}>
        <span className="truncate">{isLocal ? `${fallbackName} (You)` : fallbackName}</span>
        <span className={`rounded-full border px-1.5 py-0.5 text-[0.62rem] ${
          participant.isMicrophoneEnabled
            ? 'border-[rgba(255,255,255,.22)] text-[rgba(255,255,255,.75)]'
            : 'border-[rgba(255,80,80,.5)] bg-[rgba(255,80,80,.25)] text-[#ffaaaa]'
        }`}>
          {participant.isMicrophoneEnabled ? 'Mic on' : 'Muted'}
        </span>
      </div>
    </div>
  );
}

// ─── Screen share tile ────────────────────────────────────────────────────────

function ScreenShareTile({ participant, identity, isLocal }: TileParticipant) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [version, setVersion] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    participant
      .on(ParticipantEvent.TrackPublished, refresh)
      .on(ParticipantEvent.TrackSubscribed, refresh)
      .on(ParticipantEvent.TrackUnpublished, refresh)
      .on(ParticipantEvent.TrackUnsubscribed, refresh)
      .on(ParticipantEvent.LocalTrackPublished, refresh)
      .on(ParticipantEvent.LocalTrackUnpublished, refresh);
    return () => {
      participant
        .off(ParticipantEvent.TrackPublished, refresh)
        .off(ParticipantEvent.TrackSubscribed, refresh)
        .off(ParticipantEvent.TrackUnpublished, refresh)
        .off(ParticipantEvent.TrackUnsubscribed, refresh)
        .off(ParticipantEvent.LocalTrackPublished, refresh)
        .off(ParticipantEvent.LocalTrackUnpublished, refresh);
    };
  }, [participant]);

  useEffect(() => {
    const videoElement = videoRef.current;
    const publication = getParticipantScreenSharePublication(participant);
    const track = publication?.videoTrack ?? publication?.track;
    if (!videoElement || !track || track.kind !== 'video') {
      setHasVideo(false);
      return;
    }
    track.attach(videoElement);
    setHasVideo(true);
    return () => { track.detach(videoElement); setHasVideo(false); };
  }, [participant, version]);

  const fallbackName = participant.name || `User ${identity.slice(0, 6)}`;
  const label = isLocal ? 'Your screen' : `${fallbackName} is presenting`;

  return (
    <div style={{ display: hasVideo ? 'block' : 'none' }}
      className="relative overflow-hidden rounded-xl border-2 border-[rgba(13,91,215,.5)] bg-[#111]">
      <video ref={videoRef} autoPlay playsInline muted={isLocal}
        className="w-full object-contain rounded-xl bg-[#111]"
        style={{ maxHeight: '340px', minHeight: '180px', display: 'block' }} />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-[rgba(13,91,215,.82)] px-3 py-1.5 text-[0.72rem] text-white">
        <IconScreen />
        <span className="font-medium">{label}</span>
        {isLocal && (
          <span className="ml-auto rounded-full bg-[rgba(255,255,255,.2)] px-2 py-0.5 text-[0.65rem]">
            Visible to everyone
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Participants activity bar ─────────────────────────────────────────────────

function ParticipantsBar({ tiles, dark }: { tiles: TileParticipant[]; dark?: boolean }) {
  if (tiles.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className={`text-[0.72rem] font-semibold uppercase tracking-wide ${dark ? 'text-[rgba(255,255,255,.5)]' : 'text-[var(--brand-strong)] opacity-60'}`}>
        Participants ({tiles.length})
      </div>
      <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
        {tiles.map((tile) => {
          const name = tile.participant.name || `User ${tile.identity.slice(0, 6)}`;
          const isSharing = tile.participant.isScreenShareEnabled;
          return (
            <div key={tile.identity}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.78rem] transition-colors ${dark ? 'hover:bg-[rgba(255,255,255,.07)] text-[rgba(255,255,255,.85)]' : 'hover:bg-[rgba(26,26,26,.06)] text-[var(--ink-base)]'}`}>
              <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.62rem] font-bold ${dark ? 'bg-[rgba(255,255,255,.12)] text-white' : 'bg-[rgba(13,91,215,.18)] text-[var(--brand-strong)]'}`}>
                {initialsFromName(name)}
              </div>
              <span className="min-w-0 flex-1 truncate">
                {tile.isLocal ? `${name} (You)` : name}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <IconMic active={tile.participant.isMicrophoneEnabled} />
                <IconCamera active={tile.participant.isCameraEnabled} />
                {isSharing && (
                  <span className="rounded-full bg-[rgba(13,91,215,.3)] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[#7eb3ff]">
                    Presenting
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Screen share SPOTLIGHT tile (fills main area in expanded mode) ──────────
// object-contain so you see the WHOLE shared screen, not cropped

function ScreenShareSpotlightTile({ participant, identity, isLocal }: TileParticipant) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [version, setVersion] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    participant
      .on(ParticipantEvent.TrackPublished, refresh)
      .on(ParticipantEvent.TrackSubscribed, refresh)
      .on(ParticipantEvent.TrackUnpublished, refresh)
      .on(ParticipantEvent.TrackUnsubscribed, refresh)
      .on(ParticipantEvent.LocalTrackPublished, refresh)
      .on(ParticipantEvent.LocalTrackUnpublished, refresh);
    return () => {
      participant
        .off(ParticipantEvent.TrackPublished, refresh)
        .off(ParticipantEvent.TrackSubscribed, refresh)
        .off(ParticipantEvent.TrackUnpublished, refresh)
        .off(ParticipantEvent.TrackUnsubscribed, refresh)
        .off(ParticipantEvent.LocalTrackPublished, refresh)
        .off(ParticipantEvent.LocalTrackUnpublished, refresh);
    };
  }, [participant]);

  useEffect(() => {
    const videoElement = videoRef.current;
    const publication = getParticipantScreenSharePublication(participant);
    const track = publication?.videoTrack ?? publication?.track;
    if (!videoElement || !track || track.kind !== 'video') {
      setHasVideo(false);
      return;
    }
    track.attach(videoElement);
    setHasVideo(true);
    return () => { track.detach(videoElement); setHasVideo(false); };
  }, [participant, version]);

  const fallbackName = participant.name || `User ${identity.slice(0, 6)}`;
  const label = isLocal ? 'You are presenting' : `${fallbackName} is presenting`;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-[rgba(13,91,215,.28)] bg-[rgba(255,250,241,.7)]">
      {/* Video — object-contain shows the WHOLE screen without cropping */}
      <video
        ref={videoRef}
        autoPlay playsInline muted={isLocal}
        className="h-full w-full rounded-2xl object-contain"
        style={{ display: hasVideo ? 'block' : 'none' }}
      />
      {!hasVideo && (
        <div className="flex flex-col items-center gap-3 text-[var(--ink-soft)]">
          <IconScreen />
          <div className="text-[0.9rem]">Loading shared screen…</div>
        </div>
      )}
      {/* Presenting badge — top-left, same style as existing brand badges */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-[rgba(13,91,215,.35)] bg-[rgba(13,91,215,.12)] px-3 py-1 text-[0.72rem] font-semibold text-[#0b3ea5] backdrop-blur-sm">
        <IconScreen />
        {label}
        {isLocal && (
          <span className="ml-1 opacity-60">· visible to everyone</span>
        )}
      </div>
    </div>
  );
}

// ─── Camera THUMBNAIL tile (compact strip below spotlight) ────────────────────

function CameraThumbnailTile({ participant, identity, isLocal }: TileParticipant) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [version, setVersion] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    participant
      .on(ParticipantEvent.TrackPublished, refresh)
      .on(ParticipantEvent.TrackSubscribed, refresh)
      .on(ParticipantEvent.TrackUnpublished, refresh)
      .on(ParticipantEvent.TrackUnsubscribed, refresh)
      .on(ParticipantEvent.TrackMuted, refresh)
      .on(ParticipantEvent.TrackUnmuted, refresh)
      .on(ParticipantEvent.LocalTrackPublished, refresh)
      .on(ParticipantEvent.LocalTrackUnpublished, refresh);
    return () => {
      participant
        .off(ParticipantEvent.TrackPublished, refresh)
        .off(ParticipantEvent.TrackSubscribed, refresh)
        .off(ParticipantEvent.TrackUnpublished, refresh)
        .off(ParticipantEvent.TrackUnsubscribed, refresh)
        .off(ParticipantEvent.TrackMuted, refresh)
        .off(ParticipantEvent.TrackUnmuted, refresh)
        .off(ParticipantEvent.LocalTrackPublished, refresh)
        .off(ParticipantEvent.LocalTrackUnpublished, refresh);
    };
  }, [participant]);

  useEffect(() => {
    const videoElement = videoRef.current;
    const publication = getParticipantCameraPublication(participant);
    const track = publication?.videoTrack ?? publication?.track;
    if (!videoElement || !track || track.kind !== 'video' || track.isMuted) {
      setHasVideo(false);
      return;
    }
    track.attach(videoElement);
    setHasVideo(true);
    return () => { track.detach(videoElement); setHasVideo(false); };
  }, [participant, version]);

  const fallbackName = participant.name || `User ${identity.slice(0, 6)}`;

  return (
    // Fixed width, fills the strip height, horizontal scroll parent handles overflow
    <div className="relative h-full w-[148px] shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.8)]">
      <video
        ref={videoRef}
        autoPlay playsInline muted={isLocal}
        className="h-full w-full object-cover"
        style={{ display: hasVideo ? 'block' : 'none' }}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center
          bg-[linear-gradient(135deg,rgba(13,91,215,.12),rgba(47,99,64,.10))]">
          <div className="text-[1rem] font-bold text-[var(--brand-strong)]">
            {initialsFromName(fallbackName)}
          </div>
        </div>
      )}
      {/* Name + mic state */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1
        px-2 pb-1.5 pt-4 text-[0.62rem] text-white
        [background:linear-gradient(to_top,rgba(26,26,26,.72),transparent)]">
        <span className="truncate">
          {isLocal ? `${fallbackName} (You)` : fallbackName}
        </span>
        {!participant.isMicrophoneEnabled && (
          <span className="shrink-0 rounded-full bg-[rgba(220,50,50,.7)] px-1 py-0.5 text-[0.56rem]">
            Muted
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Grid column count helper ─────────────────────────────────────────────────

function gridCols(count: number): string {
  if (count <= 1) return 'repeat(1, 1fr)';
  if (count <= 2) return 'repeat(2, 1fr)';
  if (count <= 4) return 'repeat(2, 1fr)';
  if (count <= 9) return 'repeat(3, 1fr)';
  return 'repeat(4, 1fr)';
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function MediaPanel({ roomId, isExpanded = false }: MediaPanelProps) {
  const roomRef = useRef<Room | null>(null);
  const autoJoinAttemptedRef = useRef(false);
  const [renderTick, setRenderTick] = useState(0);
  const status = useMediaStore((s) => s.status);
  const error = useMediaStore((s) => s.error);
  const audioEnabled = useMediaStore((s) => s.audioEnabled);
  const videoEnabled = useMediaStore((s) => s.videoEnabled);
  const screenShareEnabled = useMediaStore((s) => s.screenShareEnabled);
  const participants = useMediaStore((s) => s.participants);
  const setStatus = useMediaStore((s) => s.setStatus);
  const setError = useMediaStore((s) => s.setError);
  const setDevices = useMediaStore((s) => s.setDevices);
  const setParticipants = useMediaStore((s) => s.setParticipants);
  const reset = useMediaStore((s) => s.reset);
  const [, forceRender] = useState(0);

  useEffect(() => {
    return () => {
      const room = roomRef.current;
      roomRef.current = null;
      reset();
      if (room) void room.disconnect(true);
    };
  }, [reset]);

  const readAutoJoinPreference = () => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(`${MEDIA_AUTOREJOIN_PREFIX}${roomId}`) === 'true';
  };

  const writeAutoJoinPreference = (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${MEDIA_AUTOREJOIN_PREFIX}${roomId}`, enabled ? 'true' : 'false');
  };

  const syncRoomState = (room: Room) => {
    setStatus(connectionStateToMediaStatus(room.state));
    setDevices({
      audioEnabled: room.localParticipant.isMicrophoneEnabled,
      videoEnabled: room.localParticipant.isCameraEnabled,
      screenShareEnabled: room.localParticipant.isScreenShareEnabled,
    });
    setParticipants(snapshotRoomParticipants(room));
    setRenderTick((v) => v + 1);
    forceRender((v) => v + 1);
  };

  const bindRoom = (room: Room) => {
    const refresh = () => syncRoomState(room);
    const bindParticipant = (participant: Participant) => {
      participant
        .on(ParticipantEvent.TrackPublished, refresh)
        .on(ParticipantEvent.TrackSubscribed, refresh)
        .on(ParticipantEvent.TrackUnpublished, refresh)
        .on(ParticipantEvent.TrackUnsubscribed, refresh)
        .on(ParticipantEvent.TrackMuted, refresh)
        .on(ParticipantEvent.TrackUnmuted, refresh)
        .on(ParticipantEvent.ParticipantNameChanged, refresh)
        .on(ParticipantEvent.LocalTrackPublished, refresh)
        .on(ParticipantEvent.LocalTrackUnpublished, refresh);
    };
    bindParticipant(room.localParticipant);
    room
      .on(RoomEvent.Connected, refresh)
      .on(RoomEvent.Reconnected, refresh)
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setStatus(connectionStateToMediaStatus(state));
        if (state === ConnectionState.Disconnected) {
          setDevices({ audioEnabled: false, videoEnabled: false, screenShareEnabled: false });
        }
      })
      .on(RoomEvent.ParticipantConnected, (participant: Participant) => {
        bindParticipant(participant);
        refresh();
      })
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, refresh)
      .on(RoomEvent.TrackUnsubscribed, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.MediaDevicesError, (err: Error) => {
        setError(err.message || 'Could not access camera or microphone.');
        setStatus('failed');
      })
      .on(RoomEvent.Disconnected, () => {
        setStatus('disconnected');
        setDevices({ audioEnabled: false, videoEnabled: false, screenShareEnabled: false });
        setParticipants([]);
        forceRender((v) => v + 1);
      });
  };

  const joinMedia = async () => {
    writeAutoJoinPreference(true);
    setError(null);
    setStatus('joining');
    const existingRoom = roomRef.current;
    if (existingRoom) { await existingRoom.disconnect(true); roomRef.current = null; }
    try {
      const session = await requestMediaToken(roomId);
      const room = createMediaRoom();
      roomRef.current = room;
      bindRoom(room);
      await room.connect(session.url, session.token);
      await room.startAudio();
      await room.startVideo();
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.localParticipant.setCameraEnabled(true);
      syncRoomState(room);
      setError(null);
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Failed to join media session.');
    }
  };

  const leaveMedia = async () => {
    writeAutoJoinPreference(false);
    const room = roomRef.current;
    roomRef.current = null;
    reset();
    if (room) await room.disconnect(true);
  };

  const toggleMicrophone = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
      syncRoomState(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle microphone.');
    }
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);
      syncRoomState(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle camera.');
    }
  };

  const toggleScreenShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const isSharing = room.localParticipant.isScreenShareEnabled;
      await room.localParticipant.setScreenShareEnabled(!isSharing, {
        audio: true,
        resolution: { width: 1920, height: 1080, frameRate: 30 },
      });
      syncRoomState(room);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') return;
      setError(err instanceof Error ? err.message : 'Failed to toggle screen share.');
    }
  };

  const { cameraTiles, screenTiles } = useMemo(() => {
    const room = roomRef.current;
    if (!room) return { cameraTiles: [] as TileParticipant[], screenTiles: [] as TileParticipant[] };
    const all: TileParticipant[] = [
      { identity: room.localParticipant.identity, name: room.localParticipant.name || 'You', isLocal: true, participant: room.localParticipant },
      ...Array.from(room.remoteParticipants.entries()).map(([id, p]) => ({
        identity: id, name: p.name || `User ${id.slice(0, 6)}`, isLocal: false, participant: p,
      })),
    ];
    return {
      cameraTiles: all,
      screenTiles: all.filter((t) => t.participant.isScreenShareEnabled),
    };
  }, [participants, renderTick]);

  useEffect(() => {
    if (autoJoinAttemptedRef.current) return;
    if (!readAutoJoinPreference()) return;
    autoJoinAttemptedRef.current = true;
    void joinMedia();
  }, [roomId]);

  const isInSession = status === 'connected' || status === 'joining' || status === 'reconnecting';
  const anyScreenShare = screenTiles.length > 0;

  // ─── Controls bar (shared between both layouts) ───────────────────────────
  const Controls = () => (
    <div className={`flex flex-wrap items-center gap-2 ${isExpanded ? 'justify-center' : ''}`}>
      {!isInSession ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void joinMedia()}>
          Join audio/video
        </button>
      ) : (
        <>
          <button type="button"
            className={`btn btn-sm ${isExpanded ? 'rounded-full px-4 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]' : 'btn-outline'}`}
            onClick={() => void toggleMicrophone()}>
            {audioEnabled ? 'Mute' : 'Unmute'}
          </button>
          <button type="button"
            className={`btn btn-sm ${isExpanded ? 'rounded-full px-4 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]' : 'btn-outline'}`}
            onClick={() => void toggleCamera()}>
            {videoEnabled ? 'Cam off' : 'Cam on'}
          </button>
          <button type="button"
            onClick={() => void toggleScreenShare()}
            className={`btn btn-sm flex items-center gap-1.5 ${
              screenShareEnabled
                ? 'btn-primary'
                : isExpanded
                  ? 'rounded-full px-4 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]'
                  : 'btn-outline'
            }`}>
            <IconScreen />
            {screenShareEnabled ? 'Stop sharing' : 'Share screen'}
          </button>
          <button type="button"
            className={`btn btn-sm ${isExpanded ? 'rounded-full px-4 bg-[rgba(220,50,50,.55)] text-white border-[rgba(220,50,50,.4)] hover:bg-[rgba(220,50,50,.75)]' : 'btn-outline'}`}
            onClick={() => void leaveMedia()}>
            Leave
          </button>
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // EXPANDED mode — fills full workspace, matches site design system
  // ─────────────────────────────────────────────────────────────────────────
  if (isExpanded) {
    return (
      <section className="glass flex h-full flex-col overflow-hidden rounded-2xl">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
          <div>
            <div className="text-[0.94rem] font-semibold text-[var(--brand-strong)]">Media Room</div>
            <div className="text-[0.76rem] soft-copy">
              {isInSession
                ? `${participants.length} participant${participants.length === 1 ? '' : 's'} in live media${screenShareEnabled ? ' · Sharing screen' : ''}`
                : 'Join voice and video for the workspace'}
            </div>
          </div>
          <span className="rounded-full border border-[rgba(13,91,215,.28)] bg-[rgba(13,91,215,.1)] px-2.5 py-1 text-[0.72rem] text-[#13489a]">
            {status}
          </span>
        </div>

        {/*
          ── GOOGLE MEET STYLE ADAPTIVE LAYOUT ──────────────────────────────
          · Screenshare active  → spotlight (main area) + camera thumbnail strip
          · No screenshare      → equal camera grid filling all space
        */}

        {anyScreenShare ? (
          // ── PRESENTATION MODE ─────────────────────────────────────────────
          <>
            {/* Main spotlight — screenshare fills all flex-1 space */}
            <div className="relative min-h-0 flex-1 overflow-hidden p-4 pb-2">
              <ScreenShareSpotlightTile
                key={`spot-${screenTiles[0]!.identity}`}
                {...screenTiles[0]!}
              />
            </div>

            {/* Camera thumbnail strip — horizontal scroll, fixed height */}
            {cameraTiles.length > 0 && (
              <div
                className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3"
                style={{ height: '120px', scrollbarWidth: 'thin' }}
              >
                {cameraTiles.map((tile) => (
                  <CameraThumbnailTile key={`thumb-${tile.identity}`} {...tile} />
                ))}
              </div>
            )}
          </>
        ) : (
          // ── GRID MODE ─────────────────────────────────────────────────────
          <div className="relative min-h-0 flex-1 overflow-hidden p-4">
            {cameraTiles.length > 0 ? (
              <div
                className="grid h-full gap-3"
                style={{ gridTemplateColumns: gridCols(cameraTiles.length) }}
              >
                {cameraTiles.map((tile) => (
                  <ParticipantTile key={tile.identity} {...tile} expanded />
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--ink-soft)]">
                <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor"
                  className="opacity-20" aria-hidden="true">
                  <path d="M2 6a2 2 0 012-2h8a2 2 0 012 2v2l4-2v8l-4-2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <div className="text-[0.9rem]">
                  {isInSession ? 'No video participants yet.' : 'Join to see participants.'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Participants bar ─────────────────────────────────────────────── */}
        {isInSession && cameraTiles.length > 0 && (
          <div className="shrink-0 border-t border-[var(--border-subtle)] px-5 py-2">
            <ParticipantsBar tiles={cameraTiles} />
          </div>
        )}

        {/* ── Controls bar ────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-[var(--border-subtle)] px-5 py-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!isInSession ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void joinMedia()}>
                Join audio/video
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void toggleMicrophone()}>
                  {audioEnabled ? 'Mute mic' : 'Unmute mic'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void toggleCamera()}>
                  {videoEnabled ? 'Turn camera off' : 'Turn camera on'}
                </button>
                <button type="button" onClick={() => void toggleScreenShare()}
                  className={`btn btn-sm flex items-center gap-1.5 ${screenShareEnabled ? 'btn-primary' : 'btn-outline'}`}>
                  <IconScreen />
                  {screenShareEnabled ? 'Stop sharing' : 'Share screen'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void leaveMedia()}>
                  Leave media
                </button>
              </>
            )}
          </div>
          {error && (
            <div className="mt-2 rounded-xl border border-[rgba(172,56,48,.24)] bg-[rgba(172,56,48,.12)] px-3 py-2 text-[0.78rem] text-[#8c2317]">
              {error}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SIDEBAR / COMPACT mode — elevated card layout
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <section className="glass flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-[20px]">

      {/* ── Panel header bar ──────────────────────────────────────────── */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(13,91,215,.12)] text-[var(--brand)]">
            <IconVideo />
          </span>
          <span className="panel-header-title">Media</span>
        </div>
        <div className="flex items-center gap-1.5">
          {status === 'connected' && (
            <>
              {videoEnabled && (
                <span className="status-pill status-pill-blue" title="Camera on">Camera</span>
              )}
              {audioEnabled && (
                <span className="status-pill status-pill-green" title="Mic on">Mic</span>
              )}
            </>
          )}
          <span className={`status-pill ${
            status === 'connected' ? 'status-pill-green' :
            status === 'joining' || status === 'reconnecting' ? 'status-pill-blue' :
            'status-pill-red'
          }`}>
            {status === 'connected' ? 'Live' :
             status === 'joining' ? 'Joining…' :
             status === 'reconnecting' ? 'Reconnecting…' :
             'Idle'}
          </span>
        </div>
      </div>

      {/* ── Content body ────────────────────────────────────────────────── */}
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">

        {/* Screen share tiles */}
        {screenTiles.map((tile) => (
          <ScreenShareTile key={`screen-${tile.identity}`} {...tile} />
        ))}

        {/* Camera tiles — responsive grid */}
        <div className={`grid gap-2 ${
          anyScreenShare ? 'grid-cols-3' :
          cameraTiles.length === 1 ? 'grid-cols-1' :
          'grid-cols-2'
        }`}>
          {cameraTiles.length > 0 ? (
            cameraTiles.map((tile) => <ParticipantTile key={tile.identity} {...tile} />)
          ) : (
            <div className={`col-span-2 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[rgba(26,26,26,.18)] bg-[rgba(255,250,241,.56)] py-8 text-[var(--ink-soft)]`}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              <span className="text-[0.8rem]">
                {isInSession ? 'No video participants yet.' : 'Join to see participants.'}
              </span>
            </div>
          )}
        </div>

        {/* Participants bar */}
        {isInSession && cameraTiles.length > 0 && (
          <ParticipantsBar tiles={cameraTiles} />
        )}

        {/* Controls */}
        <Controls />

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-[rgba(172,56,48,.24)] bg-[rgba(172,56,48,.12)] px-3 py-2 text-[0.78rem] text-[#8c2317]">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
