# Pencil.io

Jai Gurudev

Pencil.io is a real-time collaborative learning and creation platform where participants can draw, chat, and have full video conferencing at the same time. Multiple users join shared rooms to collaborate on a live canvas, communicate via chat, and talk face-to-face with a feature-rich media layer comparable to Zoom and Google Meet.

---

## What This App Does

- **Live collaborative canvas** — draw, annotate, add shapes, arrows, sticky notes and images; all synced in real time across every participant
- **Real-time chat** — room-wide messaging with presence indicators
- **Full-featured video conferencing** — camera, microphone, screen sharing, and advanced interaction tools (see Media Features below)
- **Event-driven backend** — reliable multi-user sync through a distributed message queue  
- **AI-assisted context** — transcript and summarisation support during live sessions

---

## Media / Video Features

The media layer is built on LiveKit and supports a full Zoom/Meet-comparable feature set:

| Feature | Details |
|---|---|
| **Active speaker highlight** | Speaking participants get a pulsing green ring on their tile in real time |
| **Raise hand** | Data-channel signalling; hand badge appears on tile for all participants, auto-lowers after 60 s |
| **Emoji reactions** | Floating emoji animations (`floatUp` CSS keyframes) rendered above participant tiles |
| **Noise suppression** | Krisp AI noise filter (`@livekit/krisp-noise-filter`) toggled per-session |
| **Multi-screenshare** | Multiple presenters simultaneously; tab bar to switch the spotlight view |
| **Participant pin** | Hover any tile → pin button appears; pinned participant shown in full spotlight, others in thumbnail strip |
| **Picture-in-Picture** | Document PiP (Chrome 116+) or video PiP fallback; full carousel inside the PiP window |
| **PiP carousel** | ‹ › arrows + dot indicators navigate between screenshare and all camera tiles; Pin/Unpin inside PiP works independently for screenshares too |

---

## Architecture At A Glance

The system is split into two main backend services connected through an event-driven core.

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js Frontend                    │
│  Canvas (custom 2D engine)  │  Chat  │  Media (LiveKit) │
└──────────────────┬──────────────────────────────────────┘
                   │  HTTP + WebSocket
      ┌────────────┴────────────┐
      │                         │
┌─────┴──────┐        ┌────────┴────────┐
│ http-backend│        │  ws-backend     │
│ auth, rooms │        │  sockets, CRDT  │
│ media tokens│        │  canvas / chat  │
└─────┬──────┘        └────────┬────────┘
      │                         │
      └──────────┬──────────────┘
                 │
     ┌───────────┴───────────────┐
     │      Shared Infra         │
     │  RabbitMQ · Redis         │
     │  Postgres (Prisma)        │
     │  LiveKit (media server)   │
     └───────────────────────────┘
```

- **HTTP backend** — authentication, room APIs, LiveKit media token minting
- **WebSocket backend** — socket lifecycle, room presence, CRDT canvas sync, chat fan-out
- **RabbitMQ** — async event flow between services (email workers, replay, processing)
- **Redis** — pub/sub and fast cross-process coordination
- **Postgres + Prisma** — durable persistence and recoverability
- **LiveKit** — E2E-encrypted real-time media transport (audio/video/screenshare/data channels)

---

## Repository Layout

```text
apps/
  web/              # Next.js 16 frontend (App Router)
  http-backend/     # Express — auth, room/media token endpoints
  ws-backend/       # ws — realtime sockets, handlers, event routing

packages/
  auth/             # JWT / password helpers
  db/               # Prisma schema, migrations, db client
  redis/            # Shared Redis and pub/sub wrappers
  validation/       # Shared request/event validation schemas
  ui/               # Shared React UI components
  eslint-config/    # Lint rules
  typescript-config/
```

---

## Tech Stack

### Monorepo & Tooling
- **Turborepo** — task orchestration and caching
- **pnpm workspaces** — package management
- **TypeScript** — across all apps and packages
- **ESLint + Prettier** — code quality

### Frontend
- **Next.js 16** (App Router)
- **React 19**
- **Zustand** — client state management
- **TailwindCSS + PostCSS**
- **livekit-client** — media room SDK
- **@livekit/krisp-noise-filter** — AI noise suppression

### Backend
- **Node.js + TypeScript**
- **Express** (HTTP backend)
- **ws** (WebSocket backend)
- **amqplib** — RabbitMQ client
- **pino** — structured logging
- **jsonwebtoken** — auth token handling

### Data & Media
- **Prisma ORM + PostgreSQL** — persistence
- **LiveKit** — media server + client SDK
- **Redis** — pub/sub, ephemeral state

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- Docker and Docker Compose

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, RabbitMQ, and the local LiveKit server.

### 3. Run database migrations

```bash
cd packages/db && pnpm prisma migrate dev
```

### 4. Run all applications

```bash
pnpm run dev
```

Turborepo starts all apps concurrently:

| App | Default port |
|---|---|
| `web` (Next.js) | 3000 |
| `http-backend` | 3001 |
| `ws-backend` | 3003 |
| LiveKit (Docker) | 7880 |

### 5. Useful scripts

```bash
pnpm run build         # production build (all apps)
pnpm run lint          # lint all packages
pnpm run check-types   # TypeScript type-check all packages
pnpm run format        # Prettier format
```

---

## Environment Configuration

Copy `.env.example` to `.env.local` (web) and `.env` (backends) and fill in:

### Core (all backends)

```bash
NODE_ENV=development
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<db>
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
```

### LiveKit (http-backend + web)

```bash
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_TOKEN_TTL=2h
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

The HTTP backend mints short-lived media tokens after validating room membership. The frontend uses these tokens to connect directly to the LiveKit server — media streams never pass through the application backend.

### AI Service

```bash
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_SUMMARY_MODEL=gemini-2.5-flash-lite
GEMINI_EMBED_MODEL=text-embedding-004
```

The AI service uses Gemini for retrieval and summaries, with an Ollama fallback for generation if Gemini is unavailable.

---

## Realtime Flow (Simplified)

```
1. User action (canvas draw / chat message / media toggle) on frontend
2. Event sent to ws-backend over WebSocket
3. ws-backend normalises event → publishes to RabbitMQ
4. Consumer validates → writes to Postgres (durable state)
5. ws-backend broadcasts update to all room participants
6. Canvas CRDT reconciles concurrent edits deterministically
```

Media (audio/video) travels directly between clients via LiveKit's WebRTC transport — it is never routed through the application backend.

---

## Canvas Architecture

The canvas is a custom 2D engine built on the native HTML `<canvas>` API (no Fabric.js or Konva dependency):

- **Rendering** — a single `useEffect` runs a full redraw pass on every state change using a `drawAllRef` pattern; the ResizeObserver calls the same pass after any layout reflow so content is never lost when panels toggle
- **CRDT sync** — object state is held in a Zustand store; incoming WS events are merged with HLC timestamps for conflict-free resolution
- **Tools** — pan/zoom, pen, eraser, arrow, rectangle, ellipse, text (multi-line), sticky note, image upload

---

## CI/CD Expectations

**Continuous integration** should run on every pull request:

- `pnpm install` — dependency resolution
- `pnpm lint` — lint all packages
- `pnpm check-types` — TypeScript validation
- `pnpm build` — production build
- `prisma validate` — schema sanity check

**Continuous delivery**:

- Build and push Docker images per service
- Deploy to target environment
- Run health checks post-deploy
- Rollback automatically on failure

---

## Reliability Principles

- **Event-first** consistency — no direct write shortcuts that bypass the event queue
- **Replayability** — shared state can be reconstructed from the event log
- **Service isolation** — services communicate via queues, not direct calls
- **Observability by default** — structured logging with `pino`, errors always surfaced with context

---

## Notes For Contributors

- Never bypass the event flow for realtime features — always publish through RabbitMQ
- Keep canvas CRDT logic deterministic; test concurrent edits before merging
- Media features go in `apps/web/src/components/workspace/MediaPanel.tsx` and `apps/web/src/lib/livekit.ts`
- New environment variables must be documented here and added to `.env.example`
- Add TypeScript types for all new WS event payloads in the `validation` package
