import os
import asyncio
import inspect
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
PUBLISH_MAX_RETRIES = 3
PUBLISH_RETRY_BASE_DELAY_SECONDS = 0.5

_http_client: httpx.AsyncClient | None = None
_http_client_lock = asyncio.Lock()


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


async def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    async with _http_client_lock:
      if _http_client is None:
          _http_client = httpx.AsyncClient(timeout=PERSIST_TIMEOUT_SECONDS)
      return _http_client


async def _close_http_client() -> None:
    global _http_client
    async with _http_client_lock:
        if _http_client is not None:
            await _http_client.aclose()
            _http_client = None


async def _persist_transcript(
    backend_url: str,
    internal_secret: str,
    payload: dict[str, Any],
) -> None:
    last_error: Exception | None = None

    for attempt in range(1, PERSIST_MAX_RETRIES + 1):
        try:
            client = await _get_http_client()
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
async def _publish_transcript_to_room(room: Any, participant_identity: str, text: str, start_ms: int, end_ms: int) -> bool:
    last_error: Exception | None = None

    for attempt in range(1, PUBLISH_MAX_RETRIES + 1):
        try:
            import livekit.rtc as rtc

            maybe_result = room.local_participant.publish_transcription(
                participant_identity=participant_identity,
                segments=[
                    rtc.TranscriptionSegment(
                        id=f"seg-{start_ms}-{participant_identity}",
                        text=text,
                        start_time=start_ms,
                        end_time=end_ms,
                        final=True,
                    )
                ],
            )
            if inspect.isawaitable(maybe_result):
                await maybe_result
            return True
        except Exception as error:
            last_error = error
            if attempt < PUBLISH_MAX_RETRIES:
                await asyncio.sleep(PUBLISH_RETRY_BASE_DELAY_SECONDS * attempt)

    print(f"[transcript:publish:error] {last_error}")
    return False


def _build_session(stt_model: str) -> AgentSession:
    try:
        return AgentSession(
            stt=deepgram.STT(
                model=stt_model,
            ),
        )
    except Exception as error:
        raise RuntimeError(
            f"Unsupported or invalid Deepgram STT model '{stt_model}'. "
            "Check LIVEKIT_STT_MODEL and confirm the API key has access to that model."
        ) from error


async def entrypoint(ctx: JobContext):
    backend_url = _required_env("HTTP_BACKEND_URL")
    internal_secret = _required_env("INTERNAL_SECRET")
    stt_model = _normalize_stt_model(os.getenv("LIVEKIT_STT_MODEL", "nova-3"))

    print(
        f"[transcript:init] agent={AGENT_NAME} stt_model={stt_model} backend={backend_url.rstrip('/')}"
    )

    await ctx.connect()
    session = _build_session(stt_model)

    @session.on("user_input_transcribed")
    def on_transcript(event: Any):
        # BUG-10 FIX: Use robust extraction helpers to handle different LiveKit event formats.
        text = _extract_text(event)
        if not text:
            return

        participant_identity = _extract_identity(event)
        
        # We only persist and broadcast FINAL transcripts to avoid noise/duplicates
        if not _is_final(event):
            return

        start_ms = _to_ms(getattr(event, "start_time", 0))
        end_ms = _to_ms(getattr(event, "end_time", start_ms))

        payload = {
            "roomId": ctx.room.name,
            "participantIdentity": participant_identity,
            "text": text,
            "startMs": start_ms,
            "endMs": max(start_ms, end_ms),
        }

        print(
            f"[transcript] room={ctx.room.name} speaker={participant_identity} "
            f"startMs={payload['startMs']} endMs={payload['endMs']} text={payload['text']}"
        )

        async def publish_then_persist():
            published = await _publish_transcript_to_room(
                ctx.room,
                participant_identity,
                text,
                start_ms,
                payload["endMs"],
            )
            if not published:
                return
            await _persist_transcript(backend_url, internal_secret, payload)

        asyncio.create_task(publish_then_persist())

    try:
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
    except Exception as error:
        raise RuntimeError(
            f"Failed to initialize transcription session for model '{stt_model}'. "
            "Verify the Deepgram model is supported by the API key."
        ) from error


if __name__ == "__main__":
    try:
        cli.run_app(
            WorkerOptions(
                entrypoint_fnc=entrypoint,
                agent_name=AGENT_NAME,
            )
        )
    finally:
        try:
            asyncio.run(_close_http_client())
        except RuntimeError:
            pass
