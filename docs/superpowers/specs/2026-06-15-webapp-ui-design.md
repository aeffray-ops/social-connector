# social-connector — Web App UI — Design

Date: 2026-06-15
Status: Approved design (pending written-spec review)

## Goal

A local web UI that exposes the whole `social-connector` library. Headline
feature: **broadcast** — compose one message and send it to several providers
(Facebook, LinkedIn, WhatsApp) at once. The UI also exposes per-provider
session status + login, reading (WhatsApp groups/chats/conversations,
Facebook/LinkedIn own posts), and the natural-language AI agent.

## Runtime model

- **Local, single-user.** The server runs on the user's machine because the
  library drives Chromium with the on-disk persistent profiles
  (`.fb-profile`, `.wa-profile`, `.li-profile`). Login opens a real Chromium
  window on that machine.
- **No authentication.** Bound to `127.0.0.1` only. This is a personal tool;
  exposing it on a network would expose logged-in social accounts, so the
  server refuses non-loopback binds.
- Reuses the library's existing env config: `USER_DATA_DIR`, `HEADLESS`,
  `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `AI_PROVIDER`, `CACHE_PASSPHRASE`.

## Repo layout

```
app/
  server/          Node + Express backend
    package.json   deps: express; "social-connector": "file:../.."
    src/
      index.ts             Express app: REST routes + SSE, static web in prod
      ConnectorManager.ts  hybrid per-provider connector pool (approach C)
      events.ts            in-memory run registry + SSE hub
      routes/
        providers.ts       status + login
        broadcast.ts       parallel multi-provider send
        read.ts            groups / chats / conversation / posts
        ai.ts              agent loop over SSE + confirm gate
  web/             Vite + React SPA
    package.json   deps: react, react-dom; dev: vite
    vite.config.ts proxy /api -> server in dev
    src/
      App.tsx, main.tsx
      api.ts            fetch + SSE client helpers
      views/Broadcast.tsx, Sessions.tsx, Read.tsx, Ai.tsx
      components/...     ProviderChip, ConfirmModal, MessageList, etc.
```

The server depends on the library via a `file:../..` dependency, importing
`SocialConnector` and its types from the package entry point. The library is
built (`npm run build` at the root, already wired via the `prepare` script)
before the server starts.

## Backend

### ConnectorManager (approach C — hybrid pool)

Holds at most one live `SocialConnector` per provider.

- `get(provider)`: returns the live connector, or lazily creates + starts a
  hidden one. Updates `lastUsed`.
- **Per-provider serialization.** A provider has one browser/one page, so all
  actions on the same provider run through a per-provider promise queue (mutex).
  Actions on *different* providers run concurrently — separate profiles, separate
  browsers. This is what makes broadcast parallel.
- **Idle reaper.** A timer closes any connector idle longer than `IDLE_MS`
  (default 10 min) to free resources.
- `loginVisible(provider, onEvent)`: closes the hidden connector for that
  provider if present, creates a `forceVisible` one, runs `login()` (which
  waits for the manual login / QR scan), and keeps it live (now logged in).
- On `SocialConnector` errors the manager drops the dead connector so the next
  `get` recreates it.

### Real-time transport: SSE + a run registry

Long-running operations (broadcast, login, ai) are **runs**. A run has an id,
an event buffer, and optional pending client decisions.

- Start endpoints (`POST /api/broadcast`, `POST /api/login/:provider`,
  `POST /api/ai`) create a run, kick off the async work, and return `{ runId }`.
- The client opens `GET /api/events/:runId` (SSE) and receives typed events:
  `progress`, `provider_status`, `message`, `tool`, `confirm_request`, `done`,
  `error`. The buffer is replayed on connect so no early event is missed.
- Client→server decisions (the AI confirm gate) are plain POSTs keyed by runId.

### REST API

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/providers` | Per-provider `{ id, label, loggedIn }` (probes session) |
| `POST` | `/api/login/:provider` | Start a visible login run → `{ runId }` |
| `POST` | `/api/broadcast` | `{ message, providers[], whatsapp?: { to?, chat? } }` → `{ runId }` |
| `GET`  | `/api/groups` | WhatsApp group names |
| `GET`  | `/api/chats?limit=&unread=` | Recent WhatsApp chats |
| `GET`  | `/api/conversation?chat=&limit=&since=&cacheTtl=` | Messages of one chat |
| `GET`  | `/api/posts?provider=&limit=` | Own posts (Facebook / LinkedIn) |
| `POST` | `/api/ai` | `{ instruction }` → `{ runId }` (agent loop streamed) |
| `POST` | `/api/ai/:runId/confirm` | `{ allow: boolean }` resolves a pending send |
| `GET`  | `/api/events/:runId` | SSE event stream for a run |

### Broadcast

`POST /api/broadcast` validates that WhatsApp has a target when selected
(`to` or `chat`), then for each selected provider runs `connector.post(...)`
**concurrently** (different providers → different browsers). Each provider
emits `provider_status` events: `pending → sending → sent | error`. The run
ends with a `done` summary.

### AI agent over SSE

Reuses `runAi` from `src/ai.ts`. The server passes:
- a `confirm(question)` that emits a `confirm_request` event (with target +
  message + a confirmId) and returns a promise resolved by
  `POST /api/ai/:runId/confirm`.
- The loop's `console.log`/tool activity is adapted to emit `message` / `tool`
  events instead of writing to stdout (small refactor: `runAi` gains optional
  `onEvent`/`output` hooks; CLI keeps console behavior by default).

## Frontend (React + Vite)

Single SPA, tabbed/left-nav layout. Four views:

- **Broadcast** (default): a message textarea, provider checkboxes
  (Facebook / LinkedIn / WhatsApp). When WhatsApp is checked, show a target
  control — a toggle between "contact number" (`to`) and "group/community
  name" (`chat`) with an input. **Send** opens the run's SSE stream and shows a
  per-provider status chip (pending / sending / sent / error) updating live.
- **Sessions**: one card per provider showing the logged-in badge and a
  **Login** button. Clicking starts a login run; the UI shows "A window opened
  — log in there…" until the run reports logged-in.
- **Read**: WhatsApp — group list, recent chats, and opening a chat to view its
  messages; Facebook / LinkedIn — list own posts. Uses the GET endpoints.
- **AI**: an instruction input and a streamed transcript (tool calls +
  assistant text). When the agent wants to send, a **confirm modal** shows the
  exact target + composed message; Confirm / Cancel POSTs the decision.

`api.ts` wraps `fetch` for REST and a small `EventSource` helper for SSE. In
dev, Vite proxies `/api` to the server; in prod the server serves the built
`web/dist` as static files.

## Library changes (minimal)

- `runAi` (`src/ai.ts`) gains optional hooks so output can be redirected:
  an `output(text)` for assistant/text lines and the existing `confirm`
  callback already supports custom prompts. The CLI passes console-based
  defaults; the server passes SSE-emitting versions. No behavior change to the
  CLI.
- No other library changes. The server consumes the existing
  `SocialConnector` API (`isLoggedIn`, `login`, `post`, `read`, `listGroups`,
  `listRecentChats`, `readConversation`, `close`).

## Error handling

- Every provider action is wrapped; failures become `error` events / per-chip
  error state in Broadcast, or a toast elsewhere. Typed library errors
  (`NotLoggedInError`, `UnsupportedActionError`, `SelectorError`,
  `PostFailedError`) map to readable messages.
- Login timeout (5 min) surfaces as a run `error`.
- The server refuses to bind to anything other than loopback.

## Testing

- **ConnectorManager**: unit tests with a fake `SocialConnector` — lazy create,
  per-provider serialization, cross-provider concurrency, idle close, dead-
  connector recreation. This is the only logic-heavy server piece.
- **Routes**: a thin smoke test (supertest) for request validation
  (e.g. broadcast rejects WhatsApp without a target) using a mocked manager.
- **Frontend**: kept light (the repo has no UI test infra) — a successful
  `vite build` is the gate. Real end-to-end is manual because it drives live
  browsers and real accounts.

## Build & run

- `app/server`: `tsx watch src/index.ts` (dev), `tsc` (build), `node dist`
  (prod). Serves `web/dist` statically in prod.
- `app/web`: `vite` (dev), `vite build` (prod).
- Root convenience scripts: `app:dev` (concurrently runs server + web),
  `app:build`. Documented in the README.

## Out of scope (YAGNI)

- Multi-user / remote access / auth.
- Scheduling, drafts, message history persistence beyond the existing
  encrypted conversation cache.
- Editing/deleting sent messages.
