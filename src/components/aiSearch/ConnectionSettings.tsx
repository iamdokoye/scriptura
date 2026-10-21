import { useState } from "react";
import { useAccountStore } from "../../store/accountStore";
import { useAiSearchStore } from "../../store/aiSearchStore";
import CustomServerForm from "./CustomServerForm";
import ClaudeSettingsForm from "./ClaudeSettingsForm";

/** Who searches run as: the signed-in account, or advanced custom options. */
export default function ConnectionSettings({ onDone }: { onDone: () => void }) {
  const { status, email, signOut, deleteAccount } = useAccountStore();
  const { config, quota, reset } = useAiSearchStore();
  const [editingServer, setEditingServer] = useState(false);
  const [editingClaude, setEditingClaude] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const usingOwnServer = !!config?.configured;
  const usingClaudeKey = !!config?.claude_configured;
  const usingDirect = usingOwnServer || usingClaudeKey;

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      reset();
      onDone();
    } catch (e: any) {
      setDeleteError(e?.message ?? "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-5">
      {status !== "unavailable" && (
        <section className="space-y-2">
          <h3 className="field-label">Scriptura Account</h3>
          {status === "signedIn" ? (
            <div className="space-y-2">
              <p className="font-body-ui text-[13px] text-on-surface break-all">{email}</p>
              {quota && !usingDirect && (
                <p className={`font-body-ui text-[11px] ${quota.remaining === 0 ? "text-error" : "text-on-surface-variant"}`}>
                  {quota.remaining} of {quota.limit} searches left today
                </p>
              )}

              {confirmDelete ? (
                <div className="p-3 rounded-lg border border-error/30 bg-error/10 space-y-2">
                  <p className="font-body-ui text-[12px] font-medium text-on-surface">
                    Are you sure you want to delete your account?
                  </p>
                  <p className="font-body-ui text-[11px] text-on-surface-variant leading-relaxed">
                    This permanently deletes your profile and all search counters from the server.
                  </p>
                  {deleteError && (
                    <p className="font-body-ui text-[11px] text-error font-medium">{deleteError}</p>
                  )}
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
                    onClick={async () => { await signOut(); reset(); onDone(); }}
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
          ) : (
            <p className="font-body-ui text-[12px] text-on-surface-variant">
              Not signed in. Connect below or sign in to use Ask Scripture.
            </p>
          )}
        </section>
      )}

      {/* Advanced Options */}
      <div className="pt-2 border-t border-outline-variant space-y-4">
        <h3 className="font-body-ui text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
          Advanced Connections
        </h3>

        {/* Own Anthropic Claude API Key */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="field-label">Own Anthropic API Key</h4>
            {usingClaudeKey && !editingClaude && (
              <span className="font-metadata-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">Active</span>
            )}
          </div>
          {editingClaude ? (
            <ClaudeSettingsForm canCancel onDone={() => setEditingClaude(false)} />
          ) : usingClaudeKey ? (
            <div className="space-y-1.5">
              <p className="font-body-ui text-[12px] text-on-surface-variant">
                Searches use your own Anthropic key ({config?.claude_model || "claude-haiku-5-5"}).
              </p>
              <button
                onClick={() => setEditingClaude(true)}
                className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px]"
              >
                Configure or disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="font-body-ui text-[12px] text-on-surface-variant">
                Bring your own Claude key to search directly.
              </p>
              <button
                onClick={() => setEditingClaude(true)}
                className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px]"
              >
                Add Claude API key
              </button>
            </div>
          )}
        </section>

        {/* Own Search Server */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="field-label">Own Search Server</h4>
            {usingOwnServer && !editingServer && (
              <span className="font-metadata-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">Active</span>
            )}
          </div>
          {editingServer ? (
            <CustomServerForm canCancel onDone={() => setEditingServer(false)} />
          ) : usingOwnServer ? (
            <div className="space-y-1.5">
              <p className="font-body-ui text-[12px] text-on-surface-variant break-all">
                Searches go to <span className="text-on-surface">{config?.endpoint}</span>.
              </p>
              <button
                onClick={() => setEditingServer(true)}
                className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px]"
              >
                Edit or disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="font-body-ui text-[12px] text-on-surface-variant">
                For self-hosted Modal GPU search service deployments.
              </p>
              <button
                onClick={() => setEditingServer(true)}
                className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px]"
              >
                Connect a server
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="pt-2 border-t border-outline-variant">
        <button onClick={onDone} className="ghost rounded-md px-2 py-1.5 font-body-ui text-[12px]">
          Back
        </button>
      </div>
    </div>
  );
}
