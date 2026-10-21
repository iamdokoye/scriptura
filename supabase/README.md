# Scriptura Backend: Supabase Gateway & Database

This directory contains the complete backend for Scriptura's **Accounts** and **Ask Scripture** ("Ask Scripture" natural-language verse finder):

```
Scriptura Desktop App ──(user session JWT)──▶ Supabase Edge Function `search` ──▶ Anthropic API (Haiku 5.5)
                                                      │                      └─▶ (optional) Modal GPU service
                                                      ▼
                                   Postgres: profiles, plans, usage counters, kjv_verses
```

### Highlights
- **Zero-knowledge on the client**: Users sign in with their email address (one-time code, no password). They never enter an API key or touch a console.
- **Third-party credentials live only in Supabase secrets**: The Anthropic API key (`ANTHROPIC_API_KEY`) and optional Modal credentials never ship in the client app or enter the webview.
- **Strict verification against ground truth**: Model nominations are cross-referenced with `kjv_verses` in Postgres to drop hallucinated books or chapters and clamp verses before a second Claude pass verifies them against the real King James text.
- **Privacy & cost control**: The user's question text is sent in-memory over TLS to Anthropic to locate passages and is **never stored in the database, never written to function logs, and never retained by Scriptura**.
- **Transparent cost tracking**: Token usage is captured atomically per user in `search_usage`, with live daily cost estimates computed against `model_prices`.

---

## What each search costs

Ask Scripture uses **Claude Haiku 5.5** by default:
- **Input rate**: $0.10 per million tokens ($0.0000001 / token)
- **Output rate**: $0.50 per million tokens ($0.0000005 / token)

A typical search performs two small stages:
1. **Nomination**: Haiku reads the description and nominates up to 12 candidate passages (~250 input tokens, ~80 output tokens) ≈ **$0.000065**
2. **Verification**: Haiku reads the real KJV text of the candidates and rules `match`, `related`, or `no` (~1,200 input tokens, ~50 output tokens) ≈ **$0.000145**

**Total cost per search**: **~$0.00021** (roughly **one fiftieth of a single US cent**).
5,000 natural-language scripture searches cost approximately **$1.00**.

---

## Directory Structure

| Path | Purpose |
|---|---|
| `migrations/20261018000000_accounts_and_search_usage.sql` | Initial schema: profiles, usage tables, row-level security. |
| `migrations/20261021000000_kjv_verses_plans_costs.sql` | KJV database table (31,102 verses), plans table, cost estimation, retention. |
| `seed/seed_kjv.ts` | Seed script for KJV verses with canonical checksum verification. |
| `functions/search/` | Edge Function gateway (`handler.ts` pure logic + `index.ts` Deno wiring). |
| `functions/delete-account/` | Edge Function for privacy-compliant user deletion via Supabase Admin API. |
| `tests/` | SQL security and migration tests via PGlite. |
| `config.toml` | Supabase CLI project and function configuration. |

---

## Step-by-Step Runbook: Deployment & Operations

### 1. Create your Supabase project
1. Go to [database.new](https://database.new) and create a new project.
2. Note your **Project Reference ID** (e.g. `abcdefghijklmnopqrst`), located in Project Settings.

### 2. Install CLI and link project
Ensure you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed:
```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

### 3. Push database migrations
Apply the migrations to create `profiles`, `plans`, `search_usage`, `model_prices`, and `kjv_verses`:
```bash
supabase db push
```

### 4. Seed the King James Bible (31,102 verses)
Run the seed script to populate `public.kjv_verses`. It downloads the public-domain KJV dataset, formats canonical book names, strips translator markers, and asserts exactly 31,102 verses and 66 books:

**Option A — Direct via Supabase Service Role:**
```bash
SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="ey..." \
node --experimental-strip-types supabase/seed/seed_kjv.ts
```

**Option B — Export and execute SQL:**
```bash
node --experimental-strip-types supabase/seed/seed_kjv.ts --sql-file supabase/seed/kjv_verses.sql
supabase db query < supabase/seed/kjv_verses.sql
```

The script prints the SHA-256 content checksum:
```
[seed] Parsed verses:  31102
[seed] Canonical books: 66
[seed] SHA-256 digest:  0849b9da4dc28fe738832c7cc38193666800e3dd45cc52453118344ba86be867
```

### 5. Configure Auth & Email (OTP One-Time Code)

#### Email Templates
In the Supabase Dashboard, go to **Authentication → Email Templates**:
1. Open **Magic Link**:
   - Subject: `Your Scriptura sign-in code`
   - Body:
     ```html
     <h2>Your Scriptura sign-in code</h2>
     <p>Enter this 6-digit code in the app to sign in:</p>
     <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">{{ .Token }}</p>
     <p>This code expires in 10 minutes.</p>
     ```
2. Open **Confirm signup**:
   - Subject: `Confirm your Scriptura account`
   - Body:
     ```html
     <h2>Welcome to Scriptura</h2>
     <p>Enter this 6-digit code to complete sign-in:</p>
     <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">{{ .Token }}</p>
     ```

#### Custom SMTP (Required for Production)
> [!IMPORTANT]
> The default Supabase email service is strictly capped at **2 emails per hour**. For real users, you must configure a custom SMTP provider (e.g. Resend, Postmark, SendGrid, or AWS SES).
- In Dashboard, go to **Authentication → SMTP Settings**.
- Enable **Custom SMTP** and enter your provider's host, port, username, and password.
- Use a sender address on a verified domain you own (e.g. `auth@scriptura.app`).

#### Rate Limiting & Expiry
- In **Authentication → Rate Limits**:
  - Email rate limit: 30 emails per hour per IP.
  - OTP expiry: set to `600` seconds (10 minutes).

### 6. Set Edge Function Secrets
Set your Anthropic API key and configuration secrets in Supabase:
```bash
supabase secrets set \
  ANTHROPIC_API_KEY="sk-ant-api03-..." \
  NOMINATE_MODEL="claude-haiku-5-5" \
  VERIFY_MODEL="claude-haiku-5-5" \
  FREE_DAILY_LIMIT=50 \
  GLOBAL_DAILY_LIMIT=3000 \
  SEARCH_BACKEND="claude"
```

*(Optional: If routing to a Modal GPU deployment, set `SEARCH_BACKEND="modal"`, `MODAL_URL="..."`, `MODAL_KEY="..."`, and `MODAL_SECRET="..."`)*.

### 7. Deploy Edge Functions
Deploy the `search` gateway and `delete-account` functions:
```bash
supabase functions deploy search
supabase functions deploy delete-account
```

### 8. Point the Scriptura App at the Project
Retrieve your public values from **Project Settings → API**:
- **Project URL**: `https://YOUR-PROJECT-REF.supabase.co`
- **Anon / Public Key**: `ey...`

1. **Local Development**:
   Create `.env.local` in the project root:
   ```bash
   VITE_SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
   VITE_SUPABASE_ANON_KEY="eyJhbGciOi..."
   ```
   Start the app:
   ```bash
   npm run tauri dev
   ```

2. **CI / Production Builds**:
   Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository variables in GitHub (**Settings → Secrets and variables → Actions → Variables**). The release workflow embeds them during `npm run build`.

---

## Key Rotation Procedure

To rotate your Anthropic API key without downtime:
1. Create a new API key in the [Anthropic Console](https://console.anthropic.com/).
2. Update the secret in Supabase:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY="sk-ant-new-key-..."
   ```
3. Supabase automatically restarts Edge Function workers with the new environment variable within seconds.
4. Verify by running a test search in the app.
5. Deactivate and delete the old key in the Anthropic Console.

---

## Monitoring: Users, Searches, and Costs

Run these queries in the Supabase **SQL Editor**:

### Total registered accounts
```sql
select count(*) as total_users from public.profiles;
```

### Active users and searches today
```sql
select
  count(*) filter (where searches > 0) as active_users_today,
  coalesce(sum(searches), 0)           as total_searches_today
from public.search_usage
where day = (now() at time zone 'utc')::date;
```

### Daily active users, total searches, tokens, and estimated cost (Last 30 days)
```sql
select
  day,
  active_users,
  searches,
  input_tokens,
  output_tokens,
  estimated_cost_usd
from public.admin_daily_stats
order by day desc
limit 30;
```

### Top active users today
```sql
select
  p.email,
  p.plan,
  u.searches,
  u.input_tokens,
  u.output_tokens,
  p.last_seen_at
from public.search_usage u
join public.profiles p on p.id = u.user_id
where u.day = (now() at time zone 'utc')::date
order by u.searches desc
limit 20;
```

---

## Troubleshooting

- **No sign-in code arrives, or the email has a link and no code**:
  1. **Template.** The email only contains a code if the template shows `{{ .Token }}`. Open Dashboard → **Authentication → Emails** and paste `supabase/templates/magic_link.html` into **Magic Link** and `supabase/templates/confirmation.html` into **Confirm signup**. Existing people get the first, brand-new people get the second, so both need it. Save each.
  2. **Built-in sender limits.** Without custom SMTP, Supabase only emails addresses that belong to your own Supabase team and caps it at about 2 emails an hour. Anyone else gets nothing or an error. Set up **Custom SMTP** (above) with a verified sender domain.
  3. **Spam folder and delay.** Codes can take a minute. Check spam, then use "Resend code" in the app (one request per address per minute).
  4. **Look at the log.** Dashboard → **Logs → Auth** shows each attempt with the exact reason it failed (rate limit, SMTP error, address not authorized).
- **User receives 401 Unauthorized**:
  - The JWT session has expired or is invalid. The app prompts the user to re-authenticate.
- **User receives 429 Limit Exceeded**:
  - `user_limit`: The user exceeded their plan's daily limit (50 on the free plan). Counters reset at 00:00 UTC.
  - `global_limit`: The total searches across all users reached `GLOBAL_DAILY_LIMIT` (circuit breaker). Increase the secret if capacity allows:
    `supabase secrets set GLOBAL_DAILY_LIMIT=5000`
- **User receives 502 Bad Gateway / Nominate Failed**:
  - The Anthropic API call failed or timed out. The user's search was automatically refunded by `refund_search`.
- **Database seed row count mismatch**:
  - If `seed_kjv.ts` fails, verify that your source file wasn't truncated. The seed requires exactly 31,102 rows across all 66 canonical books.
