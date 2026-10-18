import { useState } from "react";
import { useAiSearchStore, resumePendingQuestion } from "../../store/aiSearchStore";
import { errorMessage } from "../../lib/aiSearch";

/** Connection details for a search server you deployed yourself (see services/scripture-search/README.md). */
export default function CustomServerForm({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
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
      resumePendingQuestion();
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
        Connect a search server you deployed on Modal. Steps are in <code className="font-metadata-mono">services/scripture-search/README.md</code>.
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
        {canCancel && <button type="button" onClick={onDone} className="ctl rounded-md px-3 py-1.5 font-body-ui text-[13px]">Cancel</button>}
        {config?.configured && (
          <button type="button" onClick={() => clearConfig().then(onDone)} className="ghost rounded-md px-2 py-1.5 font-body-ui text-[12px] text-error ml-auto">Disconnect</button>
        )}
      </div>
      <p className="font-body-ui text-[11px] text-on-surface-variant/80 leading-relaxed">
        The secret is stored on this computer only, in a file readable by your user account.
      </p>
    </form>
  );
}
