-- Seed data for local development.
-- 1) Cancellation knowledge base (shared, no user_id).
-- 2) Run `supabase db reset` to apply migrations + this seed together.

insert into cancellation_guides
  (normalized_vendor, display_name, cancel_url, difficulty, steps, requires_phone_call, phone_number, email_template_subject, email_template_body)
values
  ('netflix', 'Netflix', 'https://www.netflix.com/cancelplan', 'easy',
    '["Sign in to netflix.com", "Go to Account", "Select \"Cancel Membership\"", "Confirm cancellation"]'::jsonb,
    false, null,
    'Cancellation Request',
    'Hello Netflix Support,\n\nPlease cancel my subscription associated with this account effective immediately. I no longer wish to be billed going forward.\n\nThank you,\n{{user_name}}'),

  ('spotify', 'Spotify', 'https://www.spotify.com/account/subscription/', 'easy',
    '["Sign in to spotify.com/account", "Go to Subscription", "Click \"Cancel Premium\"", "Confirm on the following screen"]'::jsonb,
    false, null,
    'Cancellation Request',
    'Hello Spotify Support,\n\nPlease cancel my Premium subscription effective immediately.\n\nThank you,\n{{user_name}}'),

  ('adobe', 'Adobe Creative Cloud', 'https://account.adobe.com/plans', 'hard',
    '["Sign in to account.adobe.com/plans", "Click \"Manage plan\"", "Click \"Cancel plan\"", "Adobe will likely offer a retention discount and an early-termination fee warning — review before confirming", "Confirm cancellation"]'::jsonb,
    true, '800-833-6687',
    'Subscription Cancellation Request',
    'Hello Adobe Support,\n\nI would like to cancel my Creative Cloud subscription effective at the end of the current billing period. Please confirm the cancellation and any applicable early termination terms.\n\nThank you,\n{{user_name}}'),

  ('nytimes', 'The New York Times', 'https://www.nytimes.com/subscription/manage', 'medium',
    '["Sign in and go to Account > Subscriptions", "Select the subscription", "Click \"Cancel Subscription\"", "Complete the retention survey to finish"]'::jsonb,
    false, null,
    'Cancellation Request',
    'Hello NYT Support,\n\nPlease cancel my subscription effective immediately.\n\nThank you,\n{{user_name}}'),

  ('planet fitness', 'Planet Fitness', null, 'requires_call',
    '["Gym memberships typically require an in-person or certified-mail cancellation", "Call your home club or visit in person", "Request written confirmation of cancellation"]'::jsonb,
    true, null,
    'Membership Cancellation Request',
    'To Whom It May Concern,\n\nPlease accept this letter as formal notice to cancel my membership effective immediately. Please send written confirmation.\n\nThank you,\n{{user_name}}'),

  ('amazon prime', 'Amazon Prime', 'https://www.amazon.com/mc/pipelines/cancellation', 'easy',
    '["Sign in to amazon.com", "Go to Account > Prime Membership", "Click \"Manage Membership\" then \"End Membership\"", "Confirm cancellation"]'::jsonb,
    false, null,
    'Cancellation Request',
    'Hello Amazon Support,\n\nPlease cancel my Prime membership effective immediately.\n\nThank you,\n{{user_name}}'),

  ('hulu', 'Hulu', 'https://secure.hulu.com/account', 'easy',
    '["Sign in to hulu.com/account", "Under Your Subscription, click \"Cancel\"", "Confirm cancellation"]'::jsonb,
    false, null,
    'Cancellation Request',
    'Hello Hulu Support,\n\nPlease cancel my subscription effective immediately.\n\nThank you,\n{{user_name}}')
on conflict (normalized_vendor) do nothing;
