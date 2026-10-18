import { useState } from "react";
import { useAccountStore } from "../../store/accountStore";
import { useAiSearchStore } from "../../store/aiSearchStore";
import CustomServerForm from "./CustomServerForm";

/** Who searches run as: the signed-in account, or a server of your own. */
export default function ConnectionSettings({ onDone }: { onDone: () => void }) {
  const { status, email, signOut } = useAccountStore();
  const { config, quota, reset } = useAiSearchStore();
  const [editingServer, setEditingServer] = useState(false);
  const usingOwnServer = !!config?.configured;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-5">
      {status !== "unavailable" && (
        <section className="space-y-2">
          <h3 className="field-label">Account</h3>
          {status === "signedIn" ? (
            <>
              <p className="font-body-ui text-[13px] text-on-surface break-all">{email}</p>
              {quota && !usingOwnServer && (
                <p className="font-body-ui text-[11px] text-on-surface-variant">
                  {quota.remaining} of {quota.limit} searches left today
                </p>
              )}
              <button
                onClick={async () => { await signOut(); reset(); onDone(); }}
                className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px]"
              >
                Sign out
              </button>
            </>
          ) : (
            <p className="font-body-ui text-[12px] text-on-surface-variant">Not signed in. Disconnect your own server below to sign in.</p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="field-label">Own search server</h3>
        {editingServer ? (
          <CustomServerForm canCancel onDone={() => setEditingServer(false)} />
        ) : usingOwnServer ? (
          <>
            <p className="font-body-ui text-[12px] text-on-surface-variant break-all">
              Searches go to <span className="text-on-surface">{config?.endpoint}</span>, not your account.
            </p>
            <button onClick={() => setEditingServer(true)} className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px]">Edit or disconnect</button>
          </>
        ) : (
          <>
            <p className="font-body-ui text-[12px] text-on-surface-variant">For people who run their own search server.</p>
            <button onClick={() => setEditingServer(true)} className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px]">Connect a server</button>
          </>
        )}
      </section>

      <button onClick={onDone} className="ghost rounded-md px-2 py-1.5 font-body-ui text-[12px]">Back</button>
    </div>
  );
}
