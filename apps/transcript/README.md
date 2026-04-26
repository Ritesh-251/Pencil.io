# LiveKit Transcription Agent

## Do I need to run the Python module?

- Yes, if you want live transcription saved into `TranscriptSegment` and used by AI summary/query.
- No, if you only need canvas/chat features and not speech transcription.

The transcription worker is this Python process (`agent.py`).

## Run locally

```bash
cd apps/transcript
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python agent.py dev
```

## Recommended startup order

1. Start infra/services from repo root:

```bash
cd /Users/riteshhooda/Desktop/Pencil.io
docker compose up -d postgres redis rabbitmq livekit
pnpm --filter http-backend dev
pnpm --filter ws-backend dev
pnpm --filter ai-service dev
```

2. Start Python transcription worker in a separate terminal:

```bash
cd /Users/riteshhooda/Desktop/Pencil.io/apps/livekit-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python agent.py dev
```

## Required environment variables

```bash
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_STT_MODEL=deepgram/nova-3-general
DEEPGRAM_API_KEY=...
HTTP_BACKEND_URL=http://localhost:3001
INTERNAL_SECRET=...
```

## Troubleshoot transcription quickly

1. Check the agent logs while speaking in a room. You should see `[transcript] room=...` lines.
2. Validate ingestion API health:

```bash
curl -s -H "Authorization: Bearer $INTERNAL_SECRET" \
	"http://localhost:3001/api/internal/transcript/health?roomId=<ROOM_ID>" | jq
```

3. Send a manual test segment:

```bash
curl -i -X POST "http://localhost:3001/api/internal/transcript" \
	-H "Authorization: Bearer $INTERNAL_SECRET" \
	-H "Content-Type: application/json" \
	-d '{
		"roomId":"debug-room",
		"participantIdentity":"tester",
		"text":"hello transcript",
		"startMs":1000,
		"endMs":1500
	}'
```

4. Confirm DB persistence:

```bash
docker exec -it pencil-postgres psql -U ritesh -d pencil \
	-c 'SELECT "roomId", "participantIdentity", "text", "createdAt" FROM "TranscriptSegment" ORDER BY "createdAt" DESC LIMIT 10;'
```
