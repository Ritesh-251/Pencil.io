import { prisma } from "@repo/db";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { randomUUID } from "crypto";
import { ApiError } from "../utils/ApiError";
import { logger } from "../infra/logger";

const DEFAULT_MEDIA_TOKEN_TTL = "2h";

type CreateMediaTokenInput = {
  roomId: string;
  userId: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new ApiError(500, `${name} is not configured`);
  }

  return value;
}

function buildParticipantName(email: string | null | undefined, userId: string) {
  if (email && email.includes("@")) {
    return email.split("@")[0] || `user-${userId.slice(0, 8)}`;
  }

  return `user-${userId.slice(0, 8)}`;
}

function toHttpLivekitHost(livekitUrl: string) {
  try {
    const parsed = new URL(livekitUrl);
    if (parsed.protocol === "ws:") parsed.protocol = "http:";
    if (parsed.protocol === "wss:") parsed.protocol = "https:";
    let host = parsed.toString();
    if (host.endsWith("/")) host = host.slice(0, -1);
    return host;
  } catch {
    return livekitUrl;
  }
}

export async function ensureTranscriptionAgentDispatch(input: {
  roomId: string;
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
}) {
  const agentName = process.env.TRANSCRIPTION_AGENT_NAME || "transcriber";
  const host = toHttpLivekitHost(input.livekitUrl);
  const client = new AgentDispatchClient(host, input.apiKey, input.apiSecret);

  logger.info({ roomId: input.roomId, host, agentName }, "Ensuring transcription dispatch");

  let existing;
  try {
    existing = await client.listDispatch(input.roomId);
  } catch (error) {
    logger.error({ err: error, roomId: input.roomId }, "Failed to list transcription dispatches");
    throw error;
  }

  // Remove existing dispatches for this agent to force a fresh join attempt
  const ourDispatches = existing.filter(
    (dispatch) => (dispatch.agentName || "").trim() === agentName || !(dispatch.agentName || "").trim(),
  );
  for (const dispatch of ourDispatches) {
    try {
      await client.deleteDispatch(dispatch.id, input.roomId);
      logger.info({
        roomId: input.roomId,
        dispatchId: dispatch.id,
      }, "Cleared existing/stale transcription dispatch");
    } catch (error) {
      logger.warn({
        err: error,
        roomId: input.roomId,
        dispatchId: dispatch.id,
      }, "Failed to clear existing transcription dispatch");
    }
  }

  try {
    await client.createDispatch(input.roomId, agentName, {
      metadata: JSON.stringify({ source: "media-token", createdAt: new Date().toISOString() }),
    });
    logger.info({ roomId: input.roomId, agentName }, "Successfully created fresh transcription dispatch");
  } catch (error) {
    logger.error({ err: error, roomId: input.roomId, agentName }, "Failed to create transcription dispatch");
    throw error;
  }
}

export async function stopTranscriptionAgentDispatch(input: {
  roomId: string;
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
}) {
  const agentName = process.env.TRANSCRIPTION_AGENT_NAME || "transcriber";
  const host = toHttpLivekitHost(input.livekitUrl);
  const client = new AgentDispatchClient(host, input.apiKey, input.apiSecret);

  logger.info({ roomId: input.roomId, host, agentName }, "Stopping transcription dispatch");

  let existing;
  try {
    existing = await client.listDispatch(input.roomId);
  } catch (error) {
    logger.error({
      err: error,
      roomId: input.roomId,
    }, "Failed to list transcription dispatches during stop");
    throw error;
  }

  const ourDispatches = existing.filter(
    (dispatch) => (dispatch.agentName || "").trim() === agentName || !(dispatch.agentName || "").trim(),
  );

  for (const dispatch of ourDispatches) {
    try {
      await client.deleteDispatch(dispatch.id, input.roomId);
      logger.info({
        roomId: input.roomId,
        dispatchId: dispatch.id,
      }, "Stopped transcription dispatch");
    } catch (error) {
      logger.warn({
        err: error,
        roomId: input.roomId,
        dispatchId: dispatch.id,
      }, "Failed to stop transcription dispatch");
    }
  }

  return { stopped: ourDispatches.length };
}

export async function createMediaToken({ roomId, userId }: CreateMediaTokenInput) {
  const roomMember = await prisma.roomMember.findUnique({
    where: {
      userId_roomId: {
        userId,
        roomId,
      },
    },
    include: {
      room: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!roomMember) {
    throw new ApiError(403, "Not a member of this room");
  }

  const livekitUrl = getRequiredEnv("LIVEKIT_URL");
  const apiKey = getRequiredEnv("LIVEKIT_API_KEY");
  const apiSecret = getRequiredEnv("LIVEKIT_API_SECRET");
  const ttl = process.env.LIVEKIT_TOKEN_TTL || DEFAULT_MEDIA_TOKEN_TTL;
  const mediaIdentity = `${userId}:${randomUUID()}`;

  const participantName = buildParticipantName(roomMember.user.email, userId);
  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: mediaIdentity,
    name: participantName,
    ttl,
    metadata: JSON.stringify({
      roomId,
      userId,
      email: roomMember.user.email ?? null,
      role: roomMember.role,
    }),
    attributes: {
      roomId,
      userId,
      role: roomMember.role,
    },
  });

  accessToken.addGrant({
    roomJoin: true,
    room: roomMember.room.id,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  // Transcription agent dispatch removed from default join flow.
  // It should be triggered manually via a dedicated endpoint.

  return {
    token: await accessToken.toJwt(),
    url: livekitUrl,
    roomName: roomMember.room.id,
    roomLabel: roomMember.room.name ?? "Untitled Room",
    identity: mediaIdentity,
    participantName,
  };
}
