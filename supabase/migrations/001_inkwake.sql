-- InkWake GP: profiles, race results, leaderboard
-- Run in Supabase SQL editor (or via CLI) after linking the project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  boat_color integer not null default 16742456, -- #ff7a38
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  finish_time_ms integer not null,
  best_lap_ms integer,
  position integer not null check (position between 1 and 4),
  laps integer not null default 3,
  boat_color integer not null,
  missed_gates integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists race_results_user_id_idx on public.race_results (user_id);
create index if not exists race_results_finish_time_idx on public.race_results (finish_time_ms);
create index if not exists race_results_created_at_idx on public.race_results (created_at desc);

alter table public.profiles enable row level security;
alter table public.race_results enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Race results are viewable by everyone"
  on public.race_results for select using (true);

create policy "Users can insert own race results"
  on public.race_results for insert with check (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Leaderboard view: best (fastest) finish per user who won a race
-- security_invoker so RLS on underlying tables still applies
create or replace view public.leaderboard
with (security_invoker = true)
as
select distinct on (p.id)
  p.id as user_id,
  p.display_name,
  p.avatar_url,
  r.finish_time_ms,
  r.best_lap_ms,
  r.position,
  r.boat_color,
  r.created_at
from public.race_results r
join public.profiles p on p.id = r.user_id
where r.position = 1
order by p.id, r.finish_time_ms asc;

grant select on public.leaderboard to anon, authenticated;
