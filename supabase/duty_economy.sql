-- VEXORA duty and virtual-economy foundation.
-- Run with the Supabase SQL editor or the project database connection.
-- These records are roleplay-only and are scoped by Discord guild ID.

create table if not exists public.vexora_job_profiles (
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  user_id text not null check (user_id ~ '^[0-9]{17,20}$'),
  job text not null check (job in ('police','fire','ems','trucker')),
  rank_name text not null default 'Einsteiger',
  hourly_rate integer not null check (hourly_rate between 1 and 1000),
  balance bigint not null default 0 check (balance >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id,user_id)
);

create table if not exists public.vexora_duty_shifts (
  id bigint generated always as identity primary key,
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  user_id text not null check (user_id ~ '^[0-9]{17,20}$'),
  job text not null check (job in ('police','fire','ems','trucker')),
  hourly_rate integer not null check (hourly_rate between 1 and 1000),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer,
  earned bigint,
  check (
    (ended_at is null and duration_minutes is null and earned is null)
    or (ended_at is not null and duration_minutes is not null and earned is not null)
  )
);

alter table public.vexora_job_profiles
  add column if not exists is_active boolean not null default true;

create unique index if not exists vexora_one_open_shift_per_player
  on public.vexora_duty_shifts (guild_id,user_id) where ended_at is null;
create index if not exists vexora_duty_history_idx
  on public.vexora_duty_shifts (guild_id,user_id,started_at desc);

alter table public.vexora_job_profiles enable row level security;
alter table public.vexora_duty_shifts enable row level security;
revoke all on public.vexora_job_profiles from public,anon,authenticated;
revoke all on public.vexora_duty_shifts from public,anon,authenticated;
grant all on public.vexora_job_profiles to service_role;
grant all on public.vexora_duty_shifts to service_role;
grant usage,select on sequence public.vexora_duty_shifts_id_seq to service_role;

drop policy if exists vexora_job_profiles_deny_anon on public.vexora_job_profiles;
create policy vexora_job_profiles_deny_anon on public.vexora_job_profiles
  for all to anon using (false) with check (false);
drop policy if exists vexora_job_profiles_deny_authenticated on public.vexora_job_profiles;
create policy vexora_job_profiles_deny_authenticated on public.vexora_job_profiles
  for all to authenticated using (false) with check (false);
drop policy if exists vexora_duty_shifts_deny_anon on public.vexora_duty_shifts;
create policy vexora_duty_shifts_deny_anon on public.vexora_duty_shifts
  for all to anon using (false) with check (false);
drop policy if exists vexora_duty_shifts_deny_authenticated on public.vexora_duty_shifts;
create policy vexora_duty_shifts_deny_authenticated on public.vexora_duty_shifts
  for all to authenticated using (false) with check (false);

create or replace function public.vexora_choose_job(
  p_guild_id text,p_user_id text,p_job text,p_hourly_rate integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile public.vexora_job_profiles%rowtype;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Ungültige Discord-ID';
  end if;
  if p_job not in ('police','fire','ems','trucker') then raise exception 'Unbekannter Beruf'; end if;
  if p_hourly_rate < 1 or p_hourly_rate > 1000 then raise exception 'Ungültiger Stundenlohn'; end if;

  insert into public.vexora_job_profiles(guild_id,user_id,job,hourly_rate)
  values(p_guild_id,p_user_id,p_job,p_hourly_rate)
  on conflict(guild_id,user_id) do nothing;

  select * into v_profile from public.vexora_job_profiles
  where guild_id=p_guild_id and user_id=p_user_id for update;
  if v_profile.job <> p_job then
    raise exception 'Diese Person hat bereits einen anderen Beruf. Umschulung wird später ergänzt.';
  end if;

  update public.vexora_job_profiles set is_active=true,updated_at=pg_catalog.now()
  where guild_id=p_guild_id and user_id=p_user_id;

  return pg_catalog.jsonb_build_object(
    'job',v_profile.job,'rank_name',v_profile.rank_name,
    'hourly_rate',v_profile.hourly_rate,'balance',v_profile.balance,'is_active',true
  );
end;
$$;

create or replace function public.vexora_get_job_profile(p_guild_id text,p_user_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile public.vexora_job_profiles%rowtype;
declare v_shift public.vexora_duty_shifts%rowtype;
declare v_on_duty boolean := false;
begin
  select * into v_profile from public.vexora_job_profiles
  where guild_id=p_guild_id and user_id=p_user_id;
  if not found then return pg_catalog.jsonb_build_object('has_job',false); end if;

  select * into v_shift from public.vexora_duty_shifts
  where guild_id=p_guild_id and user_id=p_user_id and ended_at is null
  order by started_at desc limit 1;
  v_on_duty := found;

  return pg_catalog.jsonb_build_object(
    'has_job',true,'job',v_profile.job,'rank_name',v_profile.rank_name,
    'hourly_rate',v_profile.hourly_rate,'balance',v_profile.balance,
    'is_active',v_profile.is_active,'on_duty',v_on_duty,
    'started_at',case when v_on_duty then v_shift.started_at else null end
  );
end;
$$;

create or replace function public.vexora_start_shift(p_guild_id text,p_user_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile public.vexora_job_profiles%rowtype;
declare v_shift_id bigint;
declare v_started_at timestamptz := pg_catalog.now();
begin
  select * into v_profile from public.vexora_job_profiles
  where guild_id=p_guild_id and user_id=p_user_id for update;
  if not found then raise exception 'Die Leitstelle muss dich zuerst einstellen.'; end if;
  if not v_profile.is_active then raise exception 'Dein Beruf ist derzeit nicht aktiv.'; end if;

  insert into public.vexora_duty_shifts(guild_id,user_id,job,hourly_rate,started_at)
  values(p_guild_id,p_user_id,v_profile.job,v_profile.hourly_rate,v_started_at)
  returning id into v_shift_id;

  return pg_catalog.jsonb_build_object(
    'shift_id',v_shift_id,'job',v_profile.job,
    'hourly_rate',v_profile.hourly_rate,'started_at',v_started_at
  );
exception when unique_violation then
  raise exception 'Du bist bereits eingestempelt.';
end;
$$;

create or replace function public.vexora_end_shift(p_guild_id text,p_user_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_shift public.vexora_duty_shifts%rowtype;
declare v_minutes integer;
declare v_earned bigint;
declare v_balance bigint;
declare v_ended_at timestamptz := pg_catalog.now();
begin
  select * into v_shift from public.vexora_duty_shifts
  where guild_id=p_guild_id and user_id=p_user_id and ended_at is null
  order by started_at desc limit 1 for update;
  if not found then raise exception 'Du bist aktuell nicht eingestempelt.'; end if;

  v_minutes := greatest(1,pg_catalog.floor(extract(epoch from (v_ended_at-v_shift.started_at))/60)::integer);
  v_earned := pg_catalog.floor((v_minutes::numeric*v_shift.hourly_rate::numeric)/60)::bigint;

  update public.vexora_duty_shifts
  set ended_at=v_ended_at,duration_minutes=v_minutes,earned=v_earned
  where id=v_shift.id;

  update public.vexora_job_profiles
  set balance=balance+v_earned,updated_at=v_ended_at
  where guild_id=p_guild_id and user_id=p_user_id
  returning balance into v_balance;

  return pg_catalog.jsonb_build_object(
    'job',v_shift.job,'started_at',v_shift.started_at,'ended_at',v_ended_at,
    'duration_minutes',v_minutes,'hourly_rate',v_shift.hourly_rate,
    'earned',v_earned,'balance',v_balance
  );
end;
$$;

create or replace function public.vexora_deactivate_job(p_guild_id text,p_user_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile public.vexora_job_profiles%rowtype;
begin
  select * into v_profile from public.vexora_job_profiles
  where guild_id=p_guild_id and user_id=p_user_id for update;
  if not found then raise exception 'Für diese Person ist kein Beruf hinterlegt.'; end if;
  if exists (
    select 1 from public.vexora_duty_shifts
    where guild_id=p_guild_id and user_id=p_user_id and ended_at is null
  ) then
    raise exception 'Die Person ist noch im Dienst und muss sich zuerst ausstempeln.';
  end if;

  update public.vexora_job_profiles set is_active=false,updated_at=pg_catalog.now()
  where guild_id=p_guild_id and user_id=p_user_id;

  return pg_catalog.jsonb_build_object('job',v_profile.job,'is_active',false);
end;
$$;

revoke all on function public.vexora_choose_job(text,text,text,integer) from public,anon,authenticated;
revoke all on function public.vexora_get_job_profile(text,text) from public,anon,authenticated;
revoke all on function public.vexora_start_shift(text,text) from public,anon,authenticated;
revoke all on function public.vexora_end_shift(text,text) from public,anon,authenticated;
revoke all on function public.vexora_deactivate_job(text,text) from public,anon,authenticated;
grant execute on function public.vexora_choose_job(text,text,text,integer) to service_role;
grant execute on function public.vexora_get_job_profile(text,text) to service_role;
grant execute on function public.vexora_start_shift(text,text) to service_role;
grant execute on function public.vexora_end_shift(text,text) to service_role;
grant execute on function public.vexora_deactivate_job(text,text) to service_role;
