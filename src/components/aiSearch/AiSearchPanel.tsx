import { useEffect, useRef, useState } from "react";
import { useAppStore, type VerseRef } from "../../store/app";
import { useAiSearchStore, activeSource, resumePendingQuestion } from "../../store/aiSearchStore";
import { useAccountStore } from "../../store/accountStore";
import type { AiHit } from "../../lib/aiSearch";
import { useVerseTexts } from "./useVerseTexts";
import SignInForm from "../account/SignInForm";
import CustomServerForm from "./CustomServerForm";
import ClaudeSettingsForm from "./ClaudeSettingsForm";
import ConnectionSettings from "./ConnectionSettings";

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

/** Natural-language scripture search: describe a passage, click a result to preview it. */
export default function AiSearchPanel({ onNavigate, activeRef, onClose }: Props) {
  const { config, phase, query, hits, error, quota, ask, ensureReady, warmUp } = useAiSearchStore();
  const accountStatus = useAccountStore((s) => s.status);
  const primaryModule = useAppStore((s) => s.primaryModule);

  const [draft, setDraft] = useState(query);
  const [view, setView] = useState<"main" | "settings">("main");
  const [ownOption, setOwnOption] = useState<"server" | "claude" | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ensureReady();
  }, [ensureReady]);

  const source = activeSource();
  const loaded = config !== null && accountStatus !== "unknown";
  const needsConnection = loaded && !source;

  useEffect(() => {
    if (source === "account" || source === "custom") {
      warmUp();
    }
  }, [source, warmUp]);

  // `ask` from the search bar's "?" prefix changes the stored query; show it here.
  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(() => {
    if (source && view === "main") {
      inputRef.current?.focus();
    }
  }, [source, view]);

  const { texts, missing, keyOf } = useVerseTexts(hits, primaryModule);
  const visible = hits.filter((h) => !missing.has(keyOf(h)));

  function submit() {
    if (draft.trim()) ask(draft);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-b border-outline-variant">
        <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
        <h2 className="flex-1 font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide">
          Ask Scripture
        </h2>
        {source && (
          <button
            onClick={() => setView((v) => (v === "settings" ? "main" : "settings"))}
            className="p-1 rounded-md ghost text-on-surface-variant hover:text-on-surface"
            title="Account & connections"
            aria-label="Account & connections"
          >
            <span className="material-symbols-outlined text-[16px]">settings</span>
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 rounded-md ghost text-on-surface-variant hover:text-on-surface"
          title="Close"
          aria-label="Close Ask Scripture"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {!loaded ? null : needsConnection ? (
        ownOption === "server" ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5">
            <CustomServerForm canCancel onDone={() => setOwnOption(null)} />
          </div>
        ) : ownOption === "claude" ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5">
            <ClaudeSettingsForm canCancel onDone={() => setOwnOption(null)} />
          </div>
        ) : (
          <SignInForm
            intro="Sign in to find verses by describing them. We'll email you a code. No password needed, and new accounts are created automatically."
            onSignedIn={resumePendingQuestion}
            onUseOwnServer={() => setOwnOption("server")}
            onUseClaudeKey={() => setOwnOption("claude")}
          />
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

            {source === "account" && quota && (
              <p
                className={`mt-1.5 px-1 font-body-ui text-[11px] ${
                  quota.remaining === 0 ? "text-error font-medium" : "text-on-surface-variant"
                }`}
              >
                {quota.remaining} of {quota.limit} searches left today
              </p>
            )}
            {source === "claude" && (
              <p className="mt-1.5 px-1 font-body-ui text-[11px] text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px] text-primary">auto_awesome</span>
                Using Claude ({config?.claude_model || "claude-haiku-5-5"}) · KJV
              </p>
            )}
            {source === "custom" && (
              <p className="mt-1.5 px-1 font-body-ui text-[11px] text-on-surface-variant truncate">
                Server: {config?.endpoint}
              </p>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
            {phase === "idle" && (
              <Examples
                onPick={(t) => {
                  setDraft(t);
                  ask(t);
                }}
              />
            )}
            {phase === "loading" && <Loading />}
            {phase === "error" && (
              <ErrorNote message={error ?? "Something went wrong"} onRetry={() => ask(query)} />
            )}
            {phase === "done" && visible.length === 0 && (
              <p className="px-3 py-6 font-body-ui text-[12px] text-on-surface-variant text-center">
                No confident match found{primaryModule ? ` in ${primaryModule}` : ""}. Try describing it differently, or search the text with / in the search bar.
              </p>
            )}
            {phase === "done" && visible.length > 0 && (
              <ul className="space-y-1">
                {visible.map((h) => (
                  <ResultRow
                    key={keyOf(h)}
                    hit={h}
                    text={texts.get(keyOf(h))}
                    selected={
                      h.book === activeRef.book &&
                      h.chapter === activeRef.chapter &&
                      h.verse === activeRef.verse
                    }
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

function ResultRow({
  hit,
  text,
  selected,
  onPick,
}: {
  hit: AiHit;
  text: string | undefined;
  selected: boolean;
  onPick: () => void;
}) {
  const refLabel = `${hit.book} ${hit.chapter}:${hit.verse}${
    hit.endVerse && hit.endVerse !== hit.verse ? `-${hit.endVerse}` : ""
  }`;

  return (
    <li>
      <button
        onClick={onPick}
        className={`w-full text-left p-2 rounded-lg transition-colors flex flex-col gap-1 ${
          selected
            ? "bg-primary/15 border border-primary/40"
            : "hover:bg-surface-container-high border border-transparent"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-metadata-mono text-[12px] font-bold text-primary">{refLabel}</span>
            {hit.confidence === "match" && (
              <span className="px-1 py-0.2 rounded text-[9px] font-metadata-mono font-semibold bg-primary/15 text-primary border border-primary/30 uppercase tracking-wider">
                Match
              </span>
            )}
            {hit.confidence === "related" && (
              <span className="px-1 py-0.2 rounded text-[9px] font-metadata-mono font-semibold bg-surface-container-highest text-on-surface-variant border border-outline-variant uppercase tracking-wider">
                Related
              </span>
            )}
            {hit.confidence === "unverified" && (
              <span className="px-1 py-0.2 rounded text-[9px] font-metadata-mono font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                Unchecked
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
      <span className="material-symbols-outlined animate-spin text-[24px] text-primary">
        progress_activity
      </span>
      <p className="font-body-ui text-[12px]">Searching scripture…</p>
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
