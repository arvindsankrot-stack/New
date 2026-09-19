# Subs-Guard — Architecture

## 1. System overview

```
┌─────────────────┐        HTTPS/JSON        ┌──────────────────┐
│  Next.js (web)   │ ───────────────────────▶ │  FastAPI (api)   │
│  - Dashboard     │  Bearer <supabase JWT>    │  - Ingestion     │
│  - Upload UI     │ ◀─────────────────────── │  - Alerts engine │
│  - Action Center │                           │  - Action Center │
└────────┬─────────┘                           └─────────┬────────┘
         │ direct (auth + RLS-protected reads)            │ service role
         ▼                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase (PostgreSQL)                        │
│  auth.users │ subscriptions │ transactions │ price_history       │
│  statements │ alerts │ cancellation_guides │ cancellation_requests│
│  Storage bucket: statements (raw uploaded files)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  Anthropic Claude  │  (statement → structured line items)
                    └───────────────────┘
```

**Why a separate FastAPI backend instead of only Supabase + frontend?**
Statement parsing needs a server-side LLM call (never expose the Anthropic API key to the
browser), multi-step orchestration (extract → normalize → dedupe → write 3 tables → run
alert detectors), and PDF parsing (`pdfplumber`). That's naturally a backend service, not a
database function. Everything that's a straightforward RLS-protected read/write (dashboard
queries, subscription list) could be done directly from the frontend against Supabase, but we
route it through FastAPI too, so there's one consistent API surface and one place to enforce
business rules (e.g., subscription normalization on manual entry).

## 2. Data model

Full DDL: [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`, app-level preferences (currency, budget) |
| `statements` | One row per uploaded/pasted statement; tracks parse status |
| `subscriptions` | The core recurring-charge record (vendor, category, cycle, amount, status) |
| `transactions` | Every individual line item parsed from a statement, linked to a subscription |
| `price_history` | Append-only ledger of `(subscription_id, amount, observed_at)` — the source of truth for price-increase detection |
| `alerts` | Output of the Smart Alerts Engine |
| `cancellation_guides` | Shared knowledge base (vendor → cancel URL, steps, email template) — not user-scoped |
| `cancellation_requests` | Log of generated cancellation emails/links per user |

Design decisions worth calling out:

- **`subscriptions` is keyed on `(user_id, normalized_vendor, billing_cycle)`.** Re-uploading
  an overlapping statement upserts into the same row instead of creating duplicates. The same
  vendor billed both monthly and annually (rare but real) becomes two distinct subscriptions,
  which is usually what the user actually has.
- **`price_history` is append-only and separate from `subscriptions.amount`.** The
  subscription row is a queryable "current state" snapshot; price-increase detection needs the
  *sequence* of amounts over time, which a mutable single-amount column can't give you.
- **Billing-cycle normalization lives in SQL (`subscription_normalized` view), not in
  frontend or backend code**, so the dashboard total, the API, and any future ad-hoc query all
  agree on one formula (weekly ×4.345, quarterly ÷3, yearly ÷12 → monthly equivalent).
- **`cancellation_guides` has no `user_id`** — it's a shared knowledge base the backend
  writes to (via the service role) and every user reads from, keyed by `normalized_vendor`.
- **RLS is the primary access control.** Every user-scoped table has policies restricting rows
  to `auth.uid() = user_id`. The FastAPI backend uses the service-role key (which bypasses RLS)
  specifically so it can write parsed subscriptions during ingestion — every query it issues is
  manually scoped by the verified JWT's `user_id` as a second layer of enforcement.

## 3. AI statement parsing pipeline

`apps/api/app/services/llm_parser.py`

1. **Extraction**: `pdfplumber` pulls text per-page from PDFs; CSVs are flattened row-by-row
   into plain text (bank CSV exports vary too much to hardcode a column schema); pasted text
   passes through unchanged. All three paths converge on one `raw_text` string.
2. **Structured extraction via Claude**: rather than parsing free-form model prose, we force a
   tool call (`tool_choice: {"type": "tool", "name": "record_line_items"}`) with a JSON schema
   covering vendor name, amount, currency, charge date, billing-cycle guess, category guess,
   and a recurring/non-recurring flag. This eliminates prompt-parsing fragility — the response
   is already validated JSON.
3. **Heuristic fallback**: if `ANTHROPIC_API_KEY` is unset or the API call fails, a regex parser
   (`_LINE_PATTERN`) extracts `date / description / amount` triples and runs them through the
   same keyword-based categorizer used to sanity-check the LLM's guesses. Less accurate, but
   keeps local dev and CI unblocked without a live API key.
4. **Normalization**: `normalize_vendor_name()` strips payment-processor prefixes
   (`SQ *`, `TST*`), domain suffixes (`.com`), and long reference/phone-number digit runs, so
   `"SQ *NETFLIX.COM 866-579-7172"` and `"NETFLIX.COM"` collapse to the same `netflix` key used
   for subscription de-duplication and cancellation-guide lookup.
5. **Ingestion**: `services/ingestion.py` groups extracted line items by
   `(normalized_vendor, billing_cycle)`, upserts one `subscriptions` row per group, inserts a
   `transactions` row per line item, and a `price_history` row per transaction — then triggers
   the alerts engine for the user.

## 4. Smart Alerts Engine

`apps/api/app/services/alerts_engine.py` — four independent, deterministic detectors (no LLM
calls; comparisons and thresholds don't need one, and staying rule-based keeps alerts fast,
cheap, and explainable):

| Detector | Trigger | Severity |
|---|---|---|
| `price_increase` | Latest distinct amount in `price_history` is >3% above the previous distinct amount | warning (<25%) / critical (≥25%) |
| `low_usage` | User-set `usage_frequency_per_month` < 1, excluding `utilities` | info |
| `trial_ending` | `status = 'trial'` and `next_expected_charge_date` within 3 days | critical |
| `duplicate_service` | ≥2 active subscriptions in the same watched category (`streaming`, `saas`) | info |

Detectors run automatically after every statement ingestion, and on-demand via
`POST /api/alerts/scan`. A partial unique index (`alerts_dedupe_idx` on
`(subscription_id, alert_type) WHERE status = 'open'`) makes every detector idempotent —
upserting an already-open alert of the same type is a no-op, so re-running scans never spams
duplicate alerts.

## 5. Action Center

`apps/api/app/services/cancellation.py` + `cancellation_guides` table.

Given a subscription, the backend looks up its `normalized_vendor` in the shared
`cancellation_guides` knowledge base (seeded for Netflix, Spotify, Adobe, NYT, Amazon Prime,
Hulu, Planet Fitness in `supabase/seed.sql`). Three output modes, chosen by the user in the UI:

- **Email**: fills the guide's stored subject/body template (or falls back to a generic
  cancellation-request template) and logs the draft in `cancellation_requests`.
- **Link**: returns the guide's direct `cancel_url`, when known.
- **Manual**: returns the guide's step-by-step `steps` array, or a generic 5-step fallback
  ("check email for account confirmation → sign in → find billing settings → cancel → save
  confirmation") when no guide exists yet.

Growing the knowledge base is just inserting rows into `cancellation_guides` — no code change
needed for a new vendor.

## 6. Auth & request flow

- Supabase Auth (magic link) is the single identity provider. The frontend talks to Supabase
  directly for sign-in/sign-out and holds the session client-side.
- Every API call from the frontend attaches the Supabase session's `access_token` as a Bearer
  token (`lib/api.ts`).
- The backend verifies that JWT against `SUPABASE_JWT_SECRET` (`app/dependencies.py`) and
  extracts `sub` as the trusted `user_id` — it never trusts a user id from the request body.
- Next.js middleware (`middleware.ts` + `lib/supabase/middleware.ts`) refreshes the session
  cookie on every request and redirects unauthenticated users to `/login`.

## 7. What's deliberately out of scope for the MVP

- Background job scheduling (e.g., a cron that re-scans for trial-ending alerts daily) — the
  scan currently runs on ingestion and on-demand. A production deployment would add a
  scheduled worker (Supabase Edge Function cron, or a Celery/RQ worker) calling
  `run_alert_scan_for_user` for every user nightly.
- Bank/card OAuth aggregation (Plaid, etc.) — statements are uploaded/pasted manually.
- Multi-currency conversion (amounts are stored with a `currency` column but not converted to a
  single display currency).
- Push/email delivery of alerts (alerts are in-app only; `profiles.notify_email` is reserved for
  this).
