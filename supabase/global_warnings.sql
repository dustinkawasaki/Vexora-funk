-- VEXORA global warning registry.
-- The trusted Node.js gateway accesses this table using SUPABASE_SERVICE_ROLE_KEY.
-- Never expose the service-role key in a browser client.

create table if not exists public.vexora_global_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  guild_id text,
  reason text not null,
  issued_by text not null,
  issued_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists vexora_global_warnings_user_active_idx
  on public.vexora_global_warnings (user_id, active, issued_at desc);

alter table public.vexora_global_warnings enable row level security;
revoke all on table public.vexora_global_warnings from public, anon, authenticated;
grant select, insert, update on table public.vexora_global_warnings to service_role;
