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

/** What the server knows about the signed-in account, for display. null until loaded. */
export interface AccountSummary {
  /** Plan id, e.g. "free". */
  plan: string;
  /** Searches allowed per day on this plan. */
  dailyLimit: number | null;
  /** Searches used so far today (UTC day). */
  usedToday: number;
}

interface AccountState {
  status: AccountStatus;
  email: string | null;
  summary: AccountSummary | null;
  /** Reload the plan and today's usage from the server. Fails quietly: it's only for display. */
  refreshSummary: () => Promise<void>;
  /** The sign-in / account window (opened from the top bar or Settings). */
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;

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
  summary: null,
  modalOpen: false,
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),

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
        set({ status: session ? "signedIn" : "signedOut", email: session?.user.email ?? null, ...(session ? {} : { summary: null }) });
      });
    })();
    return initPromise;
  },

  refreshSummary: async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) { set({ summary: null }); return; }
      const today = new Date().toISOString().slice(0, 10);
      const [profile, usage] = await Promise.all([
        supabase.from("profiles").select("plan, plans(daily_searches)").eq("id", uid).maybeSingle(),
        supabase.from("search_usage").select("searches").eq("user_id", uid).eq("day", today).maybeSingle(),
      ]);
      const row = profile.data as { plan?: string; plans?: { daily_searches?: number } | null } | null;
      set({
        summary: {
          plan: row?.plan ?? "free",
          dailyLimit: row?.plans?.daily_searches ?? null,
          usedToday: (usage.data as { searches?: number } | null)?.searches ?? 0,
        },
      });
    } catch {
      // Display only; the Account page falls back to "Free" and no usage line.
    }
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
  // Most specific first: "email address ... is invalid" must not read as a bad code.
  if (m.includes("not authorized"))
    return "This address can't receive sign-in emails yet. The project's email sending isn't set up for it.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "New sign-ups are turned off.";
  if (m.includes("error sending") || m.includes("sending") && m.includes("email"))
    return "We couldn't send the email. Please try again in a few minutes.";
  if (m.includes("rate limit") || m.includes("security purposes") || m.includes("too many"))
    return "Too many attempts. Wait a minute and try again.";
  if (m.includes("valid email") || (m.includes("email address") && m.includes("invalid")))
    return "Enter a valid email address.";
  if (m.includes("expired") || m.includes("invalid"))
    return "That code didn't work. It may have expired. Request a new one.";
  return message || "Something went wrong. Please try again.";
}
