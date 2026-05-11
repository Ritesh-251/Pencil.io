"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ConnectionState,
  ParticipantEvent,
  RoomEvent,
  type Participant,
  type Room,
} from "livekit-client";
import {
  connectionStateToMediaStatus,
  createMediaRoom,
  getParticipantCameraPublication,
  getParticipantScreenSharePublication,
  parseDataMessage,
  publishRaiseHand,
  publishReaction,
  requestMediaToken,
  snapshotRoomParticipants,
} from "@/lib/livekit";
import { useMediaStore, type ReactionEvent } from "@/store/media.store";
import {
  MEDIA_AUTOREJOIN_PREFIX,
  RAISE_HAND_TIMEOUT_MS,
  REACTION_TTL_MS,
  REACTION_EMOJIS,
  nanoid6,
  initialsFromName,
  IconScreen,
  IconVideo,
  IconMic,
  IconCamera,
  IconHand,
  IconNoise,
  IconPin,
  IconPiP,
} from "./mediaPanel.shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaPanelProps = { roomId: string; isExpanded?: boolean };

type TileParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  participant: Participant;
};

// ─── Shared tile overlay helpers ──────────────────────────────────────────────
// The key fix: reactions are rendered OUTSIDE the overflow-hidden clip box
// so they can float above the tile boundary. Structure:
//   <outer div: relative, NO overflow-hidden>     ← positioning context + speaking ring
//     <inner div: absolute inset-0 overflow-hidden> ← clips video/bg to rounded corners
//       <video />, <fallback />, <label />
//     </inner>
//     <hand badge />     ← outside clip, visible above tile
//     <pin button />     ← outside clip
//     <reaction spans /> ← outside clip, float up freely
//   </outer>

// ─── Camera tile ──────────────────────────────────────────────────────────────

type TileProps = TileParticipant & {
  expanded?: boolean;
  isSpeaking?: boolean;
  isHandRaised?: boolean;
  isPinned?: boolean;
  reactions?: ReactionEvent[];
  onPinToggle?: (identity: string) => void;
};

function ParticipantTile({
  participant,
  identity,
  isLocal,
  expanded,
  isSpeaking,
  isHandRaised,
  isPinned,
  reactions = [],
  onPinToggle,
}: TileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [version, setVersion] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);
  const [hovered, setHovered] = useState(false);

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

  useLayoutEffect(() => {
    const el = videoRef.current;
    const pub = getParticipantCameraPublication(participant);
    const track = pub?.videoTrack ?? pub?.track;
    if (!el || !track || track.kind !== "video" || track.isMuted) {
      setHasVideo(false);
      return;
    }

    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        track.attach(el);
        setHasVideo(true);
      } catch {
        setHasVideo(false);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      track.detach(el);
      setHasVideo(false);
    };
  }, [participant, version]);

  const fallbackName = participant.name || `User ${identity.slice(0, 6)}`;

  const outerClass = [
    "media-tile relative rounded-2xl",
    isSpeaking ? "media-speaking" : "",
    isPinned ? "media-pinned" : "",
    expanded ? "h-full w-full" : "",
  ].join(" ");

  return (
    <div
      className={outerClass}
      style={expanded ? undefined : { aspectRatio: "16/9" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute inset-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.7)]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ display: hasVideo ? "block" : "none" }}
        />
        {!hasVideo && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,rgba(13,91,215,.12),rgba(47,99,64,.10))]`}
          >
            <div
              className={`grid place-items-center rounded-full bg-[rgba(13,91,215,.18)] font-bold text-[var(--brand-strong)] ${expanded ? "h-20 w-20 text-[2rem]" : "h-12 w-12 text-[1.15rem]"}`}
            >
              {initialsFromName(fallbackName)}
            </div>
            {participant.isCameraEnabled && (
              <div
                className={`font-medium text-[rgba(13,91,215,.8)] ${expanded ? "text-[0.8rem]" : "text-[0.7rem]"}`}
              >
                Camera starting…
              </div>
            )}
          </div>
        )}
        <div
          className={`absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 text-white ${expanded ? "pb-3 pt-6" : "py-2"}`}
          style={{
            background:
              "linear-gradient(to top, rgba(26,26,26,.75), transparent)",
          }}
        >
          <span
            className={
              expanded
                ? "text-[0.82rem] font-medium"
                : "truncate text-[0.72rem]"
            }
          >
            {isLocal ? `${fallbackName} (You)` : fallbackName}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              title={participant.isMicrophoneEnabled ? "Mic on" : "Mic off"}
              className={`flex items-center justify-center rounded-full border ${participant.isMicrophoneEnabled ? "border-[rgba(255,255,255,.25)] bg-[rgba(255,255,255,.15)]" : "border-[rgba(255,80,80,.5)] bg-[rgba(255,80,80,.3)]"} ${expanded ? "h-6 w-6" : "h-5 w-5"}`}
            >
              <IconMic active={participant.isMicrophoneEnabled} />
            </span>
            <span
              title={participant.isCameraEnabled ? "Camera on" : "Camera off"}
              className={`flex items-center justify-center rounded-full border ${participant.isCameraEnabled ? "border-[rgba(255,255,255,.25)] bg-[rgba(255,255,255,.15)]" : "border-[rgba(255,80,80,.5)] bg-[rgba(255,80,80,.3)]"} ${expanded ? "h-6 w-6" : "h-5 w-5"}`}
            >
              <IconCamera active={participant.isCameraEnabled} />
            </span>
          </div>
        </div>
      </div>

      {isHandRaised && (
        <div className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(234,179,8,.9)] text-[1.1rem] shadow-md">
          ✋
        </div>
      )}

      {onPinToggle && (
        <button
          type="button"
          onClick={() => onPinToggle(identity)}
          title={isPinned ? "Unpin" : "Pin this participant"}
          className="media-tile-pin-btn absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm border shadow-md cursor-pointer
            border-[rgba(255,255,255,.35)] bg-[rgba(26,26,26,.55)] text-white hover:bg-[rgba(13,91,215,.8)]"
          style={{
            opacity: hovered || isPinned ? 1 : 0,
            transform: hovered || isPinned ? "scale(1)" : "scale(0.8)",
            transition: "opacity 140ms, transform 140ms, background 150ms",
          }}
        >
          <IconPin filled={isPinned} />
        </button>
      )}

      {reactions.map((r) => (
        <span key={r.id} className="media-reaction-bubble">
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

// ─── Screen share compact tile (sidebar) ─────────────────────────────────────

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

  useLayoutEffect(() => {
    const el = videoRef.current;
    const pub = getParticipantScreenSharePublication(participant);
    const track = pub?.videoTrack ?? pub?.track;
    if (!el || !track || track.kind !== "video") {
      setHasVideo(false);
      return;
    }

    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        track.attach(el);
        setHasVideo(true);
      } catch {
        setHasVideo(false);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      track.detach(el);
      setHasVideo(false);
    };
  }, [participant, version]);

  const fallbackName = participant.name || `User ${identity.slice(0, 6)}`;
  const label = isLocal ? "Your screen" : `${fallbackName} is presenting`;

  return (
    <div
      style={{ display: hasVideo ? "block" : "none" }}
      className="relative overflow-hidden rounded-xl border-2 border-[rgba(13,91,215,.5)] bg-[#111]"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full object-contain rounded-xl bg-[#111]"
        style={{ maxHeight: "340px", minHeight: "180px", display: "block" }}
      />
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

// ─── Screen share spotlight (full-panel expanded mode) ────────────────────────

function ScreenShareSpotlightTile({
  participant,
  identity,
  isLocal,
}: TileParticipant) {
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

  useLayoutEffect(() => {
    const el = videoRef.current;
    const pub = getParticipantScreenSharePublication(participant);
    const track = pub?.videoTrack ?? pub?.track;
    if (!el || !track || track.kind !== "video") {
      setHasVideo(false);
      return;
    }

    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        track.attach(el);
        setHasVideo(true);
      } catch {
        setHasVideo(false);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      track.detach(el);
      setHasVideo(false);
    };
  }, [participant, version]);

  const fallbackName = participant.name || `User ${identity.slice(0, 6)}`;
  const label = isLocal
    ? "You are presenting"
    : `${fallbackName} is presenting`;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-[rgba(13,91,215,.28)] bg-[rgba(255,250,241,.7)]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="h-full w-full rounded-2xl object-contain"
        style={{ display: hasVideo ? "block" : "none" }}
      />
      {!hasVideo && (
        <div className="flex flex-col items-center gap-3 text-[var(--ink-soft)]">
          <IconScreen />
          <div className="text-[0.9rem]">Loading shared screen…</div>
        </div>
      )}
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

// ─── Camera thumbnail tile (horizontal strip in presentation mode) ─────────────

function CameraThumbnailTile({
  participant,
  identity,
  isLocal,
  isSpeaking,
  isHandRaised,
  reactions = [],
  isPinned,
  onPinToggle,
}: TileParticipant & {
  isSpeaking?: boolean;
  isHandRaised?: boolean;
  reactions?: ReactionEvent[];
  isPinned?: boolean;
  onPinToggle?: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [version, setVersion] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);
  const [hovered, setHovered] = useState(false);

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

  useLayoutEffect(() => {
    const el = videoRef.current;
    const pub = getParticipantCameraPublication(participant);
    const track = pub?.videoTrack ?? pub?.track;
    if (!el || !track || track.kind !== "video" || track.isMuted) {
      setHasVideo(false);
      return;
    }

    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        track.attach(el);
        setHasVideo(true);
      } catch {
        setHasVideo(false);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      track.detach(el);
      setHasVideo(false);
    };
  }, [participant, version]);

  const fallbackName = participant.name || `User ${identity.slice(0, 6)}`;

  return (
    <div
      className={`media-tile relative h-full w-[148px] shrink-0 rounded-xl ${isSpeaking ? "media-speaking" : ""} ${isPinned ? "media-pinned" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute inset-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.8)]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="h-full w-full object-cover"
          style={{ display: hasVideo ? "block" : "none" }}
        />
        {!hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,rgba(13,91,215,.12),rgba(47,99,64,.10))]">
            <div className="text-[0.95rem] font-bold text-[var(--brand-strong)]">
              {initialsFromName(fallbackName)}
            </div>
          </div>
        )}
        <div
          className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-2 pb-1.5 pt-4 text-[0.62rem] text-white"
          style={{
            background:
              "linear-gradient(to top, rgba(26,26,26,.72), transparent)",
          }}
        >
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
      {isHandRaised && (
        <div className="absolute right-1 top-1 z-20 text-[0.9rem]">✋</div>
      )}
      {onPinToggle && (
        <button
          type="button"
          onClick={() => onPinToggle(identity)}
          title={isPinned ? "Unpin" : "Pin"}
          className="absolute left-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(255,255,255,.35)] bg-[rgba(26,26,26,.55)] text-white cursor-pointer hover:bg-[rgba(13,91,215,.8)]"
          style={{
            opacity: hovered || isPinned ? 1 : 0,
            transform: hovered || isPinned ? "scale(1)" : "scale(0.8)",
            transition: "opacity 140ms, transform 140ms",
          }}
        >
          <IconPin filled={isPinned} />
        </button>
      )}
      {reactions.map((r) => (
        <span
          key={r.id}
          className="media-reaction-bubble"
          style={{ fontSize: "1.4rem", bottom: "28px" }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

// ─── Grid column count ─────────────────────────────────────────────────────────

function gridCols(n: number) {
  if (n <= 1) return "repeat(1, 1fr)";
  if (n <= 2) return "repeat(2, 1fr)";
  if (n <= 4) return "repeat(2, 1fr)";
  if (n <= 9) return "repeat(3, 1fr)";
  return "repeat(4, 1fr)";
}

// ─── Participants bar ──────────────────────────────────────────────────────────

function ParticipantsBar({
  tiles,
  raisedHands,
  activeSpeakers,
  dark,
}: {
  tiles: TileParticipant[];
  raisedHands: Set<string>;
  activeSpeakers: string[];
  dark?: boolean;
}) {
  if (!tiles.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`text-[0.72rem] font-semibold uppercase tracking-wide ${dark ? "text-[rgba(255,255,255,.5)]" : "text-[var(--brand-strong)] opacity-60"}`}
      >
        Participants ({tiles.length})
      </div>
      <div
        className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1"
        style={{ scrollbarWidth: "thin" }}
      >
        {tiles.map((tile) => {
          const name =
            tile.participant.name || `User ${tile.identity.slice(0, 6)}`;
          const isSpeaking = activeSpeakers.includes(tile.identity);
          const isHandUp = raisedHands.has(tile.identity);
          const isSharing = tile.participant.isScreenShareEnabled;
          return (
            <div
              key={tile.identity}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.78rem] transition-colors ${dark ? "hover:bg-[rgba(255,255,255,.07)] text-[rgba(255,255,255,.85)]" : "hover:bg-[rgba(26,26,26,.06)] text-[var(--ink-base)]"}`}
            >
              <div
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.62rem] font-bold ${isSpeaking ? "bg-[rgba(34,197,94,.2)] text-[#14532d]" : dark ? "bg-[rgba(255,255,255,.12)] text-white" : "bg-[rgba(13,91,215,.18)] text-[var(--brand-strong)]"}`}
              >
                {initialsFromName(name)}
              </div>
              <span className="min-w-0 flex-1 truncate">
                {tile.isLocal ? `${name} (You)` : name}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {isHandUp && <span title="Hand raised">✋</span>}
                {isSpeaking && (
                  <span
                    className="h-2 w-2 rounded-full bg-[#22c55e]"
                    title="Speaking"
                  />
                )}
                <IconMic active={tile.participant.isMicrophoneEnabled} />
                <IconCamera active={tile.participant.isCameraEnabled} />
                {isSharing && (
                  <span className="rounded-full bg-[rgba(13,91,215,.3)] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[#7eb3ff]">
                    Screen
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

// ─── Raised-hand banner ────────────────────────────────────────────────────────

function RaisedHandBanner({
  tiles,
  raisedHands,
}: {
  tiles: TileParticipant[];
  raisedHands: Set<string>;
}) {
  const raised = tiles.filter((t) => raisedHands.has(t.identity) && !t.isLocal);
  if (!raised.length) return null;
  const names = raised
    .slice(0, 2)
    .map((t) => t.participant.name || `User ${t.identity.slice(0, 6)}`);
  const extra = raised.length > 2 ? ` +${raised.length - 2} more` : "";
  return (
    <div className="mx-2 mt-1 flex items-center gap-2 rounded-xl border border-[rgba(234,179,8,.35)] bg-[rgba(234,179,8,.12)] px-3 py-2 text-[0.78rem] text-[#92400e]">
      <span className="text-[1rem]">✋</span>
      <span className="font-medium">
        {names.join(", ")}
        {extra} raised their hand
      </span>
    </div>
  );
}

// ─── Reaction tray ─────────────────────────────────────────────────────────────

function ReactionTray({
  onReact,
  dark,
}: {
  onReact: (emoji: string) => void;
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    // Defer attaching the outside-click listener to the next event loop tick.
    // Without this, the mousedown that opens the drawer immediately bubbles to
    // document — which would trigger this handler and close it in the same cycle.
    const timerId = setTimeout(() => {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("touchstart", handleOutsideClick);
    }, 0);

    return () => {
      clearTimeout(timerId);
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`btn btn-sm ${dark ? "rounded-full px-3 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]" : "btn-outline"}`}
        aria-label="Send reaction"
      >
        😊
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.97)] p-2 shadow-xl backdrop-blur-md z-30">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(emoji);
                // Keep drawer open so user can click multiple emojis to react,
                // closes when clicking outside of the ReactionTray trigger.
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[1.35rem] transition-transform hover:scale-125 hover:bg-[rgba(13,91,215,.08)] active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function MediaPanel({ roomId, isExpanded = false }: MediaPanelProps) {
  const roomRef = useRef<Room | null>(null);
  const autoJoinAttemptedRef = useRef(false);
  const handTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Hidden video element backing the PiP feed — always attached to local camera track
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  const [renderTick, setRenderTick] = useState(0);

  // Krisp loaded dynamically so Next.js SSR doesn't choke
  const [KrispFilter, setKrispFilter] = useState<(() => unknown) | null>(null);
  const [krispAvail, setKrispAvail] = useState(false);

  useEffect(() => {
    import("@livekit/krisp-noise-filter")
      .then((mod) => {
        if ((mod as any).isKrispNoiseFilterSupported?.()) {
          setKrispAvail(true);
          setKrispFilter(() => (mod as any).KrispNoiseFilter);
        }
      })
      .catch(() => {
        /* not installed */
      });
  }, []);

  // ── Store ───────────────────────────────────────────────────────────────
  const status = useMediaStore((s) => s.status);
  const error = useMediaStore((s) => s.error);
  const audioEnabled = useMediaStore((s) => s.audioEnabled);
  const videoEnabled = useMediaStore((s) => s.videoEnabled);
  const screenShareEnabled = useMediaStore((s) => s.screenShareEnabled);
  const noiseSuppression = useMediaStore((s) => s.noiseSuppression);
  const participants = useMediaStore((s) => s.participants);
  const activeSpeakers = useMediaStore((s) => s.activeSpeakers);
  const raisedHands = useMediaStore((s) => s.raisedHands);
  const reactions = useMediaStore((s) => s.reactions);

  const setStatus = useMediaStore((s) => s.setStatus);
  const setRoom = useMediaStore((s) => s.setRoom);
  const setError = useMediaStore((s) => s.setError);
  const setDevices = useMediaStore((s) => s.setDevices);
  const setNoiseSuppression = useMediaStore((s) => s.setNoiseSuppression);
  const setParticipants = useMediaStore((s) => s.setParticipants);
  const setActiveSpeakers = useMediaStore((s) => s.setActiveSpeakers);
  const setRaisedHand = useMediaStore((s) => s.setRaisedHand);
  const addReaction = useMediaStore((s) => s.addReaction);
  const pruneReactions = useMediaStore((s) => s.pruneReactions);
  const reset = useMediaStore((s) => s.reset);

  const [, forceRender] = useState(0);
  const [localHandRaised, setLocalHandRaised] = useState(false);
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);
  const [spotlightSharerIdentity, setSpotlightSharerIdentity] = useState<
    string | null
  >(null);
  const [isPiP, setIsPiP] = useState(false);
  const [audioResumeNeeded, setAudioResumeNeeded] = useState(false);
  // createPortal() does NOT work cross-document. createRoot() is the correct API.
  const pipRootRef = useRef<Root | null>(null);
  const [pipIsOpen, setPipIsOpen] = useState(false);
  const [pipViewIndex, setPipViewIndex] = useState(0);
  const [pipPinnedKey, setPipPinnedKey] = useState<string | null>(null);

  // Build tile lists
  const { cameraTiles, screenTiles } = useMemo(() => {
    const room = roomRef.current;
    if (!room)
      return {
        cameraTiles: [] as TileParticipant[],
        screenTiles: [] as TileParticipant[],
      };
    const all: TileParticipant[] = [
      {
        identity: room.localParticipant.identity,
        name: room.localParticipant.name || "You",
        isLocal: true,
        participant: room.localParticipant,
      },
      ...Array.from(room.remoteParticipants.entries()).map(([id, p]) => ({
        identity: id,
        name: p.name || `User ${id.slice(0, 6)}`,
        isLocal: false,
        participant: p,
      })),
    ];
    return {
      cameraTiles: all,
      screenTiles: all.filter((t) => t.participant.isScreenShareEnabled),
    };
  }, [participants, renderTick]);

  const reactionsFor = (identity: string) =>
    reactions.filter((r) => r.identity === identity);

  // Spotlight: follows screenshare (preferred) or pinned identity
  useEffect(() => {
    if (screenTiles.length === 0) {
      setSpotlightSharerIdentity(null);
      return;
    }
    setSpotlightSharerIdentity((prev) =>
      prev && screenTiles.some((t) => t.identity === prev)
        ? prev
        : screenTiles[0]!.identity,
    );
  }, [screenTiles]);

  // Clear pin if participant leaves
  useEffect(() => {
    if (
      pinnedIdentity &&
      !cameraTiles.some((t) => t.identity === pinnedIdentity)
    ) {
      setPinnedIdentity(null);
    }
  }, [cameraTiles, pinnedIdentity]);

  // Prune stale reactions
  useEffect(() => {
    const t = setInterval(
      () => pruneReactions(Date.now() - REACTION_TTL_MS),
      500,
    );
    return () => clearInterval(t);
  }, [pruneReactions]);

  // Detach PiP video on unmount
  useEffect(() => {
    return () => {
      const room = roomRef.current;
      roomRef.current = null;
      setRoom(null);
      reset();
      for (const t of handTimeoutsRef.current.values()) clearTimeout(t);
      handTimeoutsRef.current.clear();
      if (room) void room.disconnect(true);
    };
  }, [reset, setRoom]);

  // Keep PiP backing video attached to local camera
  useEffect(() => {
    const room = roomRef.current;
    const el = pipVideoRef.current;
    if (!room || !el || status !== "connected") return;
    const pub = getParticipantCameraPublication(room.localParticipant);
    const track = pub?.videoTrack ?? pub?.track;
    if (!track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [renderTick, status]);

  const readAutoJoin = () =>
    typeof window !== "undefined" &&
    localStorage.getItem(`${MEDIA_AUTOREJOIN_PREFIX}${roomId}`) === "true";
  const writeAutoJoin = (v: boolean) => {
    if (typeof window !== "undefined")
      localStorage.setItem(`${MEDIA_AUTOREJOIN_PREFIX}${roomId}`, String(v));
  };

  const syncRoomState = useCallback(
    (room: Room) => {
      setStatus(connectionStateToMediaStatus(room.state));
      setDevices({
        audioEnabled: room.localParticipant.isMicrophoneEnabled,
        videoEnabled: room.localParticipant.isCameraEnabled,
        screenShareEnabled: room.localParticipant.isScreenShareEnabled,
      });
      setParticipants(snapshotRoomParticipants(room));
      setRenderTick((v) => v + 1);
      forceRender((v) => v + 1);
    },
    [setStatus, setDevices, setParticipants],
  );

  const bindRoom = useCallback(
    (room: Room) => {
      const refresh = () => syncRoomState(room);

      const bindParticipant = (p: Participant) => {
        p.on(ParticipantEvent.TrackPublished, refresh)
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
          if (state === ConnectionState.Disconnected)
            setDevices({
              audioEnabled: false,
              videoEnabled: false,
              screenShareEnabled: false,
            });
        })
        .on(RoomEvent.ParticipantConnected, (p: Participant) => {
          bindParticipant(p);
          refresh();
        })
        .on(RoomEvent.ParticipantDisconnected, (p: Participant) => {
          setRaisedHand(p.identity, false);
          refresh();
        })
        .on(RoomEvent.TrackSubscribed, refresh)
        .on(RoomEvent.TrackUnsubscribed, refresh)
        .on(RoomEvent.TrackMuted, refresh)
        .on(RoomEvent.TrackUnmuted, refresh)
        .on(RoomEvent.LocalTrackPublished, refresh)
        .on(RoomEvent.LocalTrackUnpublished, refresh)
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          setActiveSpeakers(speakers.map((s) => s.identity));
        })
        .on(
          RoomEvent.DataReceived,
          (payload: Uint8Array, participant?: Participant) => {
            if (!participant) return;
            const msg = parseDataMessage(payload);
            if (!msg) return;

            if (msg.type === "raise-hand") {
              const { identity } = participant;
              setRaisedHand(identity, msg.raised);
              const prev = handTimeoutsRef.current.get(identity);
              if (prev) clearTimeout(prev);
              if (msg.raised) {
                const t = setTimeout(
                  () => setRaisedHand(identity, false),
                  RAISE_HAND_TIMEOUT_MS,
                );
                handTimeoutsRef.current.set(identity, t);
              } else {
                handTimeoutsRef.current.delete(identity);
              }
            }

            if (msg.type === "reaction") {
              addReaction({
                id: nanoid6(),
                identity: participant.identity,
                emoji: msg.emoji,
                at: Date.now(),
              });
            }
          },
        )
        .on(RoomEvent.MediaDevicesError, (err: Error) => {
          setError(err.message || "Could not access camera or microphone.");
          setStatus("failed");
        })
        .on(RoomEvent.Disconnected, () => {
          setRoom(null);
          setStatus("disconnected");
          setDevices({
            audioEnabled: false,
            videoEnabled: false,
            screenShareEnabled: false,
          });
          setParticipants([]);
          forceRender((v) => v + 1);
        });
    },
    [
      syncRoomState,
      setStatus,
      setRoom,
      setDevices,
      setParticipants,
      setActiveSpeakers,
      setRaisedHand,
      addReaction,
      setError,
    ],
  );

  // ── Actions ────────────────────────────────────────────────────────────────

  const joinMedia = async () => {
    writeAutoJoin(true);
    setError(null);
    setStatus("joining");
    const existing = roomRef.current;
    if (existing) {
      await existing.disconnect(true);
      roomRef.current = null;
    }
    try {
      let audioNeedsResume = false;
      const session = await requestMediaToken(roomId);
      const room = createMediaRoom();
      roomRef.current = room;
      setRoom(room);
      bindRoom(room);
      await room.connect(session.url, session.token);
      try {
        await room.startAudio();
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (audioError) {
        if (
          !(
            audioError instanceof DOMException &&
            audioError.name === "NotAllowedError"
          )
        ) {
          throw audioError;
        }
        audioNeedsResume = true;
        setAudioResumeNeeded(true);
        setError(
          "Audio needs a click to start. Use Resume Audio to enable microphone playback.",
        );
      }
      await room.startVideo();
      await room.localParticipant.setCameraEnabled(true);
      syncRoomState(room);
      if (!audioNeedsResume) {
        setAudioResumeNeeded(false);
        setError(null);
      }
    } catch (err) {
      const room = roomRef.current;
      roomRef.current = null;
      setRoom(null);
      if (room) await room.disconnect(true);
      setStatus("failed");
      setError(
        err instanceof Error ? err.message : "Failed to join media session.",
      );
    }
  };

  const leaveMedia = async () => {
    writeAutoJoin(false);
    const room = roomRef.current;
    roomRef.current = null;
    setRoom(null);
    setAudioResumeNeeded(false);
    reset();
    setLocalHandRaised(false);
    setPinnedIdentity(null);
    if (room) await room.disconnect(true);
  };

  const resumeAudio = async () => {
    const room = roomRef.current;
    if (!room) return;

    try {
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      setAudioResumeNeeded(false);
      syncRoomState(room);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setAudioResumeNeeded(true);
        setError(
          "Audio is still blocked. Click Resume Audio again after a user gesture.",
        );
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to resume audio.");
    }
  };

  const toggleMicrophone = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(
        !room.localParticipant.isMicrophoneEnabled,
      );
      syncRoomState(room);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to toggle microphone.",
      );
    }
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(
        !room.localParticipant.isCameraEnabled,
      );
      syncRoomState(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle camera.");
    }
  };

  const toggleScreenShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(
        !room.localParticipant.isScreenShareEnabled,
        {
          audio: true,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
        },
      );
      syncRoomState(room);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      setError(
        err instanceof Error ? err.message : "Failed to toggle screen share.",
      );
    }
  };

  const toggleNoiseSuppression = async () => {
    const room = roomRef.current;
    if (!room || !KrispFilter) return;
    const next = !noiseSuppression;
    try {
      if (next) {
        await room.localParticipant.setMicrophoneEnabled(true, undefined, {
          processor: KrispFilter(),
        } as any);
      } else {
        await room.localParticipant.setMicrophoneEnabled(
          room.localParticipant.isMicrophoneEnabled,
        );
      }
      setNoiseSuppression(next);
      syncRoomState(room);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Noise suppression failed.",
      );
    }
  };

  const toggleRaiseHand = () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !localHandRaised;
    setLocalHandRaised(next);
    publishRaiseHand(room, next);
    setRaisedHand(room.localParticipant.identity, next);
    const prev = handTimeoutsRef.current.get("_local");
    if (prev) clearTimeout(prev);
    if (next) {
      const t = setTimeout(() => {
        setLocalHandRaised(false);
        setRaisedHand(room.localParticipant.identity, false);
      }, RAISE_HAND_TIMEOUT_MS);
      handTimeoutsRef.current.set("_local", t);
    }
  };

  const sendReaction = (emoji: string) => {
    const room = roomRef.current;
    if (!room) return;
    publishReaction(room, emoji);
    // Also show locally
    addReaction({
      id: nanoid6(),
      identity: room.localParticipant.identity,
      emoji,
      at: Date.now(),
    });
  };

  const togglePin = (identity: string) => {
    setPinnedIdentity((prev) => (prev === identity ? null : identity));
  };

  const togglePiP = async () => {
    // Prefer Document PiP (Chrome 116+) — renders the entire participant grid
    const docPiP = (window as any).documentPictureInPicture;
    if (docPiP) {
      try {
        if (pipIsOpen) {
          docPiP.window?.close(); // pagehide listener cleans up state
          return;
        }
        const pipWin: Window = await docPiP.requestWindow({
          width: 420,
          height: 300,
        });
        // Next.js inlines CSS via <style> tags — clone them into the PiP document
        [...document.querySelectorAll("style, link[rel=stylesheet]")].forEach(
          (el) => {
            pipWin.document.head.appendChild(el.cloneNode(true));
          },
        );
        pipWin.document.documentElement.style.cssText = "height:100%";
        pipWin.document.body.style.cssText =
          "margin:0;height:100%;background:#141414;overflow:hidden";
        // Create a React root in the PiP window — this is the correct cross-document pattern
        const pipRoot = createRoot(pipWin.document.body);
        pipRootRef.current = pipRoot;
        setPipIsOpen(true);
        setIsPiP(true);
        pipWin.addEventListener("pagehide", () => {
          pipRootRef.current?.unmount();
          pipRootRef.current = null;
          setPipIsOpen(false);
          setIsPiP(false);
        });
        return;
      } catch {
        /* fall through to video PiP */
      }
    }

    // Fallback: video PiP (local camera only — all browsers)
    const el = pipVideoRef.current;
    if (!el) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await el.requestPictureInPicture();
        setIsPiP(true);
        el.addEventListener("leavepictureinpicture", () => setIsPiP(false), {
          once: true,
        });
      }
    } catch {
      /* PiP not supported */
    }
  };

  // Sync PiP content whenever relevant state changes.
  // root.render() is imperative here because the PiP window is a separate
  // browsing context — React portals (createPortal) only work same-document.
  useEffect(() => {
    if (!pipRootRef.current || !pipIsOpen) return;
    pipRootRef.current.render(
      <PipCarouselContent
        screenTiles={screenTiles}
        cameraTiles={cameraTiles}
        activeSpeakers={activeSpeakers}
        raisedHands={raisedHands}
        reactions={reactions}
        pipViewIndex={pipViewIndex}
        setPipViewIndex={setPipViewIndex}
        pipPinnedKey={pipPinnedKey}
        setPipPinnedKey={setPipPinnedKey}
      />,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pipIsOpen,
    screenTiles,
    cameraTiles,
    activeSpeakers,
    raisedHands,
    reactions,
    pipViewIndex,
    pipPinnedKey,
  ]);

  // Auto-rejoin
  useEffect(() => {
    if (autoJoinAttemptedRef.current || !readAutoJoin()) return;
    autoJoinAttemptedRef.current = true;
    void joinMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const isInSession =
    status === "connected" || status === "joining" || status === "reconnecting";
  const anyScreen = screenTiles.length > 0;
  const spotlightTile = useMemo(
    () =>
      screenTiles.find((t) => t.identity === spotlightSharerIdentity) ??
      screenTiles[0] ??
      null,
    [screenTiles, spotlightSharerIdentity],
  );

  // In expanded mode: show spotlight layout if screenshare OR pinned (no screenshare)
  const pinnedTile = pinnedIdentity
    ? (cameraTiles.find((t) => t.identity === pinnedIdentity) ?? null)
    : null;
  const showPinSpotlight = isExpanded && !anyScreen && pinnedTile !== null;
  const pipSupported =
    typeof window !== "undefined" &&
    ("documentPictureInPicture" in window ||
      ("pictureInPictureEnabled" in document &&
        (document as any).pictureInPictureEnabled));

  // ── Controls bar ────────────────────────────────────────────────────────────
  const renderControlsBar = (dark?: boolean) => (
    <div
      className={`flex flex-wrap items-center gap-2 ${isExpanded ? "justify-center" : ""}`}
    >
      {!isInSession ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void joinMedia()}
        >
          Join audio/video
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void toggleMicrophone()}
            className={`btn btn-sm ${dark ? "rounded-full px-3 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]" : "btn-outline"}`}
          >
            {audioEnabled ? "Mute" : "Unmute"}
          </button>
          <button
            type="button"
            onClick={() => void toggleCamera()}
            className={`btn btn-sm ${dark ? "rounded-full px-3 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]" : "btn-outline"}`}
          >
            {videoEnabled ? "Cam off" : "Cam on"}
          </button>
          <button
            type="button"
            onClick={() => void toggleScreenShare()}
            className={`btn btn-sm flex items-center gap-1.5 ${screenShareEnabled ? "btn-primary" : dark ? "rounded-full px-3 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]" : "btn-outline"}`}
          >
            <IconScreen />
            {screenShareEnabled ? "Stop sharing" : "Share screen"}
          </button>
          <button
            type="button"
            onClick={toggleRaiseHand}
            className={`btn btn-sm flex items-center gap-1.5 ${localHandRaised ? "bg-[rgba(234,179,8,.85)] text-white border-[rgba(234,179,8,.6)]" : dark ? "rounded-full px-3 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]" : "btn-outline"}`}
          >
            <IconHand />
            {localHandRaised ? "Lower hand" : "Raise hand"}
          </button>
          {audioResumeNeeded && (
            <button
              type="button"
              onClick={() => void resumeAudio()}
              className={`btn btn-sm flex items-center gap-1.5 ${dark ? "rounded-full px-3 bg-[rgba(13,91,215,.85)] text-white border-[rgba(13,91,215,.6)] hover:bg-[rgba(13,91,215,.95)]" : "btn-primary"}`}
            >
              Resume Audio
            </button>
          )}
          <ReactionTray onReact={sendReaction} dark={dark} />
          {krispAvail && (
            <button
              type="button"
              onClick={() => void toggleNoiseSuppression()}
              className={`btn btn-sm flex items-center gap-1.5 ${noiseSuppression ? "btn-primary" : dark ? "rounded-full px-3 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]" : "btn-outline"}`}
            >
              <IconNoise />
              {noiseSuppression ? "Noise ✓" : "Denoise"}
            </button>
          )}
          {pipSupported && status === "connected" && (
            <button
              type="button"
              onClick={() => void togglePiP()}
              title={isPiP ? "Exit Picture-in-Picture" : "Picture-in-Picture"}
              className={`btn btn-sm flex items-center gap-1.5 ${isPiP ? "btn-primary" : dark ? "rounded-full px-3 bg-[rgba(255,255,255,.12)] text-white border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]" : "btn-outline"}`}
            >
              <IconPiP />
              {isPiP ? "Exit PiP" : "PiP"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void leaveMedia()}
            className={`btn btn-sm ${dark ? "rounded-full px-4 bg-[rgba(220,50,50,.55)] text-white border-[rgba(220,50,50,.4)] hover:bg-[rgba(220,50,50,.75)]" : "btn-outline"}`}
          >
            Leave
          </button>
        </>
      )}
    </div>
  );

  // ── EXPANDED layout ────────────────────────────────────────────────────────
  if (isExpanded) {
    return (
      <section className="glass flex h-full flex-col overflow-hidden rounded-2xl">
        {/* Hidden video element for PiP — 0-size, always playing local camera */}
        <video
          ref={pipVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
        />

        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
          <div>
            <div className="text-[0.94rem] font-semibold text-[var(--brand-strong)]">
              Media Room
            </div>
            <div className="text-[0.76rem] soft-copy">
              {isInSession
                ? `${participants.length} participant${participants.length === 1 ? "" : "s"}${screenShareEnabled ? " · Sharing screen" : ""}${pinnedIdentity ? " · Pinned" : ""}`
                : "Join voice and video for the workspace"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pinnedIdentity && (
              <button
                type="button"
                onClick={() => setPinnedIdentity(null)}
                className="flex items-center gap-1.5 rounded-full border border-[rgba(13,91,215,.35)] bg-[rgba(13,91,215,.1)] px-2.5 py-1 text-[0.72rem] font-medium text-[#13489a] hover:bg-[rgba(13,91,215,.18)] transition-colors"
              >
                <IconPin filled /> Unpin
              </button>
            )}
            <span className="rounded-full border border-[rgba(13,91,215,.28)] bg-[rgba(13,91,215,.1)] px-2.5 py-1 text-[0.72rem] text-[#13489a]">
              {status}
            </span>
          </div>
        </div>

        <RaisedHandBanner tiles={cameraTiles} raisedHands={raisedHands} />

        {/* ── Adaptive layout ── */}
        {anyScreen ? (
          <>
            {/* Multi-screenshare tabs */}
            {screenTiles.length > 1 && (
              <div
                className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-subtle)] px-4 pt-2 pb-0"
                style={{ scrollbarWidth: "none" }}
              >
                {screenTiles.map((tile) => {
                  const name =
                    tile.participant.name ||
                    `User ${tile.identity.slice(0, 6)}`;
                  const active = tile.identity === spotlightSharerIdentity;
                  return (
                    <button
                      key={tile.identity}
                      type="button"
                      onClick={() => setSpotlightSharerIdentity(tile.identity)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-[0.75rem] font-medium transition-colors ${active ? "border-[var(--brand)] text-[var(--brand-strong)]" : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink-base)]"}`}
                    >
                      <IconScreen />
                      {tile.isLocal ? "Your screen" : `${name}'s screen`}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Screen spotlight */}
            <div className="relative min-h-0 flex-1 overflow-hidden p-4 pb-2">
              {spotlightTile && (
                <ScreenShareSpotlightTile
                  key={`spot-${spotlightTile.identity}`}
                  {...spotlightTile}
                />
              )}
            </div>
            {/* Camera thumbnail strip */}
            {cameraTiles.length > 0 && (
              <div
                className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3"
                style={{ height: "120px", scrollbarWidth: "thin" }}
              >
                {cameraTiles.map((tile) => (
                  <CameraThumbnailTile
                    key={`thumb-${tile.identity}`}
                    {...tile}
                    isSpeaking={activeSpeakers.includes(tile.identity)}
                    isHandRaised={raisedHands.has(tile.identity)}
                    isPinned={tile.identity === pinnedIdentity}
                    reactions={reactionsFor(tile.identity)}
                    onPinToggle={togglePin}
                  />
                ))}
              </div>
            )}
          </>
        ) : showPinSpotlight ? (
          // ── Pinned camera spotlight ───────────────────────────────────────
          <>
            <div className="relative min-h-0 flex-1 overflow-hidden p-4 pb-2">
              <ParticipantTile
                key={`pin-spot-${pinnedTile!.identity}`}
                {...pinnedTile!}
                expanded
                isSpeaking={activeSpeakers.includes(pinnedTile!.identity)}
                isHandRaised={raisedHands.has(pinnedTile!.identity)}
                isPinned
                reactions={reactionsFor(pinnedTile!.identity)}
                onPinToggle={togglePin}
              />
            </div>
            {cameraTiles.length > 1 && (
              <div
                className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3"
                style={{ height: "120px", scrollbarWidth: "thin" }}
              >
                {cameraTiles
                  .filter((t) => t.identity !== pinnedIdentity)
                  .map((tile) => (
                    <CameraThumbnailTile
                      key={`thumb-${tile.identity}`}
                      {...tile}
                      isSpeaking={activeSpeakers.includes(tile.identity)}
                      isHandRaised={raisedHands.has(tile.identity)}
                      isPinned={false}
                      reactions={reactionsFor(tile.identity)}
                      onPinToggle={togglePin}
                    />
                  ))}
              </div>
            )}
          </>
        ) : (
          // ── Equal grid ───────────────────────────────────────────────────
          <div className="relative min-h-0 flex-1 overflow-hidden p-4">
            {cameraTiles.length > 0 ? (
              <div
                className="grid h-full gap-3"
                style={{ gridTemplateColumns: gridCols(cameraTiles.length) }}
              >
                {cameraTiles.map((tile) => (
                  <ParticipantTile
                    key={tile.identity}
                    {...tile}
                    expanded
                    isSpeaking={activeSpeakers.includes(tile.identity)}
                    isHandRaised={raisedHands.has(tile.identity)}
                    isPinned={tile.identity === pinnedIdentity}
                    reactions={reactionsFor(tile.identity)}
                    onPinToggle={togglePin}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--ink-soft)]">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="opacity-20"
                >
                  <path d="M2 6a2 2 0 012-2h8a2 2 0 012 2v2l4-2v8l-4-2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <div className="text-[0.9rem]">
                  {isInSession
                    ? "No video participants yet."
                    : "Join to see participants."}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Participants bar */}
        {isInSession && cameraTiles.length > 0 && (
          <div className="shrink-0 border-t border-[var(--border-subtle)] px-5 py-2">
            <ParticipantsBar
              tiles={cameraTiles}
              raisedHands={raisedHands}
              activeSpeakers={activeSpeakers}
            />
          </div>
        )}

        {/* Controls */}
        <div className="shrink-0 border-t border-[var(--border-subtle)] px-5 py-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {renderControlsBar()}
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

  // ── SIDEBAR / COMPACT layout ───────────────────────────────────────────────
  return (
    <section className="glass flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-[20px]">
      {/* Hidden video for PiP */}
      <video
        ref={pipVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(13,91,215,.12)] text-[var(--brand)]">
            <IconVideo />
          </span>
          <span className="panel-header-title">Media</span>
        </div>
        <div className="flex items-center gap-1.5">
          {status === "connected" && (
            <>
              {videoEnabled && (
                <span className="status-pill status-pill-blue">Camera</span>
              )}
              {audioEnabled && (
                <span className="status-pill status-pill-green">Mic</span>
              )}
              {localHandRaised && (
                <span
                  className="status-pill"
                  style={{
                    background: "rgba(234,179,8,.12)",
                    borderColor: "rgba(234,179,8,.35)",
                    color: "#92400e",
                  }}
                >
                  ✋
                </span>
              )}
              {pinnedIdentity && (
                <button
                  type="button"
                  onClick={() => setPinnedIdentity(null)}
                  className="status-pill"
                  style={{
                    background: "rgba(13,91,215,.1)",
                    borderColor: "rgba(13,91,215,.28)",
                    color: "#13489a",
                    cursor: "pointer",
                  }}
                >
                  📌 Unpin
                </button>
              )}
            </>
          )}
          <span
            className={`status-pill ${status === "connected" ? "status-pill-green" : status === "joining" || status === "reconnecting" ? "status-pill-blue" : "status-pill-red"}`}
          >
            {status === "connected"
              ? "Live"
              : status === "joining"
                ? "Joining…"
                : status === "reconnecting"
                  ? "Reconnecting…"
                  : "Idle"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
        <RaisedHandBanner tiles={cameraTiles} raisedHands={raisedHands} />

        {/* Multi-screenshare tabs (compact) */}
        {screenTiles.length > 1 && (
          <div
            className="flex gap-1 overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {screenTiles.map((tile) => {
              const name =
                tile.participant.name || `User ${tile.identity.slice(0, 6)}`;
              const active = tile.identity === spotlightSharerIdentity;
              return (
                <button
                  key={tile.identity}
                  type="button"
                  onClick={() => setSpotlightSharerIdentity(tile.identity)}
                  className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[0.68rem] font-medium transition-colors ${active ? "border-[rgba(13,91,215,.4)] bg-[rgba(13,91,215,.12)] text-[var(--brand-strong)]" : "border-[var(--border-subtle)] text-[var(--ink-soft)]"}`}
                >
                  <IconScreen />
                  {tile.isLocal ? "You" : name}
                </button>
              );
            })}
          </div>
        )}

        {spotlightTile && (
          <ScreenShareTile
            key={`screen-${spotlightTile.identity}`}
            {...spotlightTile}
          />
        )}

        {/* Camera grid */}
        <div
          className={`grid gap-2 ${anyScreen ? "grid-cols-3" : cameraTiles.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
        >
          {cameraTiles.length > 0 ? (
            // Pinned tile first
            [...cameraTiles]
              .sort((a) => (a.identity === pinnedIdentity ? -1 : 0))
              .map((tile) => (
                <ParticipantTile
                  key={tile.identity}
                  {...tile}
                  isSpeaking={activeSpeakers.includes(tile.identity)}
                  isHandRaised={raisedHands.has(tile.identity)}
                  isPinned={tile.identity === pinnedIdentity}
                  reactions={reactionsFor(tile.identity)}
                  onPinToggle={togglePin}
                />
              ))
          ) : (
            <div className="col-span-2 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[rgba(26,26,26,.18)] bg-[rgba(255,250,241,.56)] py-8 text-[var(--ink-soft)]">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.3"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              <span className="text-[0.8rem]">
                {isInSession
                  ? "No video participants yet."
                  : "Join to see participants."}
              </span>
            </div>
          )}
        </div>

        {isInSession && cameraTiles.length > 0 && (
          <ParticipantsBar
            tiles={cameraTiles}
            raisedHands={raisedHands}
            activeSpeakers={activeSpeakers}
          />
        )}
        {renderControlsBar()}
        {error && (
          <div className="rounded-xl border border-[rgba(172,56,48,.24)] bg-[rgba(172,56,48,.12)] px-3 py-2 text-[0.78rem] text-[#8c2317]">
            {error}
          </div>
        )}
      </div>

      {/* PiP content rendered by pipRootRef.current.render() in sync useEffect */}
    </section>
  );
}

// ─── PiP Carousel Content ─────────────────────────────────────────────────────
// Rendered inside the Document PiP window by createRoot().render().
// Must be a real React component — works in a different browsing context.

function PipCarouselContent({
  screenTiles,
  cameraTiles,
  activeSpeakers,
  raisedHands,
  reactions,
  pipViewIndex,
  setPipViewIndex,
  pipPinnedKey,
  setPipPinnedKey,
}: {
  screenTiles: TileParticipant[];
  cameraTiles: TileParticipant[];
  activeSpeakers: string[];
  raisedHands: Set<string>;
  reactions: ReactionEvent[];
  pipViewIndex: number;
  setPipViewIndex: React.Dispatch<React.SetStateAction<number>>;
  pipPinnedKey: string | null;
  setPipPinnedKey: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  type PipView = {
    kind: "screen" | "camera";
    tile: TileParticipant;
    key: string;
  };

  const allViews: PipView[] = [
    ...screenTiles.map((t) => ({
      kind: "screen" as const,
      tile: t,
      key: `screen:${t.identity}`,
    })),
    ...cameraTiles.map((t) => ({
      kind: "camera" as const,
      tile: t,
      key: `camera:${t.identity}`,
    })),
  ];

  const sortedViews = pipPinnedKey
    ? [
        ...allViews.filter((v) => v.key === pipPinnedKey),
        ...allViews.filter((v) => v.key !== pipPinnedKey),
      ]
    : allViews;

  const total = sortedViews.length;
  const safeIdx = Math.min(pipViewIndex, Math.max(0, total - 1));
  const currentView = sortedViews[safeIdx] ?? null;
  const isPinned = currentView !== null && currentView.key === pipPinnedKey;

  const reactionList = (id: string) =>
    reactions.filter((r) => r.identity === id);

  const onTogglePin = (key: string) =>
    setPipPinnedKey((prev) => {
      if (prev === key) return null;
      setPipViewIndex(0);
      return key;
    });

  const arrowSty = (
    enabled: boolean,
    side: "left" | "right",
  ): React.CSSProperties => ({
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 5,
    width: 28,
    height: 44,
    border: "none",
    borderRadius: 8,
    cursor: enabled ? "pointer" : "default",
    background: enabled ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.04)",
    color: enabled ? "white" : "rgba(255,255,255,.1)",
    fontSize: "1rem",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(4px)",
    zIndex: 20,
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#141414",
        overflow: "hidden",
      }}
    >
      {/* Current view fills the entire window */}
      <div style={{ position: "absolute", inset: 0 }}>
        {currentView?.kind === "screen" ? (
          <PipScreenShareTile
            key={currentView.key}
            participant={currentView.tile.participant}
            identity={currentView.tile.identity}
            isLocal={currentView.tile.isLocal}
          />
        ) : currentView?.kind === "camera" ? (
          <PipTileInner
            key={currentView.key}
            participant={currentView.tile.participant}
            identity={currentView.tile.identity}
            isLocal={currentView.tile.isLocal}
            isSpeaking={activeSpeakers.includes(currentView.tile.identity)}
            isHandRaised={raisedHands.has(currentView.tile.identity)}
            reactions={reactionList(currentView.tile.identity)}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,.3)",
              fontSize: "0.82rem",
            }}
          >
            No participants yet
          </div>
        )}
      </div>

      {/* Top bar: pin button + slide counter */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "7px 9px",
          background: "linear-gradient(to bottom,rgba(0,0,0,.55),transparent)",
          pointerEvents: "none",
        }}
      >
        {currentView && (
          <button
            onClick={() => onTogglePin(currentView.key)}
            style={{
              pointerEvents: "all",
              border: "none",
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: "0.62rem",
              fontWeight: 700,
              cursor: "pointer",
              background: isPinned
                ? "rgba(13,91,215,.85)"
                : "rgba(255,255,255,.18)",
              color: "white",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {isPinned ? "📌 Unpin" : "Pin"}
          </button>
        )}
        {total > 1 && (
          <span
            style={{
              color: "rgba(255,255,255,.75)",
              fontSize: "0.62rem",
              fontWeight: 600,
              background: "rgba(0,0,0,.35)",
              borderRadius: 999,
              padding: "2px 8px",
              pointerEvents: "none",
            }}
          >
            {safeIdx + 1} / {total}
          </span>
        )}
      </div>

      {/* Nav arrows */}
      {total > 1 && (
        <button
          onClick={() => setPipViewIndex((i) => Math.max(0, i - 1))}
          disabled={safeIdx === 0}
          style={arrowSty(safeIdx > 0, "left")}
        >
          &#8249;
        </button>
      )}
      {total > 1 && (
        <button
          onClick={() => setPipViewIndex((i) => Math.min(total - 1, i + 1))}
          disabled={safeIdx >= total - 1}
          style={arrowSty(safeIdx < total - 1, "right")}
        >
          &#8250;
        </button>
      )}

      {/* Dot indicators */}
      {total > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 7,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 4,
            zIndex: 20,
          }}
        >
          {sortedViews.map((v, i) => (
            <button
              key={v.key}
              onClick={() => setPipViewIndex(i)}
              style={{
                width: i === safeIdx ? 16 : 6,
                height: 6,
                border: "none",
                borderRadius: 999,
                background: i === safeIdx ? "white" : "rgba(255,255,255,.35)",
                cursor: "pointer",
                padding: 0,
                transition: "width 200ms",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Lightweight tile for Document PiP window ─────────────────────────────────
// Separate component: the PiP window is a different document context.

function PipTileInner({
  participant,
  identity,
  isLocal,
  isSpeaking,
  isHandRaised,
  reactions = [],
}: {
  participant: Participant;
  identity: string;
  isLocal: boolean;
  isSpeaking?: boolean;
  isHandRaised?: boolean;
  reactions?: ReactionEvent[];
}) {
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
    const el = videoRef.current;
    const pub = getParticipantCameraPublication(participant);
    const track = pub?.videoTrack ?? pub?.track;
    if (!el || !track || track.kind !== "video" || track.isMuted) {
      setHasVideo(false);
      return;
    }
    track.attach(el);
    setHasVideo(true);
    return () => {
      track.detach(el);
      setHasVideo(false);
    };
  }, [participant, version]);

  const name = participant.name || `User ${identity.slice(0, 6)}`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "80px",
        borderRadius: "10px",
        overflow: "hidden",
        border: isSpeaking
          ? "2px solid rgba(34,197,94,.8)"
          : "2px solid transparent",
        boxSizing: "border-box",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: hasVideo ? "block" : "none",
          background: "#111",
        }}
      />
      {!hasVideo && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(135deg,rgba(13,91,215,.25),rgba(47,99,64,.18))",
          }}
        >
          <span style={{ color: "white", fontWeight: 700, fontSize: "1.1rem" }}>
            {initialsFromName(name)}
          </span>
        </div>
      )}
      {isHandRaised && (
        <div
          style={{ position: "absolute", right: 4, top: 4, fontSize: "1.1rem" }}
        >
          ✋
        </div>
      )}
      {reactions.map((r) => (
        <span
          key={r.id}
          className="media-reaction-bubble"
          style={{ fontSize: "1.4rem", bottom: "28px" }}
        >
          {r.emoji}
        </span>
      ))}
      {/* Label */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top,rgba(0,0,0,.75),transparent)",
          padding: "16px 8px 6px",
          color: "white",
          fontSize: "0.68rem",
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {isLocal ? `${name} (You)` : name}
        {!participant.isMicrophoneEnabled && " 🔇"}
      </div>
    </div>
  );
}

// ─── Screen share tile for Document PiP window ───────────────────────────────

function PipScreenShareTile({
  participant,
  identity,
  isLocal,
}: {
  participant: Participant;
  identity: string;
  isLocal: boolean;
}) {
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
    const el = videoRef.current;
    const pub = getParticipantScreenSharePublication(participant);
    const track = pub?.videoTrack ?? pub?.track;
    if (!el || !track || track.kind !== "video") {
      setHasVideo(false);
      return;
    }
    track.attach(el);
    setHasVideo(true);
    return () => {
      track.detach(el);
      setHasVideo(false);
    };
  }, [participant, version]);

  const name = participant.name || `User ${identity.slice(0, 6)}`;
  const label = isLocal ? "You are presenting" : `${name} is presenting`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#0a0a0a",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: hasVideo ? "block" : "none",
        }}
      />
      {!hasVideo && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,.4)",
            fontSize: "0.8rem",
          }}
        >
          Loading screen…
        </div>
      )}
      {/* "Presenting" badge */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          display: "flex",
          alignItems: "center",
          gap: "5px",
          background: "rgba(13,91,215,.75)",
          backdropFilter: "blur(6px)",
          borderRadius: "999px",
          padding: "3px 10px 3px 7px",
          color: "white",
          fontSize: "0.65rem",
          fontWeight: 600,
        }}
      >
        {/* Screen icon */}
        <svg width="11" height="11" viewBox="0 0 20 20" fill="white">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v8h10V5H5zM8 17h4v-2H8v2z" />
        </svg>
        {label}
      </div>
    </div>
  );
}
