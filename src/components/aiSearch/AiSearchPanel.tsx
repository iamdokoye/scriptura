import { useEffect, useRef, useState } from "react";
import { useAppStore, type VerseRef } from "../../store/app";
import { useAiSearchStore, resumePendingQuestion } from "../../store/aiSearchStore";
import { useAccountStore } from "../../store/accountStore";
import type { AiHit } from "../../lib/aiSearch";
import { useVerseTexts } from "./useVerseTexts";
import SignInForm from "../account/SignInForm";

const EXAMPLES = [
  "man and woman that lied in church and died for it",
  "Jesus calms the storm",
  "what to do when I'm afraid",
  "forgiving someone who hurt me",
];

interface Props {
  /** Loads the clicked verse into the Live Show preview and selects it. */
  onNavigate: (ref: VerseRef) => void;
  /** The verse currently in the preview, so its result stays highlighted. */
  activeRef: VerseRef;
  onClose: () => void;
}

/** Natural-language scripture search powered by Supabase & Claude: describe a passage, click a result to preview it. */
export default function AiSearchPanel({ onNavigate, activeRef, onClose }: Props) {
  const { phase, query, hits, error, quota, ask, ensureReady } = useAiSearchStore();
  const accountStatus = useAccountStore((s) => s.status);
  const email = useAccountStore((s) => s.email);
  const openAccountModal = useAccountStore((s) => s.openModal);
  const primaryModule = useAppStore((s) => s.primaryModule);
  const [draft, setDraft] = useState(query);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ensureReady();
  }, [ensureReady]);

  const isSignedIn = accountStatus === "signedIn";

  // `ask` from the search bar's "?" prefix changes the stored query; show it here.
  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(() => {
    if (isSignedIn) inputRef.current?.focus();
  }, [isSignedIn]);

  const { texts, missing, keyOf } = useVerseTexts(hits, primaryModule);
  const visible = hits.filter((h) => !missing.has(keyOf(h)));

  function submit() {
    if (draft.trim()) ask(draft);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 h-[49px] flex items-center gap-2 px-3.5 py-2 border-b border-outline-variant">
        <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
        <h2 className="flex-1 font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide">
          Ask Scripture
        </h2>
        {isSignedIn && (
          <button
            onClick={openAccountModal}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-metadata-mono ctl text-on-surface-variant max-w-[140px] truncate"
            title={`Signed in as ${email}. Click to view account.`}
          >
            <span className="material-symbols-outlined text-[14px]">account_circle</span>
            <span className="truncate">{email?.split("@")[0]}</span>
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 rounded-md ghost text-on-surface-variant"
          title="Close"
          aria-label="Close Ask Scripture"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {!isSignedIn ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col">
          <div className="my-auto space-y-3 p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
              <h3 className="font-body-ui text-[13px] font-bold text-on-surface">Sign in to Ask Scripture</h3>
            </div>
            <SignInForm
              intro="Sign in with your email to search scriptures using natural language. No password needed — we'll email you a one-time code."
              onSignedIn={resumePendingQuestion}
              className="space-y-3"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 p-2.5 border-b border-outline-variant">
            <div className="field rounded-lg flex items-end gap-1 pr-1.5">
              <textarea
                ref={inputRef}
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  } else if (e.key === "Escape") {
                    onClose();
                  }
                }}
                placeholder="Describe what you're looking for…"
                maxLength={500}
                className="flex-1 min-w-0 resize-none bg-transparent px-2.5 py-2 focus:outline-none font-body-ui text-[13px] text-on-surface placeholder:text-on-surface-variant"
              />
              <button
                onClick={submit}
                disabled={!draft.trim() || phase === "loading"}
                className="mb-1.5 p-1.5 rounded-md btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                title="Search (Enter)"
                aria-label="Search"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
              </button>
            </div>
            {quota ? (
              <p
                className={`mt-1.5 px-1 font-body-ui text-[11px] ${
                  quota.remaining === 0 ? "text-error" : "text-on-surface-variant"
                }`}
              >
                {quota.remaining} of {quota.limit} searches left today
              </p>
            ) : (
              <p className="mt-1.5 px-1 font-body-ui text-[11px] text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px] text-primary">auto_awesome</span>
                Powered by Claude · KJV
              </p>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
            {phase === "idle" && <Examples onPick={(t) => { setDraft(t); ask(t); }} />}
            {phase === "loading" && <Loading />}
            {phase === "error" && (
              <ErrorNote
                message={error ?? "Something went wrong"}
                onRetry={quota?.remaining === 0 ? undefined : () => ask(query)}
              />
            )}
            {phase === "done" && visible.length === 0 && (
              <p className="px-3 py-4 font-body-ui text-[12px] text-on-surface-variant text-center">
                No confident match found{primaryModule ? ` in ${primaryModule}` : ""}. Try describing it differently, or search the text with / in the search bar.
              </p>
            )}
            {phase === "done" && visible.some((h) => h.confidence === "unverified") && (
              <p className="mx-1 mb-1.5 px-2.5 py-1.5 rounded-lg border border-error/40 font-body-ui text-[11px] text-error" role="note">
                The accuracy check couldn't run, so these results are unchecked. Read each one before using it.
              </p>
            )}
            {phase === "done" && visible.length > 0 && (
              <ul className="space-y-1">
                {visible.map((h) => (
                  <ResultRow
                    key={keyOf(h)}
                    hit={h}
                    text={texts.get(keyOf(h))}
                    selected={h.book === activeRef.book && h.chapter === activeRef.chapter && h.verse === activeRef.verse}
                    onPick={() => onNavigate({ book: h.book, chapter: h.chapter, verse: h.verse })}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const CONFIDENCE_LABEL: Record<string, { text: string; className: string; title: string }> = {
  match: { text: "Match", className: "bg-primary/15 text-primary", title: "Checked against the passage text: this is what you described" },
  related: { text: "Related", className: "bg-on-surface/10 text-on-surface-variant", title: "Checked: same subject, but not exactly what you described" },
  unverified: { text: "Unchecked", className: "border border-error/50 text-error", title: "The accuracy check couldn't run. Read the verse before using it" },
};

function ResultRow({ hit, text, selected, onPick }: { hit: AiHit; text: string | undefined; selected: boolean; onPick: () => void }) {
  const badge = hit.confidence ? CONFIDENCE_LABEL[hit.confidence] : undefined;
  const refLabel = `${hit.book} ${hit.chapter}:${hit.verse}${hit.endVerse && hit.endVerse !== hit.verse ? `-${hit.endVerse}` : ""}`;
  return (
    <li>
      <button
        onClick={onPick}
        className={`w-full text-left p-2 rounded-lg transition-colors flex flex-col gap-0.5 ${
          selected
            ? "bg-primary/15 border border-primary/40"
            : "hover:bg-surface-container-high border border-transparent"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-metadata-mono text-[12px] font-bold text-primary">{refLabel}</span>
            {badge && (
              <span className={`text-[10px] font-body-ui font-medium px-1.5 py-0.5 rounded ${badge.className}`} title={badge.title}>
                {badge.text}
              </span>
            )}
          </div>
          <span className="font-metadata-mono text-[10px] text-on-surface-variant/70">
            {Math.round(hit.score * 100)}%
          </span>
        </div>
        {text && (
          <p className="font-body-ui text-[11px] text-on-surface-variant line-clamp-2 leading-snug">
            {text}
          </p>
        )}
      </button>
    </li>
  );
}

function Examples({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="p-2 space-y-1.5">
      <p className="px-1 text-[11px] font-body-ui text-on-surface-variant uppercase tracking-wider font-semibold">
        Try asking
      </p>
      <div className="flex flex-col gap-1">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => onPick(ex)}
            className="text-left px-2.5 py-1.5 rounded-md text-[12px] font-body-ui text-on-surface hover:bg-surface-container-high transition-colors"
          >
            “{ex}”
          </button>
        ))}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="p-6 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
      <span className="material-symbols-outlined animate-spin text-[24px] text-primary">progress_activity</span>
      <p className="font-body-ui text-[12px]">Searching scripture with Claude…</p>
    </div>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-4 flex flex-col items-center gap-2 text-center">
      <span className="material-symbols-outlined text-[24px] text-error">error</span>
      <p className="font-body-ui text-[12px] text-error">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="ctl rounded-md px-3 py-1 font-body-ui text-[12px] mt-1">
          Try again
        </button>
      )}
    </div>
  );
}
