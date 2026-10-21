import { useState } from "react";
import { useAiSearchStore, resumePendingQuestion } from "../../store/aiSearchStore";
import { errorMessage } from "../../lib/aiSearch";

const CLAUDE_MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (Recommended — Fast & Accurate)" },
  { id: "claude-haiku-5", label: "Claude Haiku 5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "custom", label: "Custom Model…" },
];

interface Props {
  onDone?: () => void;
  canCancel?: boolean;
}

/** Form for entering an Anthropic Claude API key to power AI scripture search. */
export default function ClaudeSettingsForm({ onDone, canCancel = false }: Props) {
  const { config, saveClaudeKey, clearClaudeKey } = useAiSearchStore();
  const [apiKey, setApiKey] = useState("");
  const rawModel = config?.claude_model || "claude-haiku-5-5";
  const initialModel = rawModel === "claude-3-5-haiku-20241022" || rawModel === "claude-3-5-haiku-latest" ? "claude-haiku-5-5" : rawModel;
  const [selectedModel, setSelectedModel] = useState(() => {
    const isStandard = CLAUDE_MODELS.some((m) => m.id === initialModel && m.id !== "custom");
    return isStandard ? initialModel : "custom";
  });
  const [customModel, setCustomModel] = useState(initialModel);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const activeModel = selectedModel === "custom" ? customModel.trim() : selectedModel;
  const isConfigured = !!config?.claude_configured;

  async function save() {
    if (!apiKey.trim() && !isConfigured) return;
    setBusy(true);
    setErr(null);
    setSuccess(false);
    try {
      await saveClaudeKey(apiKey.trim(), activeModel);
      setApiKey("");
      setSuccess(true);
      resumePendingQuestion();
      if (onDone) setTimeout(onDone, 600);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setErr(null);
    try {
      await clearClaudeKey();
      setApiKey("");
      setSuccess(false);
      if (onDone) onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
        Plug in your Anthropic Claude API key to find King James Version (KJV) scriptures by describing scenes, topics, or stories in natural language (e.g. <span className="italic text-on-surface">“man and woman that lied in church and died for it”</span> → <span className="font-metadata-mono text-primary font-bold">Acts 5:1-11</span>).
      </p>

      {isConfigured && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
          <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
          <div className="flex-1 min-w-0">
            <p className="font-body-ui text-[12px] font-medium text-on-surface">Claude API is connected and active</p>
            <p className="font-metadata-mono text-[10px] text-on-surface-variant truncate">Model: {config?.claude_model || "claude-haiku-5-5"}</p>
          </div>
        </div>
      )}

      <label className="block">
        <span className="field-label">{isConfigured ? "Update API Key (optional)" : "Claude API Key"}</span>
        <input
          className="field-input font-metadata-mono text-[12px]"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={isConfigured ? "••••••••••••••••••••••••••••••••" : "Claude API key…"}
          spellCheck={false}
          autoComplete="off"
        />
      </label>

      <label className="block">
        <span className="field-label">AI Model</span>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="field-input font-body-ui text-[12px]"
        >
          {CLAUDE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>

      {selectedModel === "custom" && (
        <label className="block">
          <span className="field-label">Custom Model Identifier</span>
          <input
            className="field-input font-metadata-mono text-[12px]"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="e.g. claude-3-5-haiku-20241022"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
      )}

      {err && <p className="font-body-ui text-[12px] text-error" role="alert">{err}</p>}
      {success && <p className="font-body-ui text-[12px] text-primary" role="status">Claude settings saved successfully!</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={busy || (!apiKey.trim() && !isConfigured) || !activeModel}
          className="btn-primary rounded-md px-3 py-1.5 font-body-ui text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : isConfigured ? "Update Settings" : "Save Claude Key"}
        </button>

        {canCancel && onDone && (
          <button type="button" onClick={onDone} className="ctl rounded-md px-3 py-1.5 font-body-ui text-[13px]">
            Cancel
          </button>
        )}

        {isConfigured && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="ghost rounded-md px-2 py-1.5 font-body-ui text-[12px] text-error ml-auto hover:bg-error/10 transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>

      <p className="font-body-ui text-[11px] text-on-surface-variant/80 leading-relaxed">
        Your API key is stored securely on this computer only and communicates directly with Anthropic.
      </p>
    </form>
  );
}
