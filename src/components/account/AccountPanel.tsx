import { useEffect, type ReactNode } from "react";
import { useAccountStore } from "../../store/accountStore";
import AccountDetails from "./AccountDetails";
import { planName } from "./planName";

/** One line on the Account page: a title and description on the left, the value or action on the right. */
function Row({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-x-4 gap-y-3 flex-wrap px-8 py-5">
      <div className="min-w-0">
        <p className="font-body-ui text-[14px] font-semibold text-on-surface">{title}</p>
        {description && <p className="font-body-ui text-[12px] text-on-surface-variant mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Settings → Account: sign in or out, the current plan, usage today, and the (future) license key. */
export default function AccountPanel() {
  const { status, email, summary, refreshSummary, openModal } = useAccountStore();
  const signedIn = status === "signedIn";

  useEffect(() => { if (signedIn) refreshSummary(); }, [signedIn, refreshSummary]);

  return (
    <div className="divide-y divide-outline-variant">
      {signedIn ? (
        <>
          <Row title="Account" description={email ?? undefined} />
          <div className="px-8 py-4">
            <AccountDetails hideEmail />
          </div>
        </>
      ) : (
        <Row title="Account" description="Sign in to use Ask Scripture. New accounts are created automatically.">
          <div className="flex items-center gap-2">
            <button onClick={openModal} className="ghost rounded-lg px-3 py-2 font-body-ui text-[13px] font-semibold text-on-surface">Sign up</button>
            <button onClick={openModal} className="btn-primary rounded-lg px-4 py-2 font-body-ui text-[13px] font-bold">Sign in</button>
          </div>
        </Row>
      )}

      <Row title="Current plan" description="Your active subscription plan">
        <span className="font-body-ui text-[13px] font-semibold text-on-surface">{planName(summary?.plan)}</span>
      </Row>

      <Row title="Ask Scripture usage" description="Searches used today. The count resets at midnight UTC.">
        <span className="font-body-ui text-[13px] font-semibold text-on-surface">
          {!signedIn
            ? "Sign in to see"
            : summary
              ? summary.dailyLimit !== null ? `${summary.usedToday} of ${summary.dailyLimit} used` : `${summary.usedToday} used`
              : "…"}
        </span>
      </Row>

      <div className="px-8 py-5 space-y-3">
        <div>
          <p className="font-body-ui text-[14px] font-semibold text-on-surface">License key</p>
          <p className="font-body-ui text-[12px] text-on-surface-variant mt-0.5">Enter a license key to unlock paid features.</p>
        </div>
        <div className="flex items-center gap-3 opacity-60">
          <input disabled className="field-input flex-1 font-metadata-mono" placeholder="XXXX - XXXX - XXXX - XXXX" aria-label="License key" />
          <button disabled className="btn-primary rounded-lg px-4 py-2 font-body-ui text-[13px] font-bold cursor-not-allowed">Activate license</button>
        </div>
        <p className="font-body-ui text-[11px] text-on-surface-variant">License keys arrive with paid plans. Everything in Scriptura is free for now.</p>
      </div>
    </div>
  );
}
