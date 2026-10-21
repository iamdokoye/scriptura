import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useAccountStore } from "../../store/accountStore";
import ErrorBoundary from "../ErrorBoundary";
import SignInForm from "./SignInForm";
import AccountDetails from "./AccountDetails";

/**
 * The sign-in / account window. Signed out it asks for an email and the emailed code; signed
 * in it shows the account. Rendered in a portal because the top bar's frosted glass would
 * otherwise trap a fixed-position overlay inside the bar.
 */
export default function AccountModal() {
  const { modalOpen, closeModal, status } = useAccountStore();

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); closeModal(); }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;
  const signedIn = status === "signedIn";

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6" onClick={closeModal}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={signedIn ? "Your account" : "Sign in"}
        className="w-full max-w-[400px] glass glass-strong rounded-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-outline-variant">
          <span className="material-symbols-outlined text-[20px] text-primary">account_circle</span>
          <h2 className="flex-1 font-headline-sm text-headline-sm text-on-surface">
            {signedIn ? "Your account" : "Sign in to Scriptura"}
          </h2>
          <button onClick={closeModal} className="ctl rounded-lg p-1.5 text-secondary hover:text-primary" aria-label="Close">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <ErrorBoundary compact label="Account">
          {signedIn ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                <span className="material-symbols-outlined text-[18px] text-primary">check_circle</span>
                <p className="font-body-ui text-[12px] text-on-surface">You're signed in. Ask Scripture is ready in the Live Show console.</p>
              </div>
              <AccountDetails onGone={closeModal} />
              <button onClick={closeModal} className="btn-primary rounded-md px-4 py-1.5 font-body-ui text-[13px] font-bold">Done</button>
            </div>
          ) : (
            <SignInForm
              className="p-5 space-y-3"
              intro="Sign in to use Ask Scripture. We'll email you a one-time code. No password needed, and new accounts are created automatically."
            />
          )}
        </ErrorBoundary>
      </div>
    </div>,
    document.body,
  );
}
