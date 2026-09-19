-- Subs-Guard core schema
-- Run via Supabase CLI: supabase db push
-- Targets: PostgreSQL 15+ (Supabase managed), with Supabase Auth (auth.users) as the identity source.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type subscription_category as enum (
  'streaming',
  'utilities',
  'saas',
  'personal_services',
  'other'
);

create type billing_cycle as enum (
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'one_time'
);

create type subscription_status as enum (
  'active',
  'trial',
  'cancelled',
  'unknown'
);

create type statement_status as enum (
  'pending',
  'processing',
  'parsed',
  'failed'
);

create type statement_source_type as enum (
  'pdf',
  'csv',
  'pasted_text'
);

create type alert_type as enum (
  'price_increase',
  'low_usage',
  'trial_ending',
  'duplicate_service',
  'new_subscription'
);

create type alert_severity as enum ('info', 'warning', 'critical');

create type alert_status as enum ('open', 'acknowledged', 'dismissed', 'resolved');

-- ---------------------------------------------------------------------------
-- profiles: 1:1 extension of auth.users
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  currency char(3) not null default 'USD',
  monthly_budget numeric(12, 2),
  notify_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- statements: uploaded bank/credit-card statements or pasted text
-- ---------------------------------------------------------------------------

create table statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type statement_source_type not null,
  original_filename text,
  storage_path text, -- path in Supabase Storage bucket 'statements', null for pasted_text
  raw_text text, -- extracted/pasted text, used as LLM input
  status statement_status not null default 'pending',
  error_message text,
  transactions_found int not null default 0,
  subscriptions_detected int not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index statements_user_id_idx on statements (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- subscriptions: the core recurring-charge record
-- ---------------------------------------------------------------------------

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vendor_name text not null,
  normalized_vendor text not null, -- lowercase, stripped, used for dedupe/matching (e.g. "netflix")
  category subscription_category not null default 'other',
  billing_cycle billing_cycle not null default 'monthly',
  amount numeric(12, 2) not null,
  currency char(3) not null default 'USD',
  status subscription_status not null default 'active',
  first_seen_date date,
  last_charge_date date,
  next_expected_charge_date date,
  usage_frequency_per_month numeric(5, 2), -- self-reported or inferred usage score
  source_statement_id uuid references statements (id) on delete set null,
  confidence numeric(3, 2) not null default 0.75, -- LLM extraction confidence 0..1
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_vendor, billing_cycle)
);

create index subscriptions_user_id_idx on subscriptions (user_id);
create index subscriptions_user_status_idx on subscriptions (user_id, status);
create index subscriptions_category_idx on subscriptions (user_id, category);

-- ---------------------------------------------------------------------------
-- transactions: individual line items parsed from statements,
-- linked to a subscription once matched
-- ---------------------------------------------------------------------------

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  statement_id uuid references statements (id) on delete cascade,
  subscription_id uuid references subscriptions (id) on delete set null,
  vendor_raw_text text not null, -- exact text as it appeared on the statement
  amount numeric(12, 2) not null,
  currency char(3) not null default 'USD',
  charged_at date not null,
  created_at timestamptz not null default now()
);

create index transactions_user_id_idx on transactions (user_id, charged_at desc);
create index transactions_subscription_id_idx on transactions (subscription_id);

-- ---------------------------------------------------------------------------
-- price_history: append-only ledger used for price-increase detection
-- ---------------------------------------------------------------------------

create table price_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  amount numeric(12, 2) not null,
  observed_at date not null,
  source_transaction_id uuid references transactions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index price_history_subscription_id_idx on price_history (subscription_id, observed_at);

-- ---------------------------------------------------------------------------
-- alerts: smart alerts engine output
-- ---------------------------------------------------------------------------

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  alert_type alert_type not null,
  severity alert_severity not null default 'info',
  status alert_status not null default 'open',
  title text not null,
  detail text not null,
  metadata jsonb not null default '{}'::jsonb, -- e.g. {"old_amount":9.99,"new_amount":15.49,"delta_pct":55.0}
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index alerts_user_status_idx on alerts (user_id, status);
create unique index alerts_dedupe_idx on alerts (subscription_id, alert_type)
  where status = 'open'; -- prevent duplicate open alerts of the same type per subscription

-- ---------------------------------------------------------------------------
-- cancellation_guides: knowledge base powering the Action Center
-- Keyed by normalized vendor name; shared across all users (no user_id).
-- ---------------------------------------------------------------------------

create table cancellation_guides (
  id uuid primary key default gen_random_uuid(),
  normalized_vendor text not null unique,
  display_name text not null,
  cancel_url text,
  difficulty text check (difficulty in ('easy', 'medium', 'hard', 'requires_call')),
  steps jsonb not null default '[]'::jsonb, -- ["Log in", "Go to Settings > Plans", "Click Cancel plan"]
  requires_phone_call boolean not null default false,
  phone_number text,
  email_template_subject text,
  email_template_body text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- cancellation_requests: user-facing Action Center activity log
-- ---------------------------------------------------------------------------

create table cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  guide_id uuid references cancellation_guides (id) on delete set null,
  method text not null check (method in ('email', 'link', 'phone', 'manual')),
  generated_email_subject text,
  generated_email_body text,
  status text not null default 'drafted' check (status in ('drafted', 'sent', 'confirmed_cancelled')),
  created_at timestamptz not null default now()
);

create index cancellation_requests_user_idx on cancellation_requests (user_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

create trigger subscriptions_set_updated_at before update on subscriptions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table statements enable row level security;
alter table subscriptions enable row level security;
alter table transactions enable row level security;
alter table price_history enable row level security;
alter table alerts enable row level security;
alter table cancellation_requests enable row level security;
alter table cancellation_guides enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

create policy "statements_all_own" on statements for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "subscriptions_all_own" on subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transactions_all_own" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "price_history_select_own" on price_history for select
  using (exists (
    select 1 from subscriptions s
    where s.id = price_history.subscription_id and s.user_id = auth.uid()
  ));

create policy "price_history_insert_own" on price_history for insert
  with check (exists (
    select 1 from subscriptions s
    where s.id = price_history.subscription_id and s.user_id = auth.uid()
  ));

create policy "alerts_all_own" on alerts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cancellation_requests_all_own" on cancellation_requests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cancellation_guides is a shared read-only knowledge base
create policy "cancellation_guides_read_all" on cancellation_guides for select using (true);
-- writes are performed only by the backend service role (bypasses RLS), no user policy needed

-- ---------------------------------------------------------------------------
-- New-user bootstrap: auto-create a profile row on signup
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage bucket for raw statement uploads (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

create policy "statement_files_owner_rw" on storage.objects for all
  using (bucket_id = 'statements' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'statements' and auth.uid()::text = (storage.foldername(name))[1]);
