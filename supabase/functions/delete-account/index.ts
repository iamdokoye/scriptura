// Edge Function: delete-account
//
// Deletes the calling user's account using the Supabase Admin API.
// Requires a valid JWT in the Authorization header.
// Deleting the user cascades to profiles and search_usage in the database.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fail(status: number, error: string, message: string): Response {
  return json(status, { error, message });
}

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
}

const supabaseUrl = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const authClient = createClient(supabaseUrl, anonKey, noSession);
const admin = createClient(supabaseUrl, serviceKey, noSession);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return fail(405, "method_not_allowed", "Use POST.");
  }

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) {
    return fail(401, "unauthorized", "Missing session token.");
  }

  const { data, error: userError } = await authClient.auth.getUser(jwt);
  if (userError || !data?.user) {
    return fail(401, "unauthorized", "Invalid or expired session token.");
  }

  const userId = data.user.id;

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[delete-account] Failed to delete user:", deleteError.message);
    return fail(500, "delete_failed", "Couldn't delete account. Please try again.");
  }

  console.log(JSON.stringify({ outcome: "account_deleted", user_id: userId }));
  return json(200, { success: true, message: "Account deleted successfully." });
});
