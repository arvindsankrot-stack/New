# Subs-Guard

Track every recurring charge, catch price hikes and low-usage subscriptions automatically,
and cancel anything in a couple of clicks.

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS, Supabase Auth (magic link)
- **Backend**: FastAPI (Python), Anthropic Claude for statement parsing
- **Database**: PostgreSQL via Supabase (Row Level Security, Storage, Auth)

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system design, data model, and
core algorithms (alerting logic, statement parsing pipeline, cancellation knowledge base).

## Monorepo layout

```
subs-guard/
├── apps/
│   ├── web/     Next.js frontend
│   └── api/     FastAPI backend
├── supabase/
│   ├── migrations/   SQL schema (tables, views, RLS policies)
│   └── seed.sql      Cancellation knowledge base + dev seed data
└── docs/
    └── ARCHITECTURE.md
```

## Prerequisites

- Node.js 20+
- Python 3.11+
- A [Supabase](https://supabase.com) project (free tier is fine)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- An [Anthropic API key](https://console.anthropic.com) (optional — the parser falls back to a
  regex heuristic if you don't set one, so you can run the whole stack without a key for local dev)

## 1. Set up Supabase

```bash
# Link to your Supabase project (or run `supabase init` + `supabase start` for a fully local stack)
supabase login
supabase link --project-ref <your-project-ref>

# Apply the schema (tables, enums, views, RLS policies, storage bucket)
supabase db push

# Seed the cancellation knowledge base + local dev data
supabase db reset   # local stack only, re-applies migrations + seed.sql
# — or, against a linked remote project —
psql "$(supabase db url)" -f supabase/seed.sql
```

Grab these values from **Project Settings → API**:
- `Project URL` → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend only — **never** expose this to the browser)
- `JWT Secret` (Project Settings → API → JWT Settings) → `SUPABASE_JWT_SECRET`

## 2. Run the backend (FastAPI)

```bash
cd apps/api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
# optionally set ANTHROPIC_API_KEY for AI-powered statement parsing

uvicorn app.main:app --reload --port 8000
```

API docs are served at `http://localhost:8000/docs` (Swagger UI).

Run tests:

```bash
cd apps/api
pytest
```

## 3. Run the frontend (Next.js)

```bash
cd apps/web
npm install

cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# NEXT_PUBLIC_API_BASE_URL defaults to http://localhost:8000

npm run dev
```

Open `http://localhost:3000`, sign in with a magic link (check your inbox), then head to
**Upload Statement** to try the AI parser — paste a few lines like:

```
09/01  NETFLIX.COM 866-579-7172   $15.49
09/03  SPOTIFY USA                $11.99
09/05  AWS SERVICES                $42.10
```

## How the pieces fit together

1. **Ingestion**: the frontend uploads a PDF/CSV or pasted text to
   `POST /api/ingestion/upload` or `/api/ingestion/paste-text`.
2. **Extraction**: the backend extracts raw text (`pdfplumber` for PDFs, row-flattening for
   CSVs) and sends it to Claude with a forced tool call that returns structured line items
   (vendor, amount, billing cycle, date). No API key configured → falls back to a regex parser.
3. **Normalization & storage**: line items are grouped by normalized vendor + billing cycle,
   upserted into `subscriptions`, and every individual charge is recorded in `transactions` and
   `price_history` (the append-only ledger price-increase detection reads from).
4. **Alerts engine**: after every ingestion (and on-demand via `POST /api/alerts/scan`), four
   detectors run over the user's active subscriptions — price increases, low usage, trials
   ending soon, and duplicate services in the same category.
5. **Dashboard**: reads a Postgres view (`dashboard_category_burn`) that normalizes every
   billing cycle to a monthly/yearly equivalent, so a $180/yr and a $15/mo subscription roll up
   correctly into the same total.
6. **Action Center**: resolves a subscription's normalized vendor against the
   `cancellation_guides` knowledge base (seeded for common vendors) and generates a
   ready-to-send cancellation email, a direct cancel link, or a step-by-step guide — falling
   back to generic instructions for unknown vendors.

## Environment variables reference

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | backend | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | Bypasses RLS; backend scopes every query by the verified user id itself |
| `SUPABASE_JWT_SECRET` | backend | Verifies the Supabase session JWT sent by the frontend |
| `ANTHROPIC_API_KEY` | backend | Optional — enables AI statement parsing (Claude) |
| `ANTHROPIC_MODEL` | backend | Defaults to `claude-sonnet-5` |
| `WEB_APP_ORIGIN` | backend | CORS allow-origin for the frontend |
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | Public anon key (RLS-protected) |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | FastAPI backend URL |

## Security notes

- The frontend talks to Supabase **directly** for auth (magic link) and could optionally read
  data directly too, since every table has RLS scoped to `auth.uid()`.
- The FastAPI backend uses the Supabase **service role** key (bypasses RLS) but verifies the
  caller's JWT on every request and manually scopes every query to that user id — this is what
  lets it write parsed subscriptions/transactions on the user's behalf during ingestion.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend or commit it to version control.
