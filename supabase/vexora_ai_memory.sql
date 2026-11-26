-- Stores a user's explicitly provided preferred name for VEXORA AI.
alter table public.vexora_bot_users
  add column if not exists preferred_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vexora_bot_users_preferred_name_length'
      and conrelid = 'public.vexora_bot_users'::regclass
  ) then
    alter table public.vexora_bot_users
      add constraint vexora_bot_users_preferred_name_length
      check (preferred_name is null or char_length(preferred_name) between 1 and 32);
  end if;
end $$;
