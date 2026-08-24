-- =====================================================================
-- UPI Guardian - Transaction History
-- Run this whole file once in your Supabase project's SQL Editor
-- (Project -> SQL Editor -> New query -> paste -> Run)
-- =====================================================================

-- 1. Table -------------------------------------------------------------
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade,
  payee_name      text not null,
  upi_id          text not null,
  amount          numeric(12, 2) not null,
  direction       text not null default 'sent' check (direction in ('sent', 'received')),
  category        text not null default 'other',       -- shopping, person, bill, food, transfer, other...
  risk_level      text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  status          text not null default 'success' check (status in ('success', 'pending', 'failed')),
  note            text,
  created_at      timestamptz not null default now()
);

-- Keep the newest transactions fast to query
create index if not exists transactions_created_at_idx
  on public.transactions (created_at desc);

create index if not exists transactions_user_id_idx
  on public.transactions (user_id);

-- 2. Row Level Security --------------------------------------------------
alter table public.transactions enable row level security;

-- Option A (recommended once login is wired up with Supabase Auth):
-- each signed-in user can only see / add / remove their own transactions.
drop policy if exists "Users can view own transactions" on public.transactions;
create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own transactions" on public.transactions;
create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- Option B (demo / no-auth mode):
-- UPI Guardian's login page isn't wired to Supabase Auth yet, so by
-- default nobody would be able to read/write anything (policies above
-- all require auth.uid()). Uncomment the block below ONLY while you're
-- prototyping without real logins, then delete it once auth is in place
-- -- it makes every row public to anyone with your anon key.
--
-- drop policy if exists "Public demo access" on public.transactions;
-- create policy "Public demo access"
--   on public.transactions for all
--   using (true)
--   with check (true);

-- 3. Profiles (full name + mobile number for the logged-in user) --------
-- login.html / signup.html sign people in with Supabase Auth using a
-- synthetic email built from their mobile number (see js/auth.js). This
-- table stores the human-friendly details so pages like the dashboard
-- can greet the user by name.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  mobile      text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can upsert own profile" on public.profiles;
create policy "Users can upsert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Automatically create a profile row whenever someone signs up, using the
-- full_name / mobile passed in from js/auth.js signUp(). This means the
-- profile exists even if the client-side upsert in auth.js is skipped.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, mobile)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'mobile'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- Part 2 - added for the full-featured version of the app (Send Money,
-- Scan & Pay, Payment Requests, Message Analyzer, Insights, Settings).
-- Safe to re-run: every statement below is idempotent.
-- =====================================================================

-- 4a. Allow a 'blocked' status - used when UPI Guardian's risk engine
--     stops a payment and the user cancels instead of confirming it.
--     These rows power the "Money Saved" stat on the dashboard.
alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('success', 'pending', 'failed', 'blocked'));

-- 4b. Payment Requests (collect requests) --------------------------------
create table if not exists public.payment_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade,
  requester_name  text not null,
  requester_upi   text not null,
  amount          numeric(12, 2) not null,
  note            text,
  is_suspicious   boolean not null default false,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired')),
  created_at      timestamptz not null default now()
);

create index if not exists payment_requests_user_id_idx on public.payment_requests (user_id);
create index if not exists payment_requests_created_at_idx on public.payment_requests (created_at desc);

alter table public.payment_requests enable row level security;

drop policy if exists "Users can view own requests" on public.payment_requests;
create policy "Users can view own requests" on public.payment_requests for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own requests" on public.payment_requests;
create policy "Users can insert own requests" on public.payment_requests for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own requests" on public.payment_requests;
create policy "Users can update own requests" on public.payment_requests for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own requests" on public.payment_requests;
create policy "Users can delete own requests" on public.payment_requests for delete using (auth.uid() = user_id);

-- 4c. Trusted Contacts (Trust Person Confirmation feature) ---------------
create table if not exists public.trusted_contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  name        text not null,
  upi_id      text,
  mobile      text,
  created_at  timestamptz not null default now()
);

create index if not exists trusted_contacts_user_id_idx on public.trusted_contacts (user_id);

alter table public.trusted_contacts enable row level security;

drop policy if exists "Users can view own contacts" on public.trusted_contacts;
create policy "Users can view own contacts" on public.trusted_contacts for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own contacts" on public.trusted_contacts;
create policy "Users can insert own contacts" on public.trusted_contacts for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own contacts" on public.trusted_contacts;
create policy "Users can delete own contacts" on public.trusted_contacts for delete using (auth.uid() = user_id);

-- 4d. Message Analyzer history (feeds the Scam Timeline in Insights) -----
create table if not exists public.message_analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  excerpt     text not null,
  risk_score  int not null default 0,
  risk_level  text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  factors     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists message_analyses_user_id_idx on public.message_analyses (user_id);
create index if not exists message_analyses_created_at_idx on public.message_analyses (created_at desc);

alter table public.message_analyses enable row level security;

drop policy if exists "Users can view own analyses" on public.message_analyses;
create policy "Users can view own analyses" on public.message_analyses for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own analyses" on public.message_analyses;
create policy "Users can insert own analyses" on public.message_analyses for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own analyses" on public.message_analyses;
create policy "Users can delete own analyses" on public.message_analyses for delete using (auth.uid() = user_id);

-- 4e. Settings live on the profiles row (notification prefs, trusted-
--     person threshold, etc.) so Settings page has one place to read/write.
alter table public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;

-- 4. Sample data (optional) ---------------------------------------------
-- Only useful while Option B is active, or after you've signed in and
-- swapped in your own user_id. Safe to delete this whole block.
--
-- insert into public.transactions (payee_name, upi_id, amount, direction, category, risk_level, note)
-- values
--   ('Amazon India', 'amazon@apl', 950,   'sent', 'shopping', 'low',  'Order #12345'),
--   ('Rahul Kumar',  'rahul123@upi', 500, 'sent', 'person',   'low',  null),
--   ('Unknown Receiver', 'xyz123@upi', 50000, 'sent', 'other', 'high', 'First-time receiver, unusually large amount'),
--   ('Flipkart', 'flipkart@apl', 1299, 'sent', 'shopping', 'low', null),
--   ('Sister', 'sister@upi', 2000, 'sent', 'person', 'low', null);
