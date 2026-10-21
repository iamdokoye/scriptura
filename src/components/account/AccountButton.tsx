import { useEffect } from "react";
import { useAccountStore } from "../../store/accountStore";
import AccountModal from "./AccountModal";

/**
 * The top bar's account entry: a "Sign in" button when signed out, the person's initial once
 * signed in. Either opens the account window. Renders nothing in a build with no Supabase
 * project configured, so contributors building from source don't see a dead button.
 */
export default function AccountButton() {
  const { status, email, init, openModal } = useAccountStore();

  useEffect(() => { init(); }, [init]);

  if (status === "unknown" || status === "unavailable") return null;
  const signedIn = status === "signedIn";
  const initial = (email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <button
        onClick={openModal}
        aria-label={signedIn ? `Account: ${email}` : "Sign in"}
        title={signedIn ? `Signed in as ${email}` : "Sign in to use Ask Scripture"}
        className={signedIn
          ? "w-8 h-8 shrink-0 rounded-full btn-primary font-body-ui text-[13px] font-bold flex items-center justify-center"
          : "ctl rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shrink-0 text-on-surface"}
      >
        {signedIn ? (
          initial
        ) : (
          <>
            <span className="material-symbols-outlined text-[20px]">account_circle</span>
            <span className="font-body-ui text-[13px] font-semibold hidden min-[1100px]:inline">Sign in</span>
          </>
        )}
      </button>
      <AccountModal />
    </>
  );
}
