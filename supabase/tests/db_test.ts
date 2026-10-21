import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { PGlite } from "@electric-sql/pglite";

describe("Database migrations and security tests (PGlite)", () => {
  let db: PGlite;

  test("Setup test database and run migrations", async () => {
    db = new PGlite();

    // 1. Stub Supabase auth schema and helper functions
    await db.exec(`
      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key default gen_random_uuid(),
        email text
      );
      create or replace function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;

      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
    `);

    // 2. Run first migration
    const mig1Path = path.resolve("supabase/migrations/20261018000000_accounts_and_search_usage.sql");
    const mig1Sql = fs.readFileSync(mig1Path, "utf8");
    await db.exec(mig1Sql);

    // 3. Run second migration
    const mig2Path = path.resolve("supabase/migrations/20261021000000_kjv_verses_plans_costs.sql");
    const mig2Sql = fs.readFileSync(mig2Path, "utf8");
    await db.exec(mig2Sql);
  });

  test("Plan-based limit and quota consumption", async () => {
    // Create test user
    const userRes = await db.query<{ id: string }>(
      `insert into auth.users (email) values ('user1@scriptura.local') returning id;`
    );
    const userId = userRes.rows[0].id;

    // Verify profile automatically created with plan 'free'
    const profileRes = await db.query<{ plan: string }>(
      `select plan from public.profiles where id = $1;`,
      [userId]
    );
    assert.equal(profileRes.rows[0].plan, "free");

    // Free plan has 50 daily searches
    const planRes = await db.query<{ daily_searches: number }>(
      `select daily_searches from public.plans where plan = 'free';`
    );
    assert.equal(planRes.rows[0].daily_searches, 50);

    // Consume 1 search
    const consume1 = await db.query<{ allowed: boolean; reason: string; used: number; remaining: number }>(
      `select * from public.consume_search($1, 'search', 3000);`,
      [userId]
    );
    assert.equal(consume1.rows[0].allowed, true);
    assert.equal(consume1.rows[0].used, 1);
    assert.equal(consume1.rows[0].remaining, 49);

    // Update user plan to a custom plan with 2 daily searches
    await db.query(`insert into public.plans (plan, daily_searches) values ('trial', 2);`);
    await db.query(`update public.profiles set plan = 'trial' where id = $1;`, [userId]);

    // Consume second search (now 2/2 used)
    const consume2 = await db.query<{ allowed: boolean; reason: string; used: number; remaining: number }>(
      `select * from public.consume_search($1, 'search', 3000);`,
      [userId]
    );
    assert.equal(consume2.rows[0].allowed, true);
    assert.equal(consume2.rows[0].used, 2);
    assert.equal(consume2.rows[0].remaining, 0);

    // Third search must be rejected with user_limit
    const consume3 = await db.query<{ allowed: boolean; reason: string; used: number; remaining: number }>(
      `select * from public.consume_search($1, 'search', 3000);`,
      [userId]
    );
    assert.equal(consume3.rows[0].allowed, false);
    assert.equal(consume3.rows[0].reason, "user_limit");
    assert.equal(consume3.rows[0].remaining, 0);
  });

  test("Refund search floors at zero", async () => {
    const userRes = await db.query<{ id: string }>(
      `insert into auth.users (email) values ('refund_test@scriptura.local') returning id;`
    );
    const userId = userRes.rows[0].id;

    // Refund before any searches: must stay at 0, not go negative
    await db.query(`select public.refund_search($1);`, [userId]);

    const usage = await db.query<{ searches: number }>(
      `select searches from public.search_usage where user_id = $1;`,
      [userId]
    );
    if (usage.rows.length > 0) {
      assert.equal(usage.rows[0].searches, 0);
    }

    // Now consume 1 search, refund twice: must end at 0
    await db.query(`select * from public.consume_search($1, 'search', 3000);`, [userId]);
    await db.query(`select public.refund_search($1);`, [userId]);
    await db.query(`select public.refund_search($1);`, [userId]);

    const usage2 = await db.query<{ searches: number }>(
      `select searches from public.search_usage where user_id = $1;`,
      [userId]
    );
    assert.equal(usage2.rows[0].searches, 0);
  });

  test("Global limit circuit breaker", async () => {
    const userRes = await db.query<{ id: string }>(
      `insert into auth.users (email) values ('global_limit_test@scriptura.local') returning id;`
    );
    const userId = userRes.rows[0].id;

    // Call consume_search with p_global_limit = 0 -> must be rejected with global_limit
    const res = await db.query<{ allowed: boolean; reason: string }>(
      `select * from public.consume_search($1, 'search', 0);`,
      [userId]
    );
    assert.equal(res.rows[0].allowed, false);
    assert.equal(res.rows[0].reason, "global_limit");
  });

  test("Token cost tracking and record_usage", async () => {
    const userRes = await db.query<{ id: string }>(
      `insert into auth.users (email) values ('token_test@scriptura.local') returning id;`
    );
    const userId = userRes.rows[0].id;

    await db.query(`select * from public.consume_search($1, 'search', 3000);`, [userId]);
    await db.query(`select public.record_usage($1, 1000, 200);`, [userId]);
    await db.query(`select public.record_usage($1, 500, 100);`, [userId]);

    const usage = await db.query<{ input_tokens: string; output_tokens: string }>(
      `select input_tokens, output_tokens from public.search_usage where user_id = $1;`,
      [userId]
    );
    assert.equal(Number(usage.rows[0].input_tokens), 1500);
    assert.equal(Number(usage.rows[0].output_tokens), 300);

    // Verify admin_daily_stats view computes estimated cost
    const stats = await db.query<{ searches: string; input_tokens: string; output_tokens: string; estimated_cost_usd: string }>(
      `select * from public.admin_daily_stats limit 1;`
    );
    assert.ok(stats.rows.length > 0);
    assert.ok(Number(stats.rows[0].searches) >= 1);
    assert.ok(Number(stats.rows[0].input_tokens) >= 1500);
    assert.ok(Number(stats.rows[0].estimated_cost_usd) > 0);
  });

  test("Cascade on auth user delete", async () => {
    const userRes = await db.query<{ id: string }>(
      `insert into auth.users (email) values ('cascade_test@scriptura.local') returning id;`
    );
    const userId = userRes.rows[0].id;

    await db.query(`select * from public.consume_search($1, 'search', 3000);`, [userId]);

    // Check profile and usage exist
    const p1 = await db.query(`select id from public.profiles where id = $1;`, [userId]);
    assert.equal(p1.rows.length, 1);
    const u1 = await db.query(`select user_id from public.search_usage where user_id = $1;`, [userId]);
    assert.equal(u1.rows.length, 1);

    // Delete user from auth.users
    await db.query(`delete from auth.users where id = $1;`, [userId]);

    // Both profile and search_usage must be cascaded and deleted
    const p2 = await db.query(`select id from public.profiles where id = $1;`, [userId]);
    assert.equal(p2.rows.length, 0);
    const u2 = await db.query(`select user_id from public.search_usage where user_id = $1;`, [userId]);
    assert.equal(u2.rows.length, 0);
  });

  test("RLS: kjv_verses is unreadable by authenticated or anon", async () => {
    // Insert a dummy verse as superuser
    await db.query(`
      insert into public.kjv_verses (book, chapter, verse, text, book_order)
      values ('Genesis', 1, 1, 'In the beginning God created the heaven and the earth.', 1)
      on conflict do nothing;
    `);

    // Switch to authenticated role
    await db.exec(`set role authenticated;`);

    // Attempt to select from kjv_verses must be rejected or return 0 rows (permission denied)
    await assert.rejects(
      async () => {
        await db.query(`select * from public.kjv_verses;`);
      },
      /permission denied/i
    );

    // Switch back to superuser
    await db.exec(`set role postgres;`);
  });

  test("RLS: user cannot read another user's profile or search_usage", async () => {
    await db.exec(`set role postgres;`);
    const u1Res = await db.query<{ id: string }>(`insert into auth.users (email) values ('rls_user1@test.com') returning id;`);
    const u2Res = await db.query<{ id: string }>(`insert into auth.users (email) values ('rls_user2@test.com') returning id;`);
    const u1 = u1Res.rows[0].id;
    const u2 = u2Res.rows[0].id;

    await db.query(`select * from public.consume_search($1, 'search', 3000);`, [u1]);
    await db.query(`select * from public.consume_search($1, 'search', 3000);`, [u2]);

    // Grant schema and table usage so authenticated can select under RLS
    await db.exec(`
      grant usage on schema public to authenticated;
      grant select on public.profiles, public.search_usage to authenticated;
    `);

    // Set role to authenticated and pretend to be u1
    await db.exec(`set role authenticated;`);
    await db.exec(`set request.jwt.claim.sub = '${u1}';`);

    const myProfile = await db.query(`select * from public.profiles;`);
    assert.equal(myProfile.rows.length, 1);
    assert.equal((myProfile.rows[0] as any).id, u1);

    const otherProfile = await db.query(`select * from public.profiles where id = $1;`, [u2]);
    assert.equal(otherProfile.rows.length, 0, "Cannot read another user's profile");

    const myUsage = await db.query(`select * from public.search_usage;`);
    assert.equal(myUsage.rows.length, 1);
    assert.equal((myUsage.rows[0] as any).user_id, u1);

    // Attempt to call consume_search as authenticated must be rejected (permission denied)
    await assert.rejects(
      async () => {
        await db.query(`select * from public.consume_search($1, 'search', 3000);`, [u1]);
      },
      /permission denied/i
    );

    // Reset role
    await db.exec(`set role postgres;`);
  });
});
