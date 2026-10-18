// Edge Function entry point: wires the gateway logic in handler.ts to Supabase and Modal.
//
// Secrets to set (see supabase/README.md):
//   MODAL_URL, MODAL_KEY, MODAL_SECRET   the Modal endpoint and its proxy-auth token
//   FREE_DAILY_LIMIT                     searches per user per day   (default 50)
//   GLOBAL_DAILY_LIMIT                   searches per day, everyone  (default 3000)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import { handle, type Consumption, type Deps } from "./handler.ts";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
}

function intFromEnv(name: string, fallback: number): number {
  const n = Number.parseInt(Deno.env.get(name) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const supabaseUrl = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

const userLimit = intFromEnv("FREE_DAILY_LIMIT", 50);
const globalLimit = intFromEnv("GLOBAL_DAILY_LIMIT", 3000);

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const authClient = createClient(supabaseUrl, anonKey, noSession);
const admin = createClient(supabaseUrl, serviceKey, noSession);

const deps: Deps = {
  userLimit,

  async getUserId(jwt) {
    const { data, error } = await authClient.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },

  async consume(userId, kind): Promise<Consumption> {
    const { data, error } = await admin.rpc("consume_search", {
      p_user: userId,
      p_kind: kind,
      p_user_limit: userLimit,
      p_global_limit: globalLimit,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) throw new Error(`consume_search failed: ${error?.message ?? "no result"}`);
    return row as Consumption;
  },

  async refund(userId) {
    await admin.rpc("refund_search", { p_user: userId });
  },

  callModal(body, signal) {
    return fetch(required("MODAL_URL"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Modal-Key": required("MODAL_KEY"),
        "Modal-Secret": required("MODAL_SECRET"),
      },
      body: JSON.stringify(body),
      signal,
    });
  },
};

Deno.serve(async (req) => {
  try {
    return await handle(req, deps);
  } catch (e) {
    console.error("[search]", e);
    return new Response(JSON.stringify({ error: "server_error", message: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
