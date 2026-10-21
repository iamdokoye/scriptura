import { create } from "zustand";
import { getSupabase } from "../lib/supabase";

/**
 * The signed-in Scriptura account. Sign-in is by a one-time code emailed to the user: no
 * passwords to store or reset, and no browser redirect to wire into a desktop app.
 *
 * Nothing starts until `init()` is called, so the app doesn't touch the network or run a
 * token-refresh timer unless a feature that needs an account is used.
 */

export type AccountStatus =
  | "unknown"      // init() hasn't finished
  | "unavailable"  // this build has no Supabase project configured
  | "signedOut"
  | "signedIn";

interface AccountState {
  status: AccountStatus;
  email: string | null;

  /** Idempotent: restores any saved session and starts listening for changes. */
  init: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useAccountStore = create<AccountState>()((set) => ({
  status: "unknown",
  email: null,

  init: () => {
    initPromise ??= (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        set({ status: "unavailable" });
        return;
      }
      try {
        const { data } = await supabase.auth.getSession();
        set({ status: data.session ? "signedIn" : "signedOut", email: data.session?.user.email ?? null });
      } catch {
        set({ status: "signedOut", email: null });
      }
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ status: session ? "signedIn" : "signedOut", email: session?.user.email ?? null });
      });
    })();
    return initPromise;
  },

  sendCode: async (email) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Accounts aren't available in this build.");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    if (error) throw new Error(friendlyAuthError(error.message));
  },

  verifyCode: async (email, code) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Accounts aren't available in this build.");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) throw new Error(friendlyAuthError(error.message));
  },

  signOut: async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    // "local" ends this device's session without signing the account out everywhere.
    await supabase.auth.signOut({ scope: "local" });
  },

  deleteAccount: async () => {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Accounts aren't available in this build.");
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) {
      const ctx = (error as { context?: unknown }).context;
      if (ctx instanceof Response) {
        const body = (await ctx.json().catch(() => null)) as { message?: unknown } | null;
        if (typeof body?.message === "string") throw new Error(body.message);
      }
      throw new Error("Couldn't delete account. Please try again.");
    }
    await supabase.auth.signOut({ scope: "local" });
  },
}));

/** Supabase's messages are written for developers; say what the person should do. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("security purposes") || m.includes("too many"))
    return "Too many attempts. Wait a minute and try again.";
  if (m.includes("expired") || m.includes("invalid"))
    return "That code didn't work. It may have expired. Request a new one.";
  if (m.includes("valid email") || m.includes("email address"))
    return "Enter a valid email address.";
  return message || "Something went wrong. Please try again.";
}
