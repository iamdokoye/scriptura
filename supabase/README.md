# Scriptura accounts and the Ask Scripture gateway (Supabase)

This folder is the backend for **accounts** and for **Ask Scripture** when people use it through their account:

```
Scriptura app ──(signed-in session)──▶ Edge Function "search" ──▶ Modal GPU service
                                          │  checks the session, applies the daily limit
                                          ▼
                                       Postgres (profiles, usage counters)
```

- **Sign-in** is a one-time code sent by email. There are no passwords to store or reset.
- **The Modal token lives only in Supabase secrets.** The app never contains it, so there's nothing to extract from the download.
- **Results carry a `confidence` label** (match, related or unchecked) from the service's accuracy check. The gateway passes it through and the app shows it.
- **You can see your users** in the dashboard (Authentication → Users) and with the queries at the bottom of this page.

| File | What it is |
|---|---|
| `migrations/…_accounts_and_search_usage.sql` | Profiles, per-day usage counters, limit checks, row-level security |
| `functions/search/handler.ts` | The gateway's logic (auth check, limits, forwarding to Modal) |
| `functions/search/index.ts` | Wires the logic to Supabase and Modal |
| `config.toml` | CLI settings; the function requires a valid session |

## Set up

You need the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and the Modal service from `services/scripture-search` already deployed, with its proxy token.

### 1. Create the project and push the schema

Create a project at supabase.com and note its **project ref** (the part before `.supabase.co`). Then:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

### 2. Make the emails send a code

Dashboard → **Authentication → Emails**. Edit **both** the *Magic Link* and the *Confirm signup* templates so they include the code. A returning user gets one, a brand-new user gets the other:

```html
<h2>Your Scriptura sign-in code</h2>
<p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
```

### 3. Set up real email sending (do this before launch)

Supabase's built-in email sender allows only **2 emails per hour** for the whole project. That is fine while you test and useless for real users. Dashboard → **Authentication → Emails → SMTP Settings**: connect an email provider (Resend, Postmark, SES and similar all work) and use an address on a domain you own.

### 4. Give the gateway its secrets

Use the endpoint URL and the proxy token you created for the Modal service:

```bash
supabase secrets set \
  MODAL_URL="https://YOUR-WORKSPACE--scriptura-scripture-search-scripturesearch-search.modal.run" \
  MODAL_KEY="wk-…" \
  MODAL_SECRET="ws-…"
```

Optional limits (the defaults are shown):

```bash
supabase secrets set FREE_DAILY_LIMIT=50 GLOBAL_DAILY_LIMIT=3000
```

`FREE_DAILY_LIMIT` is searches per user per day. `GLOBAL_DAILY_LIMIT` is the circuit breaker for everyone combined.

### 5. Deploy the function

```bash
supabase functions deploy search
```

### 6. Point the app at the project

Dashboard → **Project Settings → API**. Copy the **Project URL** and the **anon / publishable key**. Both are public values, safe to ship. Never put the `service_role` key in the app.

For development, copy `.env.example` to `.env.local` and fill them in, then `npm run tauri dev`.

For release builds, add two **repository variables** in GitHub (Settings → Secrets and variables → Actions → Variables): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The build workflow passes them in.

## How the limits work

- Each search counts against the user's daily allowance (UTC day) and against the global one. If the Modal service fails, the search is given back.
- The silent "wake the GPU" ping when the panel opens isn't a search, but it is capped (20 a day per user) so it can't be used to keep the GPU running.
- The counters are updated in one locked database step, so two searches sent at the same instant can't both squeeze under a limit.
- Cost is bounded on the Modal side too: `max_containers=1` in `modal_app.py` means the GPU can never cost more than one L4 running all day.

Users can't change their own plan or counters. The app's key can only *read* a user's own profile and usage, and only the gateway can write.

## See your users

Dashboard → **SQL Editor**:

```sql
-- how many accounts
select count(*) as total_users from public.profiles;

-- sign-ups per day
select created_at::date as day, count(*) as signups
from public.profiles group by 1 order by 1 desc limit 30;

-- active users and searches per day
select * from public.admin_daily_stats limit 30;

-- your heaviest users this week
select p.email, sum(u.searches) as searches
from public.search_usage u join public.profiles p on p.id = u.user_id
where u.day > now()::date - 7
group by p.email order by searches desc limit 20;
```

The gateway stores counts, never the text of anyone's questions.

## Check it from a terminal

Get a session token by signing in through the app, or in the dashboard under Authentication → Users. Then:

```bash
curl -X POST "https://YOUR-PROJECT-REF.supabase.co/functions/v1/search" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "Jesus calms the storm", "top_k": 5}'
```

A missing or invalid token returns `401`; hitting the daily limit returns `429`.

## Things to know

- **Cold starts.** After a quiet spell the first search waits for the GPU container to boot. The function allows up to 120 seconds; Supabase's own limit is 150 seconds on the free plan.
- **Free projects pause** after a period of inactivity, which would take sign-in down with it. Check Supabase's current rules and move to a paid plan before you have real users.
- **Plans.** `profiles.plan` is `free` for everyone today and nothing checks it yet. When you add paid plans, the gateway can read it and raise the limit.
