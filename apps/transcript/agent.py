import os
import asyncio
from typing import Any

import httpx
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
    RoomOutputOptions,
    WorkerOptions,
    cli,
)
from livekit.plugins import deepgram

load_dotenv()

AGENT_NAME = os.getenv("TRANSCRIPTION_AGENT_NAME", "transcriber")
PERSIST_TIMEOUT_SECONDS = 15
PERSIST_MAX_RETRIES = 3
PERSIST_RETRY_BASE_DELAY_SECONDS = 0.75


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _normalize_stt_model(raw: str | None) -> str:
    model = (raw or "nova-3").strip()
    if model.lower().startswith("deepgram/"):
        return model.split("/", 1)[1] or "nova-3"
    return model


def _to_ms(value: Any) -> int:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0

    if parsed <= 0:
        return 0

    # LiveKit events may emit timestamps in seconds. Convert fractional values to ms.
    if abs(parsed - round(parsed)) > 1e-6:
        return int(parsed * 1000)

    # Preserve integer milliseconds when they are clearly in ms, otherwise treat small ints as seconds.
    if parsed >= 1000:
        return int(parsed)

    return int(parsed * 1000)


def _extract_text(transcript: Any) -> str:
    direct = getattr(transcript, "transcript", None) or getattr(transcript, "text", None)
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    segments = getattr(transcript, "segments", None)
    if isinstance(segments, list):
        parts = []
        for seg in segments:
            seg_text = getattr(seg, "text", None)
            if isinstance(seg_text, str) and seg_text.strip():
                parts.append(seg_text.strip())
        if parts:
            return " ".join(parts).strip()

    alternatives = getattr(transcript, "alternatives", None)
    if isinstance(alternatives, list) and alternatives:
        first = alternatives[0]
        alt_text = getattr(first, "text", None) if first is not None else None
        if isinstance(alt_text, str) and alt_text.strip():
            return alt_text.strip()

    return ""


def _extract_identity(transcript: Any) -> str:
    candidate = (
        getattr(transcript, "participant_identity", None)
        or getattr(transcript, "transcribed_participant_identity", None)
        or getattr(transcript, "identity", None)
    )
    if isinstance(candidate, str) and candidate.strip():
        return candidate.strip()
    return "unknown"


def _is_final(transcript: Any) -> bool:
    if bool(getattr(transcript, "is_final", False)):
        return True
    if bool(getattr(transcript, "final", False)):
        return True

    segments = getattr(transcript, "segments", None)
    if isinstance(segments, list) and segments:
        return any(bool(getattr(seg, "final", False)) for seg in segments)

    return False


async def _persist_transcript(
    backend_url: str,
    internal_secret: str,
    payload: dict[str, Any],
) -> None:
    last_error: Exception | None = None

    for attempt in range(1, PERSIST_MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=PERSIST_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    f"{backend_url.rstrip('/')}/api/internal/transcript",
                    json=payload,
                    headers={"Authorization": f"Bearer {internal_secret}"},
                )
                response.raise_for_status()
            return
        except Exception as error:
            last_error = error
            if attempt >= PERSIST_MAX_RETRIES:
                break
            await asyncio.sleep(PERSIST_RETRY_BASE_DELAY_SECONDS * attempt)

    print(f"[transcript:persist:error] {last_error}")


async def entrypoint(ctx: JobContext):
    backend_url = _required_env("HTTP_BACKEND_URL")
    internal_secret = _required_env("INTERNAL_SECRET")
    stt_model = _normalize_stt_model(os.getenv("LIVEKIT_STT_MODEL", "nova-3"))

    print(
        f"[transcript:init] agent={AGENT_NAME} stt_model={stt_model} backend={backend_url.rstrip('/')}"
    )

    await ctx.connect()
    session = AgentSession(
        stt=deepgram.STT(
            model=stt_model,
        ),
    )

    @session.on("user_input_transcribed")
    def on_transcript(transcript):
        if not _is_final(transcript):
            return

        participant_identity = _extract_identity(transcript)
        text = _extract_text(transcript)
        if not text.strip():
            print(f"[transcript:skip] empty text payload={transcript!r}")
            return

        start_ms = _to_ms(getattr(transcript, "start_time", 0))
        end_ms = _to_ms(getattr(transcript, "end_time", start_ms))

        payload = {
            "roomId": ctx.room.name,
            "participantIdentity": participant_identity,
            "text": text.strip(),
            "startMs": start_ms,
            "endMs": max(start_ms, end_ms),
        }
        print(
            f"[transcript] room={ctx.room.name} speaker={participant_identity} "
            f"startMs={payload['startMs']} endMs={payload['endMs']} text={payload['text']}"
        )

        async def persist():
            await _persist_transcript(backend_url, internal_secret, payload)

        asyncio.create_task(persist())

    await session.start(
        agent=Agent(
            instructions="You are a transcription-only assistant. Do not speak or generate replies.",
        ),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            audio_enabled=True,
            video_enabled=False,
            text_enabled=False,
        ),
        room_output_options=RoomOutputOptions(
            transcription_enabled=True,
            sync_transcription=True,
        ),
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=AGENT_NAME,
        )
    )
