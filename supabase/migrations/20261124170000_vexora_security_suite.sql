-- VEXORA security suite: global warnings, quarantine queue and weekly scan history.
-- These tables are accessed only by trusted server-side services using the Supabase service role.
create table if not exists public.vexora_global_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  guild_id text,
  reason text not null check (char_length(reason) between 1 and 1000),
  issued_by text not null,
  issued_at timestamptz not null default now(),
  active boolean not null default true
);
create index if not exists vexora_global_warnings_user_active_idx
  on public.vexora_global_warnings (user_id, active, issued_at desc);

create table if not exists public.vexora_quarantine (
  guild_id text not null,
  user_id text not null,
  role_id text not null,
  release_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);
create index if not exists vexora_quarantine_release_idx
  on public.vexora_quarantine (release_at);

create table if not exists public.vexora_weekly_scans (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  scanned_at timestamptz not null default now(),
  finding_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb
);
create index if not exists vexora_weekly_scans_guild_time_idx
  on public.vexora_weekly_scans (guild_id, scanned_at desc);

alter table public.vexora_global_warnings enable row level security;
alter table public.vexora_quarantine enable row level security;
alter table public.vexora_weekly_scans enable row level security;
revoke all on public.vexora_global_warnings, public.vexora_quarantine, public.vexora_weekly_scans from anon, authenticated, public;
grant all on public.vexora_global_warnings, public.vexora_quarantine, public.vexora_weekly_scans to service_role;
