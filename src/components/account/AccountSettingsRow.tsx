import { useAccountStore } from "../../store/accountStore";

/** The account line in Settings: who's signed in, and a button that opens the account window. */
export default function AccountSettingsRow() {
  const { status, email, openModal } = useAccountStore();
  const signedIn = status === "signedIn";

  return (
    <div className="flex items-center gap-3">
      <span className="material-symbols-outlined text-[22px] text-on-surface-variant">account_circle</span>
      <div className="flex-1 min-w-0">
        <p className="font-body-ui text-[13px] text-on-surface font-medium truncate">
          {signedIn ? email : "Not signed in"}
        </p>
        <p className="font-body-ui text-[11px] text-on-surface-variant mt-0.5">
          {signedIn ? "Your account powers Ask Scripture." : "Sign in with your email to use Ask Scripture. No password needed."}
        </p>
      </div>
      <button
        onClick={openModal}
        className={`shrink-0 rounded-md px-3 py-1.5 font-body-ui text-[12px] ${signedIn ? "ctl" : "btn-primary font-bold"}`}
      >
        {signedIn ? "Manage" : "Sign in"}
      </button>
    </div>
  );
}
