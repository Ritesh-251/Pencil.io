import { prisma } from "@repo/db";
import { AccessToken } from "livekit-server-sdk";
import { randomUUID } from "crypto";
import { ApiError } from "../utils/ApiError";

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

  return {
    token: await accessToken.toJwt(),
    url: livekitUrl,
    roomName: roomMember.room.id,
    roomLabel: roomMember.room.name ?? "Untitled Room",
    identity: mediaIdentity,
    participantName,
  };
}
