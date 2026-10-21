import { useState, type ReactNode } from "react";
import { useAccountStore } from "../../store/accountStore";

interface Props {
  /** Extra lines under the email (for example how many searches are left today). */
  children?: ReactNode;
  /** Called after the person signs out or their account has been deleted. */
  onGone?: () => void;
  /** Leave out the email line when the caller already shows it. */
  hideEmail?: boolean;
}

/** The signed-in account: who it is, sign out, and delete account (with a confirmation step). */
export default function AccountDetails({ children, onGone, hideEmail }: Props) {
  const { email, signOut, deleteAccount } = useAccountStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      onGone?.();
    } catch (e) {
      setDeleteError(e instanceof Error && e.message ? e.message : "Couldn't delete the account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-2">
      {!hideEmail && <p className="font-body-ui text-[13px] text-on-surface break-all">{email}</p>}
      {children}

      {confirmDelete ? (
        <div className="p-3 rounded-lg border border-error/30 bg-error/10 space-y-2">
          <p className="font-body-ui text-[12px] font-medium text-on-surface">Are you sure you want to delete your account?</p>
          <p className="font-body-ui text-[11px] text-on-surface-variant leading-relaxed">
            This permanently deletes your profile and all search counters from the server.
          </p>
          {deleteError && <p className="font-body-ui text-[11px] text-error font-medium" role="alert">{deleteError}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1 rounded bg-error text-white font-body-ui text-[11px] font-semibold hover:opacity-90 disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Yes, delete account"}
            </button>
            <button
              onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
              disabled={deleting}
              className="px-2 py-1 rounded ghost font-body-ui text-[11px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={async () => { await signOut(); onGone?.(); }}
            className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px]"
          >
            Sign out
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="ghost text-error rounded-md px-2 py-1.5 font-body-ui text-[12px]"
          >
            Delete account
          </button>
        </div>
      )}
    </div>
  );
}
