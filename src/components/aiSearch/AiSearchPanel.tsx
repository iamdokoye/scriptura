import { useEffect, useRef, useState } from "react";
import { useAppStore, type VerseRef } from "../../store/app";
import { useAiSearchStore } from "../../store/aiSearchStore";
import { errorMessage, type AiHit } from "../../lib/aiSearch";
import { useVerseTexts } from "./useVerseTexts";

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
  const { config, phase, query, hits, error, ask, loadConfig, warmUp } = useAiSearchStore();
  const primaryModule = useAppStore((s) => s.primaryModule);
  const [draft, setDraft] = useState(query);
  const [editingConfig, setEditingConfig] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { if (config?.configured) warmUp(); }, [config?.configured, warmUp]);
  // `ask` from the search bar's "?" prefix changes the stored query; show it here.
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, [config?.configured, editingConfig]);

  const { texts, missing, keyOf } = useVerseTexts(hits, primaryModule);
  const visible = hits.filter((h) => !missing.has(keyOf(h)));

  function submit() {
    if (draft.trim()) ask(draft);
  }

  const showSetup = config !== null && (!config.configured || editingConfig);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-b border-outline-variant">
        <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
        <h2 className="flex-1 font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide">Ask Scripture</h2>
        {config?.configured && (
          <button
            onClick={() => setEditingConfig((v) => !v)}
            className="p-1 rounded-md ghost text-on-surface-variant"
            title="Connection settings"
            aria-label="Connection settings"
          >
            <span className="material-symbols-outlined text-[16px]">settings</span>
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded-md ghost text-on-surface-variant" title="Close" aria-label="Close Ask Scripture">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {config === null ? null : showSetup ? (
        <SetupForm onDone={() => setEditingConfig(false)} canCancel={config.configured} />
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
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
            {phase === "idle" && <Examples onPick={(t) => { setDraft(t); ask(t); }} />}
            {phase === "loading" && <Loading />}
            {phase === "error" && <ErrorNote message={error ?? "Something went wrong"} onRetry={() => ask(query)} />}
            {phase === "done" && visible.length === 0 && (
              <p className="px-3 py-4 font-body-ui text-[12px] text-on-surface-variant text-center">
                No matching verses found{primaryModule ? ` in ${primaryModule}` : ""}. Try describing it differently.
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

function ResultRow({ hit, text, selected, onPick }: { hit: AiHit; text: string | undefined; selected: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        onClick={onPick}
        title="Open in Preview"
        className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
          selected ? "row-selected border-primary/30" : "border-transparent hover:bg-surface-container-low"
        }`}
      >
        <span className={`font-metadata-mono text-[11px] font-bold ${selected ? "text-primary" : "text-on-surface"}`}>
          {hit.book} {hit.chapter}:{hit.verse}
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

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-2 p-3 rounded-lg bg-error-container text-on-error-container space-y-2" role="alert">
      <p className="font-body-ui text-[12px]">{message}</p>
      <button onClick={onRetry} className="ctl rounded-md px-2.5 py-1 font-body-ui text-[12px]">Try again</button>
    </div>
  );
}

/** Connection details for the deployed Modal endpoint (see services/scripture-search/README.md). */
function SetupForm({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const { config, saveConfig, clearConfig } = useAiSearchStore();
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? "");
  const [keyId, setKeyId] = useState(config?.key_id ?? "");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await saveConfig(endpoint, keyId, secret);
      setSecret("");
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
      onSubmit={(e) => { e.preventDefault(); save(); }}
    >
      <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
        Connect the search service you deployed on Modal. Setup steps are in <code className="font-metadata-mono">services/scripture-search/README.md</code>.
      </p>
      <label className="block">
        <span className="field-label">Endpoint URL</span>
        <input className="field-input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://your-workspace--scriptura-scripture-search-scripturesearch-search.modal.run"
          spellCheck={false} autoComplete="off" />
      </label>
      <label className="block">
        <span className="field-label">Token ID</span>
        <input className="field-input" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="wk-…" spellCheck={false} autoComplete="off" />
      </label>
      <label className="block">
        <span className="field-label">Token secret</span>
        <input className="field-input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ws-…" spellCheck={false} autoComplete="off" />
      </label>
      {err && <p className="font-body-ui text-[12px] text-error" role="alert">{err}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy || !endpoint.trim() || !keyId.trim() || !secret.trim()} className="btn-primary rounded-md px-3 py-1.5 font-body-ui text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? "Saving…" : "Save"}
        </button>
        {canCancel && (
          <>
            <button type="button" onClick={onDone} className="ctl rounded-md px-3 py-1.5 font-body-ui text-[13px]">Cancel</button>
            <button type="button" onClick={() => clearConfig().then(onDone)} className="ghost rounded-md px-2 py-1.5 font-body-ui text-[12px] text-error ml-auto">Disconnect</button>
          </>
        )}
      </div>
      <p className="font-body-ui text-[11px] text-on-surface-variant/80 leading-relaxed">
        The secret is stored on this computer only, in a file readable by your user account.
      </p>
    </form>
  );
}
