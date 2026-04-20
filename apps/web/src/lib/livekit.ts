import {
  ConnectionState,
  Room,
  Track,
  type Participant,
  type TrackPublication,
} from "livekit-client";
import { api } from "./api";
import type { MediaParticipantSnapshot, MediaStatus } from "@/store/media.store";

type MediaTokenResponse = {
  token: string;
  url: string;
  roomName: string;
  roomLabel: string;
  identity: string;
  participantName: string;
};

function readTrackPublication(
  publications: Map<string, TrackPublication>,
  source: string,
) {
  for (const publication of publications.values()) {
    if (publication.source === source) {
      return publication;
    }
  }

  return null;
}

export function createMediaRoom() {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
  });
}

export async function requestMediaToken(roomId: string) {
  return api.post(`/api/v1/rooms/${roomId}/media/token`) as Promise<MediaTokenResponse>;
}

export function connectionStateToMediaStatus(state: ConnectionState): MediaStatus {
  if (state === ConnectionState.Connected) return "connected";
  if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
    return "reconnecting";
  }
  if (state === ConnectionState.Connecting) return "joining";
  return "disconnected";
}

export function getParticipantMediaSnapshot(
  participant: Participant,
  identity: string,
  isLocal: boolean,
): MediaParticipantSnapshot {
  return {
    identity,
    name: participant.name || `User ${identity.slice(0, 6)}`,
    isLocal,
    isCameraEnabled: participant.isCameraEnabled,
    isMicrophoneEnabled: participant.isMicrophoneEnabled,
    isScreenShareEnabled: participant.isScreenShareEnabled,
  };
}

export function snapshotRoomParticipants(room: Room): MediaParticipantSnapshot[] {
  const participants: MediaParticipantSnapshot[] = [
    getParticipantMediaSnapshot(room.localParticipant, room.localParticipant.identity, true),
  ];

  for (const [identity, participant] of room.remoteParticipants.entries()) {
    participants.push(getParticipantMediaSnapshot(participant, identity, false));
  }

  return participants;
}

export function getParticipantCameraPublication(participant: Participant) {
  return readTrackPublication(participant.videoTrackPublications, Track.Source.Camera);
}

export function getParticipantCameraTrack(participant: Participant) {
  const publication = getParticipantCameraPublication(participant);
  return publication?.videoTrack;
}

export function getParticipantScreenSharePublication(participant: Participant) {
  return readTrackPublication(participant.videoTrackPublications, Track.Source.ScreenShare);
}

export function getParticipantScreenShareTrack(participant: Participant) {
  const publication = getParticipantScreenSharePublication(participant);
  return publication?.videoTrack ?? publication?.track;
}
