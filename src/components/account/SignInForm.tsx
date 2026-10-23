import { useEffect, useState } from "react";
import { useAccountStore } from "../../store/accountStore";

const RESEND_SECONDS = 60; // Supabase allows one code per address per minute

interface Props {
  /** Why the person is being asked to sign in; shown above the email box. */
  intro?: string;
  /** Called once the code is accepted, so the caller can carry on (e.g. send a waiting question). */
  onSignedIn?: () => void;
  /** Layout classes for the form wrapper. */
  className?: string;
}

const DEFAULT_INTRO = "We'll email you a one-time code. No password needed, and new accounts are created automatically.";

function messageOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === "string" && e ? e : "Something went wrong. Please try again.";
}

/** Email → one-time code. No password: the code is the whole sign-in. */
export default function SignInForm({
  intro = DEFAULT_INTRO, onSignedIn, className = "flex-1 min-h-0 overflow-y-auto p-3 space-y-3",
}: Props) {
  const { sendCode, verifyCode } = useAccountStore();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [resendAt]);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await sendCode(email);
      setStep("code");
      setCode("");
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setErr(null);
    try {
      await verifyCode(email, code);
      // The account store now reports signed-in, and whoever shows this form swaps it out.
      onSignedIn?.();
    } catch (e) {
      setErr(messageOf(e));
      setBusy(false);
    }
  }

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const codeOk = /^\d{6,10}$/.test(code.trim());

  return (
    <form
      className={className}
      onSubmit={(e) => { e.preventDefault(); if (step === "email" ? emailOk : codeOk) (step === "email" ? send : verify)(); }}
    >
      {step === "email" ? (
        <>
          <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">{intro}</p>
          <label className="block">
            <span className="field-label">Email</span>
            <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus autoComplete="email" spellCheck={false} readOnly={busy} />
          </label>
        </>
      ) : (
        <>
          <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
            We sent a 6-digit code to <span className="text-on-surface">{email.trim()}</span>. Enter it below.
            It can take a minute; check your spam folder if it doesn't arrive.
          </p>
          <label className="block">
            <span className="field-label">Code</span>
            <input className="field-input font-metadata-mono tracking-[0.3em]" inputMode="numeric" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="123456" autoFocus autoComplete="one-time-code" readOnly={busy} />
          </label>
        </>
      )}

      {err && <p className="font-body-ui text-[12px] text-error" role="alert">{err}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || (step === "email" ? !emailOk : !codeOk)}
          className="btn-primary rounded-md px-3 py-1.5 font-body-ui text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Please wait…" : step === "email" ? "Send code" : "Sign in"}
        </button>
        {step === "code" && (
          <>
            <button type="button" onClick={send} disabled={busy || wait > 0} className="ctl rounded-md px-3 py-1.5 font-body-ui text-[12px] disabled:opacity-40">
              {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
            </button>
            <button type="button" onClick={() => { setStep("email"); setErr(null); }} className="ghost rounded-md px-2 py-1.5 font-body-ui text-[12px] ml-auto">
              Change email
            </button>
          </>
        )}
      </div>
    </form>
  );
}
