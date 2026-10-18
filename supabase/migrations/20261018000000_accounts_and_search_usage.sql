-- Accounts and Ask Scripture usage.
--
-- Supabase Auth owns the users (auth.users). This adds a public profile row per user
-- (what you query to see how many people you have and what plan they're on), and the
-- counters the search gateway uses to enforce daily limits.
--
-- Nothing here is writable from the app: the app's key can only read a user's own rows.
-- All writes happen in the gateway (service role) or in the triggers below.

-- ── Profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  plan         text not null default 'free',   -- 'free' now; paid plans later
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Every new sign-up gets a profile.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anyone who signed up before this migration ran.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ── Usage counters ──────────────────────────────────────────────────────────

create table public.search_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,                       -- UTC day
  searches int  not null default 0,
  warmups  int  not null default 0,             -- silent pings that wake the GPU
  primary key (user_id, day)
);

-- One row per day across all users: the circuit breaker that caps total spend.
create table public.search_global (
  day      date primary key,
  searches int not null default 0
);

alter table public.search_usage  enable row level security;
alter table public.search_global enable row level security;

create policy "Users can read their own usage"
  on public.search_usage for select to authenticated
  using (user_id = (select auth.uid()));
-- search_global has no policy: nobody but the service role can touch it.

-- ── Counting ────────────────────────────────────────────────────────────────

-- Atomically checks a user's limits and, if allowed, counts the request. One call is one
-- transaction and the rows are locked while it runs, so two simultaneous searches can't
-- both slip under a limit.
create function public.consume_search(
  p_user         uuid,
  p_kind         text,    -- 'search' or 'warmup'
  p_user_limit   int,
  p_global_limit int
)
returns table (allowed boolean, reason text, used int, remaining int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day    date := (now() at time zone 'utc')::date;
  v_used   int;
  v_warm   int;
  v_global int;
begin
  insert into public.search_usage (user_id, day) values (p_user, v_day)
    on conflict (user_id, day) do nothing;
  insert into public.search_global (day) values (v_day)
    on conflict (day) do nothing;

  select u.searches, u.warmups into v_used, v_warm
    from public.search_usage u
    where u.user_id = p_user and u.day = v_day
    for update;
  select g.searches into v_global
    from public.search_global g
    where g.day = v_day
    for update;

  update public.profiles set last_seen_at = now() where id = p_user;

  if p_kind = 'warmup' then
    if v_warm >= 20 then
      return query select false, 'warmup_limit'::text, v_used, greatest(p_user_limit - v_used, 0);
      return;
    end if;
    update public.search_usage set warmups = v_warm + 1
      where user_id = p_user and day = v_day;
    return query select true, 'ok'::text, v_used, greatest(p_user_limit - v_used, 0);
    return;
  end if;

  if v_used >= p_user_limit then
    return query select false, 'user_limit'::text, v_used, 0;
    return;
  end if;
  if v_global >= p_global_limit then
    return query select false, 'global_limit'::text, v_used, greatest(p_user_limit - v_used, 0);
    return;
  end if;

  update public.search_usage set searches = v_used + 1
    where user_id = p_user and day = v_day;
  update public.search_global set searches = v_global + 1 where day = v_day;
  return query select true, 'ok'::text, v_used + 1, p_user_limit - (v_used + 1);
end;
$$;

-- Gives a search back when the GPU service failed, so an outage doesn't eat the quota.
create function public.refund_search(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  update public.search_usage set searches = greatest(searches - 1, 0)
    where user_id = p_user and day = v_day;
  update public.search_global set searches = greatest(searches - 1, 0)
    where day = v_day;
end;
$$;

-- Only the gateway (service role) may call these. Without this, any signed-in user could
-- call them through the API and reset or inflate counters.
revoke all on function public.consume_search(uuid, text, int, int) from public, anon, authenticated;
revoke all on function public.refund_search(uuid)                  from public, anon, authenticated;
grant execute on function public.consume_search(uuid, text, int, int) to service_role;
grant execute on function public.refund_search(uuid)                  to service_role;

-- ── Your dashboard numbers ──────────────────────────────────────────────────

-- Run in the SQL editor:
--   select count(*) as total_users from public.profiles;
--   select * from public.admin_daily_stats limit 30;
create view public.admin_daily_stats
  with (security_invoker = true) as
select
  day,
  count(*) filter (where searches > 0) as active_users,
  sum(searches)                        as searches
from public.search_usage
group by day
order by day desc;

revoke all on public.admin_daily_stats from anon, authenticated;
