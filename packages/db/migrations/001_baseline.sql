-- 001_baseline.sql
-- Postgres-native baseline for CivicSignal. It squashes the Supabase-era migrations 001–012
-- (schema only; seed content lives in 002_seed_content.sql) and adds app-owned auth.
--
-- No Supabase: no auth schema, no Supabase roles, no row-level policies. The database is
-- reached only by the server (web and resolver) over DATABASE_URL, and access control is
-- enforced in server code. The rules it must enforce, one per former policy, are in
-- docs/authz-policies.md.

-- ─── App-owned auth ──────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Accounts, replacing the Supabase auth user table. Emails are stored trimmed and lowercased.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email <> ''),
  password_hash text not null,
  email_verified_at timestamptz,
  -- Moved here from profiles.is_admin (old 006_admin_role.sql), so the public profile row
  -- does not carry privileges.
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- Login sessions. The cookie carries the raw token; only its hash is stored.
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_sessions_user on public.sessions(user_id);
create index if not exists idx_sessions_expires on public.sessions(expires_at);

-- Single-use email verification and password reset tokens. Only the hash is stored.
create table if not exists public.email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_email_tokens_user_purpose on public.email_tokens(user_id, purpose);

-- ─── Topics ──────────────────────────────────────────────────────────────────

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  created_at timestamptz default now()
);

-- ─── Profiles ────────────────────────────────────────────────────────────────

-- Public pseudonymous profile, one per user (its id is the user id).
create table if not exists public.profiles (
  id uuid primary key references public.users(id) on delete cascade,
  handle text unique not null,
  verified boolean default false,
  verified_at timestamptz,
  created_at timestamptz default now()
);

-- ─── Polls and votes ─────────────────────────────────────────────────────────

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) not null,
  question text not null,
  region text not null,
  options jsonb not null,
  source_of_truth text not null,
  resolution_criteria text,
  cutoff_at timestamptz not null,
  resolves_at timestamptz not null,
  status text default 'draft' check (status in ('draft', 'active', 'closed', 'resolved', 'disputed')),
  outcome text,
  resolution_notes text,
  resolution_source_url text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  commitment_hash text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- One vote per user per poll.
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) not null,
  user_id uuid references public.profiles(id) not null,
  encrypted_answer text not null,
  answer text,
  receipt_hash text not null,
  created_at timestamptz default now(),
  unique(poll_id, user_id)
);

-- ─── Reputation ──────────────────────────────────────────────────────────────

create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) not null,
  poll_id uuid references public.polls(id) not null,
  topic_id uuid references public.topics(id) not null,
  delta integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.user_topic_reputation (
  user_id uuid references public.profiles(id) not null,
  topic_id uuid references public.topics(id) not null,
  score integer default 0,
  resolved_count integer default 0,
  correct_count integer default 0,
  primary key (user_id, topic_id)
);

-- ─── Audit ───────────────────────────────────────────────────────────────────

create table if not exists public.audit_commitments (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id),
  merkle_root text not null,
  batch_type text not null check (batch_type in ('vote', 'reputation', 'resolution')),
  metadata jsonb,
  created_at timestamptz default now(),
  constraint audit_commitments_no_secret_key check (metadata is null or not (metadata ? 'secretKey'))
);

-- Public material only (public key, hashes, Merkle roots): audit_commitments is publicly
-- readable. A poll's secret key goes in poll_secrets, never in metadata.

-- The poll's NaCl secret key. It decrypts every ballot and votes carry user_id, so it is
-- server-only: written by admin poll creation, read only by the resolver and resolution.
create table if not exists public.poll_secrets (
  poll_id uuid primary key references public.polls(id) on delete cascade,
  secret_key text not null,
  created_at timestamptz not null default now()
);

-- ─── Disputes and trusted panels ─────────────────────────────────────────────

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) not null,
  flagged_by uuid references public.profiles(id) not null,
  reason text not null,
  status text default 'open' check (status in ('open', 'reviewing', 'upheld', 'dismissed')),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolution_notes text
);

create table if not exists public.panel_members (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) not null,
  user_id uuid references public.profiles(id) not null,
  invited_by uuid references public.profiles(id),
  status text not null default 'invited' check (status in ('invited', 'active', 'declined', 'removed')),
  min_reputation_at_invite integer not null default 1,
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  unique(topic_id, user_id)
);

create table if not exists public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid references public.disputes(id) on delete cascade not null,
  submitted_by uuid references public.profiles(id) not null,
  summary text not null,
  source_url text,
  created_at timestamptz default now()
);

create table if not exists public.dispute_reviews (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid references public.disputes(id) on delete cascade not null,
  reviewer_id uuid references public.profiles(id) not null,
  decision text not null check (decision in ('uphold', 'dismiss')),
  rationale text not null,
  created_at timestamptz default now(),
  unique(dispute_id, reviewer_id)
);

-- ─── Invites ─────────────────────────────────────────────────────────────────

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_by uuid references public.profiles(id),
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  created_at timestamptz default now()
);

-- ─── Poll proposals ──────────────────────────────────────────────────────────

create table if not exists public.source_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  region text not null,
  topic_slug text,
  source_of_truth text not null,
  resolution_criteria_template text not null,
  created_at timestamptz default now()
);

create table if not exists public.poll_proposals (
  id uuid primary key default gen_random_uuid(),
  proposed_by uuid references public.profiles(id) not null,
  topic_id uuid references public.topics(id) not null,
  question text not null,
  region text not null,
  options jsonb not null,
  source_of_truth text not null,
  resolution_criteria text not null,
  cutoff_at timestamptz not null,
  resolves_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'changes_requested', 'appealed')),
  moderator_id uuid references public.profiles(id),
  moderator_notes text,
  poll_id uuid references public.polls(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  moderated_at timestamptz,
  revision_count integer not null default 0,
  appeal_reason text,
  appealed_at timestamptz
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists idx_polls_status on public.polls(status);
create index if not exists idx_polls_topic on public.polls(topic_id);
create index if not exists idx_polls_cutoff on public.polls(cutoff_at);
create index if not exists idx_polls_status_cutoff on public.polls(status, cutoff_at);
create index if not exists idx_votes_poll on public.votes(poll_id);
create index if not exists idx_votes_user on public.votes(user_id);
create index if not exists idx_reputation_events_user on public.reputation_events(user_id);
create index if not exists idx_reputation_events_poll on public.reputation_events(poll_id);
create index if not exists idx_user_topic_rep_user on public.user_topic_reputation(user_id);
create index if not exists idx_disputes_poll_status on public.disputes(poll_id, status);
create index if not exists idx_panel_members_topic_status on public.panel_members(topic_id, status);
create index if not exists idx_panel_members_user_status on public.panel_members(user_id, status);
create index if not exists idx_dispute_evidence_dispute on public.dispute_evidence(dispute_id, created_at);
create index if not exists idx_dispute_reviews_dispute on public.dispute_reviews(dispute_id, created_at);
create index if not exists idx_poll_proposals_status_created on public.poll_proposals(status, created_at desc);
create index if not exists idx_poll_proposals_topic on public.poll_proposals(topic_id);
create index if not exists idx_poll_proposals_proposed_by on public.poll_proposals(proposed_by);
create index if not exists idx_source_templates_region on public.source_templates(region);

-- ─── Profile bootstrap (was 007_auth_profile_bootstrap.sql) ──────────────────

create or replace function public.generate_profile_handle()
returns text
language plpgsql
as $$
declare
  words text[] := array[
    'civic', 'signal', 'ballot', 'forum', 'public', 'ledger', 'veritas', 'polis',
    'atlas', 'nova', 'orion', 'river', 'stone', 'summit', 'harbor', 'sparrow'
  ];
  candidate text;
begin
  loop
    candidate := words[1 + floor(random() * array_length(words, 1))::int]
      || '-'
      || words[1 + floor(random() * array_length(words, 1))::int]
      || '-'
      || lpad(floor(random() * 10000)::text, 4, '0');

    exit when not exists (select 1 from public.profiles where handle = candidate);
  end loop;

  return candidate;
end;
$$;

-- Every new user gets a profile row with a generated handle. The web signup may set a chosen
-- handle afterwards in the same transaction (update profiles set handle = ... where id = ...).
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
as $$
begin
  insert into public.profiles (id, handle, verified, verified_at)
  values (new.id, public.generate_profile_handle(), new.email_verified_at is not null, new.email_verified_at)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_user_created_profile on public.users;
create trigger on_user_created_profile
after insert on public.users
for each row execute function public.handle_new_user_profile();

-- Confirming the email marks the profile verified (the Supabase auth callback did this).
create or replace function public.handle_user_email_verified()
returns trigger
language plpgsql
as $$
begin
  update public.profiles
  set verified = true, verified_at = new.email_verified_at
  where id = new.id and verified is not true;

  return new;
end;
$$;

drop trigger if exists on_user_email_verified on public.users;
create trigger on_user_email_verified
after update of email_verified_at on public.users
for each row
when (old.email_verified_at is null and new.email_verified_at is not null)
execute function public.handle_user_email_verified();
