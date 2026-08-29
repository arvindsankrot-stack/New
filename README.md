# Hermes Agent Pool

A small agent-pool system: a backend where worker agents pull tasks "buffet style"
from a shared queue, plus a chat endpoint. Two frontends talk to it: a web app
(open it from any phone browser, no install) and a SwiftUI iOS app.

## Scope and limits (read this first)

This is a **research and content-drafting assistant**, not an autonomous trader:

- No brokerage/exchange API keys, no order placement, no fund movement.
- Every crypto / Polymarket / stock / commodity response is framed as informational
  research, not personalized financial advice, and never guarantees an outcome.
- The "digital product" task drafts marketing/content copy — it will not write
  fake reviews, fake testimonials, or income guarantees.
- "Training" here means task-specific system prompts on top of an existing LLM
  (Gemini), not a custom fine-tuning pipeline.

## Backend (`server/`)

Node/TypeScript + Express. In-memory task queue with a fixed pool of workers;
whenever a worker is free it grabs the next queued task (buffet-style dispatch),
runs it through Gemini with a task-type-specific system prompt, and stores the result.

Uses Google's Gemini API, which has a free tier (no credit card required) —
get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

```bash
cd server
cp .env.example .env   # add your GEMINI_API_KEY
npm install
npm run dev             # http://localhost:3000
```

Endpoints:
- `POST /chat` — `{ messages: [{role, content}] }` → `{ reply }`
- `POST /tasks` — `{ type, prompt, chainTo?: { type, promptPrefix? } }` → created task
- `GET /tasks` — list all tasks with status/result
- `GET /tasks/:id` — one task
- `GET /task-types` — valid `type` values
- `POST /schedules` — `{ type, prompt, intervalMinutes, chainTo?, publishIdea? }` → recurring research, auto-submits a task on that interval (min 5 minutes)
- `GET /schedules` — list active schedules
- `DELETE /schedules/:id` — cancel a schedule
- `POST /paper-positions` — `{ taskId?, label, side: "long"|"short", entryPrice, quantity }` → open a simulated position
- `GET /paper-positions` — list all simulated positions
- `POST /paper-positions/:id/close` — `{ exitPrice }` → close a position and compute simulated P&L

### Automation model

Two automations are supported, both bounded to the task pool itself:

1. **Chaining** — a task can carry `chainTo`. When it completes, the pool
   automatically queues a follow-up task of that type, seeded with the
   result (e.g. crypto research → auto-drafted write-up).
2. **Scheduling** — a `(type, prompt, intervalMinutes)` triple that
   re-submits itself on a timer, so research can run unattended on a
   recurring basis.

Neither automation ever leaves the task pool: nothing is published,
posted, traded, or paid for automatically. Every output lands as a task
result for a human to read and act on.

### Idea publishing + paper trading

A research task (or schedule) can set `publishIdea: true`. When it completes,
the model is asked to end its answer with a structured block — a one-line
idea, a **qualitative** confidence rating (Low/Medium/High — the model's own
gut-check, explicitly not a calculated probability or backtest), and key
risks. The task's `idea` field carries the parsed result.

From there, "Add to paper portfolio" opens a **simulated** position: fake
money, a price and quantity you type in by hand, tracked in-memory. There is
no market data feed and no connection to any exchange or brokerage — this
code path cannot place a real trade, by construction, not just by
configuration. Closing a position takes an exit price you also type in and
computes simulated P&L. This exists to let you track how the ideas would
have done, not to execute anything.

## Web app (`server/public/`)

A plain HTML/CSS/JS frontend (no build step) served directly by the Express
server at `/` — same Chat / Agent Pool / Schedules tabs as the iOS app.
Running `npm run dev` (or `npm start`) already serves it, so
`http://localhost:3000` shows the app.

### Getting a URL you can open from your phone

To reach it from your phone (not just your dev machine), deploy the
`server/` folder somewhere with a public HTTPS URL. Any Node host works;
[Render](https://render.com) has a straightforward free-tier path:

1. Push this repo to GitHub (already done if you're reading this on a PR).
2. On Render: **New → Web Service**, connect the repo, set:
   - Root directory: `server`
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
3. Render prompts for `GEMINI_API_KEY` (declared in `render.yaml`) — paste
   your free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
4. Deploy. Render gives you a URL like `https://hermes-agent.onrender.com`
   — open that on your phone whenever you want, bookmark it or add it to
   your home screen (Safari → Share → Add to Home Screen) for an app-like icon.

No App Store, no Xcode, no re-signing every 7 days — it's just a website.

## iOS app (`ios/HermesAgent/`)

SwiftUI app, two tabs: **Chat** and **Agent Pool** (task dashboard: submit a
task, watch it move queued → in_progress → completed, read the result).

This container has no macOS/Xcode toolchain, so the app can't be compiled or
run here — the source was hand-reviewed instead. To build it on a Mac:

```bash
brew install xcodegen
cd ios/HermesAgent
xcodegen generate
open HermesAgent.xcodeproj
```

Before running against a real server, update `APIClient.baseURL` in
`Sources/APIClient.swift` (defaults to `http://localhost:3000`, which works
against the server above when running in the iOS Simulator).
