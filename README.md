# Hermes Agent Pool

A small agent-pool system: a backend where worker agents pull tasks "buffet style"
from a shared queue, plus a chat endpoint, fronted by an iOS app with a Chat tab
and an Agent Pool task dashboard.

## Scope and limits (read this first)

This is a **research and content-drafting assistant**, not an autonomous trader:

- No brokerage/exchange API keys, no order placement, no fund movement.
- Every crypto / Polymarket / stock / commodity response is framed as informational
  research, not personalized financial advice, and never guarantees an outcome.
- The "digital product" task drafts marketing/content copy — it will not write
  fake reviews, fake testimonials, or income guarantees.
- "Training" here means task-specific system prompts on top of an existing LLM
  (Claude), not a custom fine-tuning pipeline.

## Backend (`server/`)

Node/TypeScript + Express. In-memory task queue with a fixed pool of workers;
whenever a worker is free it grabs the next queued task (buffet-style dispatch),
runs it through Claude with a task-type-specific system prompt, and stores the result.

```bash
cd server
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm install
npm run dev             # http://localhost:3000
```

Endpoints:
- `POST /chat` — `{ messages: [{role, content}] }` → `{ reply }`
- `POST /tasks` — `{ type, prompt, chainTo?: { type, promptPrefix? } }` → created task
- `GET /tasks` — list all tasks with status/result
- `GET /tasks/:id` — one task
- `GET /task-types` — valid `type` values
- `POST /schedules` — `{ type, prompt, intervalMinutes, chainTo? }` → recurring research, auto-submits a task on that interval (min 5 minutes)
- `GET /schedules` — list active schedules
- `DELETE /schedules/:id` — cancel a schedule

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
