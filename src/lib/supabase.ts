import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * The app's Supabase client, or null in a build that has no project configured (for
 * example a contributor building from source).
 *
 * Created on first use rather than at import: the presentation window loads the same
 * bundle, and two windows each running their own token auto-refresh would race on the
 * same refresh token and sign the user out.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return (client = null);
  try {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // sign-in is by emailed code, never a redirect
        storageKey: "scriptura.auth",
      },
    });
  } catch {
    client = null; // a malformed URL shouldn't take the app down
  }
  return client;
}
