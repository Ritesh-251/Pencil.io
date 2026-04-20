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

/** A single ephemeral reaction bubble shown on a participant tile. */
export type ReactionEvent = {
  id: string;       // unique per bubble so React keys work
  identity: string; // sender's LiveKit identity
  emoji: string;
  at: number;       // Date.now() — used to auto-expire
};

interface MediaState {
  status: MediaStatus;
  error: string | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  noiseSuppression: boolean;
  participants: MediaParticipantSnapshot[];

  /** Identities of participants currently speaking (loudest first). */
  activeSpeakers: string[];
  /** Identities of participants with a raised hand. */
  raisedHands: Set<string>;
  /** Live reaction bubbles; pruned automatically. */
  reactions: ReactionEvent[];

  setStatus: (status: MediaStatus) => void;
  setError: (error: string | null) => void;
  setDevices: (input: { audioEnabled: boolean; videoEnabled: boolean; screenShareEnabled: boolean }) => void;
  setNoiseSuppression: (enabled: boolean) => void;
  setParticipants: (participants: MediaParticipantSnapshot[]) => void;
  setActiveSpeakers: (identities: string[]) => void;
  setRaisedHand: (identity: string, raised: boolean) => void;
  addReaction: (reaction: ReactionEvent) => void;
  pruneReactions: (before: number) => void;
  reset: () => void;
}

const initialState = {
  status: "idle" as MediaStatus,
  error: null,
  audioEnabled: false,
  videoEnabled: false,
  screenShareEnabled: false,
  noiseSuppression: false,
  participants: [] as MediaParticipantSnapshot[],
  activeSpeakers: [] as string[],
  raisedHands: new Set<string>(),
  reactions: [] as ReactionEvent[],
};

export const useMediaStore = create<MediaState>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setDevices: ({ audioEnabled, videoEnabled, screenShareEnabled }) =>
    set({ audioEnabled, videoEnabled, screenShareEnabled }),
  setNoiseSuppression: (noiseSuppression) => set({ noiseSuppression }),
  setParticipants: (participants) => set({ participants }),
  setActiveSpeakers: (identities) => set({ activeSpeakers: identities }),
  setRaisedHand: (identity, raised) =>
    set((s) => {
      const next = new Set(s.raisedHands);
      if (raised) next.add(identity);
      else next.delete(identity);
      return { raisedHands: next };
    }),
  addReaction: (reaction) =>
    set((s) => ({ reactions: [...s.reactions, reaction] })),
  pruneReactions: (before) =>
    set((s) => ({ reactions: s.reactions.filter((r) => r.at >= before) })),
  reset: () => set({ ...initialState, raisedHands: new Set<string>(), reactions: [] }),
}));
