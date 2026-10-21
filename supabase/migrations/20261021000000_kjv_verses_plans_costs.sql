-- ── KJV Verses, Plans, and Cost Tracking ─────────────────────────────────
--
-- Adds:
-- 1. kjv_verses: The full King James Bible (31,102 verses across 66 books).
-- 2. plans: Tiered search quotas ('free' = 50 searches/day).
-- 3. consume_search: Updated to look up user quota from plans table.
-- 4. search_usage tokens and record_usage: Tracks input/output token usage.
-- 5. model_prices and admin_daily_stats: Live cost estimation.
-- 6. Retention: Daily purge of search_usage older than 90 days via pg_cron.

-- ── 1. KJV Verses ──────────────────────────────────────────────────────────

create table public.kjv_verses (
  book       text     not null,
  chapter    smallint not null,
  verse      smallint not null,
  text       text     not null,
  book_order smallint not null check (book_order between 1 and 66),
  primary key (book, chapter, verse)
);

create index kjv_verses_book_chapter_idx on public.kjv_verses (book, chapter);

-- RLS enabled with NO policies: only service_role can read or write.
-- The app cannot bulk-download the Bible through the Supabase API.
alter table public.kjv_verses enable row level security;
revoke all on public.kjv_verses from public, anon, authenticated;

-- Helper RPCs for the search gateway (service role only) to validate
-- candidate references and fetch passage excerpts in single round-trips.

create or replace function public.get_chapter_spans(p_chapters jsonb)
returns table (book text, chapter smallint, min_verse smallint, max_verse smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.book, v.chapter, min(v.verse) as min_verse, max(v.verse) as max_verse
  from public.kjv_verses v
  inner join jsonb_to_recordset(p_chapters) as c(book text, chapter smallint)
    on v.book = c.book and v.chapter = c.chapter
  group by v.book, v.chapter;
$$;

revoke all on function public.get_chapter_spans(jsonb) from public, anon, authenticated;
grant execute on function public.get_chapter_spans(jsonb) to service_role;

create or replace function public.get_passage_texts(p_passages jsonb, p_max_verses smallint default 6)
returns table (book text, chapter smallint, verse_start smallint, verse_end smallint, excerpt text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.book,
    p.chapter,
    p.verse_start,
    p.verse_end,
    string_agg(v.text, ' ' order by v.verse) as excerpt
  from jsonb_to_recordset(p_passages) as p(book text, chapter smallint, verse_start smallint, verse_end smallint)
  inner join public.kjv_verses v
    on v.book = p.book
   and v.chapter = p.chapter
   and v.verse >= p.verse_start
   and v.verse <= least(p.verse_end, (p.verse_start + p_max_verses - 1)::smallint)
  group by p.book, p.chapter, p.verse_start, p.verse_end;
$$;

revoke all on function public.get_passage_texts(jsonb, smallint) from public, anon, authenticated;
grant execute on function public.get_passage_texts(jsonb, smallint) to service_role;

-- ── 2. Plans ───────────────────────────────────────────────────────────────

create table public.plans (
  plan           text primary key,
  daily_searches int  not null check (daily_searches >= 0)
);

alter table public.plans enable row level security;

-- Authenticated users can read available plans.
create policy "Authenticated users can read plans"
  on public.plans for select to authenticated
  using (true);

insert into public.plans (plan, daily_searches) values
  ('free', 50)
on conflict (plan) do update set daily_searches = excluded.daily_searches;

-- Ensure profiles.plan references plans table.
alter table public.profiles
  drop constraint if exists profiles_plan_fkey,
  add constraint profiles_plan_fkey foreign key (plan) references public.plans (plan) on update cascade;

-- ── 3. Consume Search (Plan-based) ─────────────────────────────────────────

-- Drop legacy 4-parameter version from the first migration.
drop function if exists public.consume_search(uuid, text, int, int);

-- Atomically checks a user's plan limit and global cap, and counts the search.
create or replace function public.consume_search(
  p_user         uuid,
  p_kind         text,    -- 'search' or 'warmup'
  p_global_limit int
)
returns table (allowed boolean, reason text, used int, remaining int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day        date := (now() at time zone 'utc')::date;
  v_used       int;
  v_warm       int;
  v_global     int;
  v_user_limit int;
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

  -- Look up daily limit from the user's plan, defaulting to 50 if missing.
  select coalesce(pl.daily_searches, 50) into v_user_limit
    from public.profiles p
    left join public.plans pl on pl.plan = p.plan
    where p.id = p_user;

  if v_user_limit is null then
    v_user_limit := 50;
  end if;

  update public.profiles set last_seen_at = now() where id = p_user;

  if p_kind = 'warmup' then
    if v_warm >= 20 then
      return query select false, 'warmup_limit'::text, v_used, greatest(v_user_limit - v_used, 0);
      return;
    end if;
    update public.search_usage set warmups = v_warm + 1
      where user_id = p_user and day = v_day;
    return query select true, 'ok'::text, v_used, greatest(v_user_limit - v_used, 0);
    return;
  end if;

  if v_used >= v_user_limit then
    return query select false, 'user_limit'::text, v_used, 0;
    return;
  end if;
  if v_global >= p_global_limit then
    return query select false, 'global_limit'::text, v_used, greatest(v_user_limit - v_used, 0);
    return;
  end if;

  update public.search_usage set searches = v_used + 1
    where user_id = p_user and day = v_day;
  update public.search_global set searches = v_global + 1 where day = v_day;
  return query select true, 'ok'::text, v_used + 1, v_user_limit - (v_used + 1);
end;
$$;

revoke all on function public.consume_search(uuid, text, int) from public, anon, authenticated;
grant execute on function public.consume_search(uuid, text, int) to service_role;

-- ── 4. Token & Cost Tracking ───────────────────────────────────────────────

alter table public.search_usage
  add column if not exists input_tokens  bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0;

create or replace function public.record_usage(
  p_user   uuid,
  p_input  bigint,
  p_output bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  insert into public.search_usage (user_id, day, input_tokens, output_tokens)
  values (p_user, v_day, greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0))
  on conflict (user_id, day) do update set
    input_tokens  = search_usage.input_tokens + greatest(coalesce(excluded.input_tokens, 0), 0),
    output_tokens = search_usage.output_tokens + greatest(coalesce(excluded.output_tokens, 0), 0);
end;
$$;

revoke all on function public.record_usage(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_usage(uuid, bigint, bigint) to service_role;

create table public.model_prices (
  model                   text primary key,
  input_rate_per_million  numeric(10, 4) not null,
  output_rate_per_million numeric(10, 4) not null,
  updated_at              timestamptz not null default now()
);

alter table public.model_prices enable row level security;
revoke all on public.model_prices from public, anon, authenticated;

-- Seed rates for Haiku 5.5 ($0.10/M input, $0.50/M output) and legacy/alternate models.
insert into public.model_prices (model, input_rate_per_million, output_rate_per_million) values
  ('claude-haiku-5-5', 0.1000, 0.5000),
  ('claude-3-5-haiku-20241022', 0.8000, 4.0000),
  ('claude-sonnet-5-5', 3.0000, 15.0000)
on conflict (model) do update set
  input_rate_per_million = excluded.input_rate_per_million,
  output_rate_per_million = excluded.output_rate_per_million,
  updated_at = now();

-- Extended admin_daily_stats with token counts and estimated USD cost.
drop view if exists public.admin_daily_stats;
create view public.admin_daily_stats
  with (security_invoker = true) as
select
  u.day,
  count(*) filter (where u.searches > 0) as active_users,
  coalesce(sum(u.searches), 0)           as searches,
  coalesce(sum(u.input_tokens), 0)       as input_tokens,
  coalesce(sum(u.output_tokens), 0)      as output_tokens,
  round(
    coalesce(
      sum(
        (u.input_tokens::numeric / 1000000.0 * coalesce(p.input_rate_per_million, 0.1000)) +
        (u.output_tokens::numeric / 1000000.0 * coalesce(p.output_rate_per_million, 0.5000))
      ),
      0
    ),
    4
  ) as estimated_cost_usd
from public.search_usage u
left join lateral (
  select input_rate_per_million, output_rate_per_million
  from public.model_prices
  where model = 'claude-haiku-5-5'
  limit 1
) p on true
group by u.day
order by u.day desc;

revoke all on public.admin_daily_stats from anon, authenticated;

-- ── 5. Retention: pg_cron Cleanup (90 days) ────────────────────────────────

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule('purge-old-search-usage')
    where exists (select 1 from cron.job where jobname = 'purge-old-search-usage');

    perform cron.schedule(
      'purge-old-search-usage',
      '0 3 * * *',
      'delete from public.search_usage where day < (now() at time zone ''utc'')::date - 90'
    );
  end if;
exception when others then
  raise notice 'pg_cron job schedule skipped: %', sqlerrm;
end;
$$;
