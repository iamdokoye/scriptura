import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type PresentationTheme, type PresentationThemeInput } from "../lib/tauri";
import { emitPresentation } from "../lib/presentation";
import { useAppStore } from "../store/app";
import { STARTER_THEME, toInput, type ThemeElement, type ThemePreset } from "../lib/themeDraft";
import ThemeLibrary from "../components/themeDesigner/ThemeLibrary";
import ThemeCanvas from "../components/themeDesigner/ThemeCanvas";
import ThemeInspector from "../components/themeDesigner/ThemeInspector";
import { useDraftHistory } from "../components/themeDesigner/useDraftHistory";

/**
 * Theme designer: library (left) · canvas (centre) · inspector (right).
 * This view owns the draft and the save/default/delete flows; the three panes
 * are presentational and only talk to it through props.
 */
export default function CustomizationStudio() {
  const {
    presentationThemes, activePresentationTheme, hydratePresentationThemes, setActivePresentationTheme, setView,
    presentationActive, primaryModule, currentRef, parallelModule, parallelMode, selectedStrongs,
    strongsGroup, strongsSource, displayPrefs, readingFontSize,
  } = useAppStore();

  const { draft, set: setDraft, reset: resetDraft, undo, redo, canUndo, canRedo } = useDraftHistory<PresentationThemeInput>(STARTER_THEME);
  const [baseline, setBaseline] = useState<PresentationThemeInput>(STARTER_THEME);
  const [selectedId, setSelectedId] = useState<string | null>(activePresentationTheme?.id ?? null);
  const [newTheme, setNewTheme] = useState(false);
  const [element, setElement] = useState<ThemeElement>("verse");
  const [lockAspect, setLockAspect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedTheme = useMemo(
    () => presentationThemes.find((theme) => theme.id === selectedId) ?? null,
    [presentationThemes, selectedId],
  );

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  useEffect(() => {
    if (presentationThemes.length === 0) {
      api.listPresentationThemes().then(hydratePresentationThemes).catch(() => {});
    }
  }, [presentationThemes.length, hydratePresentationThemes]);

  // Land on the active (or first) theme once the list has loaded, and re-sync
  // the draft whenever the saved copy changes (after a save or a refresh).
  useEffect(() => {
    if (newTheme) return;
    if (!selectedTheme) {
      const fallback = activePresentationTheme ?? presentationThemes[0];
      if (fallback) setSelectedId(fallback.id);
      return;
    }
    const input = toInput(selectedTheme);
    resetDraft(input);
    setBaseline(input);
  }, [selectedTheme?.id, selectedTheme?.updated_at, newTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // ReadingView normally broadcasts live state. The designer is a separate view,
  // so it also broadcasts while it is open — otherwise “Use live” would not take
  // effect until the operator returned to the console.
  useEffect(() => {
    if (!presentationActive || !primaryModule) return;
    emitPresentation({
      book: currentRef.book,
      chapter: currentRef.chapter,
      verse: currentRef.verse,
      primaryModule,
      parallelModule,
      parallelMode,
      selectedStrongs,
      strongsGroup,
      strongsSource,
      displayPrefs,
      readingFontSize,
      presentationTheme: activePresentationTheme,
    });
  }, [presentationActive, primaryModule, currentRef, parallelModule, parallelMode, selectedStrongs, strongsGroup, strongsSource, displayPrefs, readingFontSize, activePresentationTheme]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey) || e.code !== "KeyZ") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const patchDraft = useCallback((patch: Partial<PresentationThemeInput>) => setDraft({ ...draft, ...patch }), [draft, setDraft]);

  function chooseTheme(theme: PresentationTheme) {
    setSelectedId(theme.id);
    setNewTheme(false);
    const input = toInput(theme);
    resetDraft(input);
    setBaseline(input);
    setMessage(null);
  }

  function beginNewTheme(from: ThemePreset | "copy") {
    const input: PresentationThemeInput = from === "copy"
      ? {
          ...STARTER_THEME,
          ...(activePresentationTheme ? toInput(activePresentationTheme) : {}),
          name: `Copy of ${activePresentationTheme?.name ?? "Scripture Theme"}`,
        }
      : { ...from.theme };
    setSelectedId(null);
    setNewTheme(true);
    setElement("verse");
    resetDraft(input);
    // A brand-new theme is always unsaved, so make the baseline differ.
    setBaseline({ ...input, name: "" });
    setMessage(null);
  }

  async function refresh(activeId?: string) {
    const themes = await api.listPresentationThemes();
    hydratePresentationThemes(themes);
    const next = themes.find((theme) => theme.id === activeId) ?? themes.find((theme) => theme.is_default) ?? themes[0] ?? null;
    setActivePresentationTheme(next);
    if (next) setSelectedId(next.id);
  }

  async function save() {
    if (!draft.name.trim()) {
      setMessage("Give this theme a name before saving.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const input = { ...draft, name: draft.name.trim() };
      const theme = newTheme
        ? await api.createPresentationTheme(input)
        : await api.updatePresentationTheme(selectedTheme!.id, input);
      setNewTheme(false);
      await refresh(theme.id);
      setMessage("Saved. The live output now uses this theme.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(theme: PresentationTheme) {
    setSaving(true);
    try {
      const updated = await api.setDefaultPresentationTheme(theme.id);
      await refresh(updated.id);
      setMessage(`“${theme.name}” is now the default Scripture theme.`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(theme: PresentationTheme) {
    if (theme.is_builtin) return;
    setSaving(true);
    try {
      await api.deletePresentationTheme(theme.id);
      if (theme.id === selectedId) setSelectedId(null);
      await refresh();
      setNewTheme(false);
      setMessage("Theme deleted.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  }

  function useLive(theme: PresentationTheme) {
    setActivePresentationTheme(theme);
    setMessage(`“${theme.name}” is live.`);
  }

  const canSave = (dirty || newTheme) && !saving;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden p-3 gap-3">
        <header className="glass rounded-3xl shrink-0 flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface shrink-0">Theme Designer</h1>
            {dirty && <span className="font-metadata-mono text-[10px] uppercase tracking-widest text-primary">Unsaved changes</span>}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            {message && <p className="font-body-ui text-[12px] text-on-surface-variant truncate max-w-[360px]" role="status">{message}</p>}
            <button
              onClick={save}
              disabled={!canSave}
              className="h-9 px-4 rounded-xl btn-primary font-body-ui text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button onClick={() => setView("live")} className="h-9 px-3.5 rounded-xl ctl font-body-ui text-[13px] text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">close</span>
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[220px_minmax(0,1fr)_300px] xl:grid-cols-[280px_minmax(0,1fr)_340px] gap-3 overflow-hidden">
          <ThemeLibrary
            themes={presentationThemes}
            selectedId={selectedId}
            liveThemeId={activePresentationTheme?.id ?? null}
            creatingNew={newTheme}
            busy={saving}
            onSelect={chooseTheme}
            onNew={beginNewTheme}
            onUseLive={useLive}
            onMakeDefault={makeDefault}
            onDelete={remove}
          />
          <ThemeCanvas
            draft={draft}
            onChange={setDraft}
            selected={element}
            onSelect={setElement}
            lockAspect={lockAspect}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
          />
          <ThemeInspector
            draft={draft}
            onChange={patchDraft}
            selected={element}
            onSelect={setElement}
            lockAspect={lockAspect}
            onLockAspect={setLockAspect}
          />
        </div>
      </main>
    </div>
  );
}
