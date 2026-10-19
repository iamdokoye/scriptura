import { useEffect, useRef, useState } from "react";
import { useAppStore, type VerseRef } from "../../store/app";
import { useAiSearchStore } from "../../store/aiSearchStore";
import { useAccountStore } from "../../store/accountStore";
import type { AiHit } from "../../lib/aiSearch";
import { useVerseTexts } from "./useVerseTexts";
import SignInForm from "./SignInForm";
import CustomServerForm from "./CustomServerForm";
import ConnectionSettings from "./ConnectionSettings";

const EXAMPLES = [
  "Jesus calms the storm",
  "what to do when I'm afraid",
  "forgiving someone who hurt me",
  "the parable of the lost sheep",
];

interface Props {
  /** Loads the clicked verse into the Live Show preview and selects it. */
  onNavigate: (ref: VerseRef) => void;
  /** The verse currently in the preview, so its result stays highlighted. */
  activeRef: VerseRef;
  onClose: () => void;
}

/** Natural-language scripture search: describe a passage, click a result to preview it. */
export default function AiSearchPanel({ onNavigate, activeRef, onClose }: Props) {
  const { config, phase, query, hits, error, quota, ask, ensureReady, warmUp } = useAiSearchStore();
  const accountStatus = useAccountStore((s) => s.status);
  const primaryModule = useAppStore((s) => s.primaryModule);
  const [draft, setDraft] = useState(query);
  const [view, setView] = useState<"main" | "settings">("main");
  const [ownServer, setOwnServer] = useState(false); // sign-in screen: show the own-server form instead
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ensureReady(); }, [ensureReady]);

  // Neither an own server nor an account yet → the person has to connect one first.
  const loaded = config !== null && accountStatus !== "unknown";
  const source = config?.configured ? "custom" : accountStatus === "signedIn" ? "account" : null;
  const needsConnection = loaded && !source;

  useEffect(() => { if (source) warmUp(); }, [source, warmUp]);
  // `ask` from the search bar's "?" prefix changes the stored query; show it here.
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => { if (source && view === "main") inputRef.current?.focus(); }, [source, view]);

  const { texts, missing, keyOf } = useVerseTexts(hits, primaryModule);
  const visible = hits.filter((h) => !missing.has(keyOf(h)));

  function submit() {
    if (draft.trim()) ask(draft);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-b border-outline-variant">
        <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
        <h2 className="flex-1 font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide">Ask Scripture</h2>
        {source && (
          <button
            onClick={() => setView((v) => (v === "settings" ? "main" : "settings"))}
            className="p-1 rounded-md ghost text-on-surface-variant"
            title="Account and connection"
            aria-label="Account and connection"
          >
            <span className="material-symbols-outlined text-[16px]">settings</span>
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded-md ghost text-on-surface-variant" title="Close" aria-label="Close Ask Scripture">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {!loaded ? null : needsConnection ? (
        accountStatus === "unavailable" || ownServer ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <CustomServerForm canCancel={ownServer && accountStatus !== "unavailable"} onDone={() => setOwnServer(false)} />
          </div>
        ) : (
          <SignInForm onUseOwnServer={() => setOwnServer(true)} />
        )
      ) : view === "settings" ? (
        <ConnectionSettings onDone={() => setView("main")} />
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
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                  else if (e.key === "Escape") onClose();
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
            {source === "account" && quota && (
              <p className={`mt-1.5 px-1 font-body-ui text-[11px] ${quota.remaining === 0 ? "text-error" : "text-on-surface-variant"}`}>
                {quota.remaining} of {quota.limit} searches left today
              </p>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
            {phase === "idle" && <Examples onPick={(t) => { setDraft(t); ask(t); }} />}
            {phase === "loading" && <Loading />}
            {phase === "error" && <ErrorNote message={error ?? "Something went wrong"} onRetry={quota?.remaining === 0 ? undefined : () => ask(query)} />}
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
  return (
    <li>
      <button
        onClick={onPick}
        title="Open in Preview"
        className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
          selected ? "row-selected border-primary/30" : "border-transparent hover:bg-surface-container-low"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className={`font-metadata-mono text-[11px] font-bold ${selected ? "text-primary" : "text-on-surface"}`}>
            {hit.book} {hit.chapter}:{hit.verse}
          </span>
          {badge && (
            <span title={badge.title} className={`rounded-full px-1.5 py-px font-metadata-mono text-[9px] uppercase tracking-widest ${badge.className}`}>
              {badge.text}
            </span>
          )}
        </span>
        <p className="font-body-reading text-[13px] leading-snug text-on-surface-variant mt-0.5 line-clamp-3">
          {text ?? "…"}
        </p>
      </button>
    </li>
  );
}

function Examples({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="px-2 py-3 space-y-2">
      <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
        Describe a passage, a topic or a feeling in your own words. Click a result to load it into Preview.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((t) => (
          <button key={t} onClick={() => onPick(t)} className="ctl rounded-full px-2.5 py-1 font-body-ui text-[11px] text-on-surface">
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Loading() {
  // The first question after a quiet spell can wait on a GPU container starting up.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="px-3 py-4 space-y-3" role="status">
      <p className="font-body-ui text-[12px] text-on-surface-variant flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
        Searching Scripture…
      </p>
      {slow && (
        <p className="font-body-ui text-[11px] text-on-surface-variant/80 leading-relaxed">
          The search service is waking up after a quiet spell. This can take up to a minute the first time.
        </p>
      )}
    </div>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-2 p-3 rounded-lg bg-error-container text-on-error-container space-y-2" role="alert">
      <p className="font-body-ui text-[12px]">{message}</p>
      {onRetry && <button onClick={onRetry} className="ctl rounded-md px-2.5 py-1 font-body-ui text-[12px]">Try again</button>}
    </div>
  );
}
