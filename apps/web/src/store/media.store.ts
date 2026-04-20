import { create } from "zustand";

export type MediaStatus =
  | "idle"
  | "joining"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type MediaParticipantSnapshot = {
  identity: string;
  name: string;
  isLocal: boolean;
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  isScreenShareEnabled: boolean;
};

interface MediaState {
  status: MediaStatus;
  error: string | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  participants: MediaParticipantSnapshot[];
  setStatus: (status: MediaStatus) => void;
  setError: (error: string | null) => void;
  setDevices: (input: { audioEnabled: boolean; videoEnabled: boolean; screenShareEnabled: boolean }) => void;
  setParticipants: (participants: MediaParticipantSnapshot[]) => void;
  reset: () => void;
}

const initialState = {
  status: "idle" as MediaStatus,
  error: null,
  audioEnabled: false,
  videoEnabled: false,
  screenShareEnabled: false,
  participants: [] as MediaParticipantSnapshot[],
};

export const useMediaStore = create<MediaState>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setDevices: ({ audioEnabled, videoEnabled, screenShareEnabled }) => set({ audioEnabled, videoEnabled, screenShareEnabled }),
  setParticipants: (participants) => set({ participants }),
  reset: () => set(initialState),
}));
