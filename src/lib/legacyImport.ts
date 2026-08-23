import { api, type LegacyLocalStorageImport } from "./tauri";

const HISTORY_KEY = "scriptura-search-history";
const SERVICE_ORDER_KEY = "scriptura-service-order-v1";
const DISPLAY_PREFS_KEY = "scriptura-display-prefs-v2";
const STUDY_UI_KEY = "scriptura-study-ui-v2";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * One-time migration of the four localStorage payloads (search history,
 * service order, display prefs, study-panel visibility) into SQLite — see the
 * localStorage-to-SQLite consolidation. Safe to call on every startup: it
 * checks the backend's idempotency marker first and does nothing at all (not
 * even reading localStorage) once the import has already happened. The
 * localStorage keys are only cleared after the backend confirms the import
 * committed, so a crash mid-import leaves the source data intact to retry
 * from on the next launch instead of losing it.
 */
export async function importLegacyLocalStorageIfNeeded(): Promise<void> {
  // Fail closed: if we can't even ask whether it's done, don't risk a
  // duplicate/partial import — just skip this launch and try again next time.
  const alreadyDone = await api.legacyImportDone().catch(() => true);
  if (alreadyDone) return;

  const rawHistory = readJson<
    { query: string; timestamp: number; selectedRef?: { book: string; chapter: number; verse: number } }[]
  >(HISTORY_KEY) ?? [];
  const rawServiceOrder = readJson<
    { id: string; book: string; chapter: number; verse: number; text: string; module: string }[]
  >(SERVICE_ORDER_KEY) ?? [];
  const rawDisplayPrefs = readJson<Record<string, unknown>>(DISPLAY_PREFS_KEY);
  const rawStudyUi = readJson<Record<string, unknown>>(STUDY_UI_KEY);

  const payload: LegacyLocalStorageImport = {
    search_history: rawHistory.map((e) => ({
      query: e.query,
      timestamp: e.timestamp,
      selected_ref: e.selectedRef,
    })),
    service_order: rawServiceOrder,
    display_prefs: rawDisplayPrefs
      ? {
          font_family: String(rawDisplayPrefs.fontFamily ?? "system"),
          text_align: String(rawDisplayPrefs.textAlign ?? "left"),
          margins: Number(rawDisplayPrefs.margins ?? 0),
          line_spacing: Number(rawDisplayPrefs.lineSpacing ?? 0.6),
          letter_spacing: Number(rawDisplayPrefs.letterSpacing ?? 0),
          strongs_sheet_height: Number(rawDisplayPrefs.strongsSheetHeight ?? 360),
          presentation_context: Number(rawDisplayPrefs.presentationContext ?? 1),
        }
      : null,
    study_ui: rawStudyUi
      ? {
          show_commentary: rawStudyUi.showCommentary !== false,
          show_notes: rawStudyUi.showNotes !== false,
          show_cross_refs: rawStudyUi.showCrossRefs !== false,
          show_red_letter: rawStudyUi.showRedLetter !== false,
        }
      : null,
  };

  try {
    // Even an all-empty payload (fresh install, nothing in localStorage) is
    // worth submitting: it still sets the backend's marker in one round trip,
    // so every future startup's legacyImportDone() check short-circuits
    // instead of re-reading localStorage on every launch forever.
    await api.importLegacyLocalStorage(payload);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SERVICE_ORDER_KEY);
    localStorage.removeItem(DISPLAY_PREFS_KEY);
    localStorage.removeItem(STUDY_UI_KEY);
  } catch (e) {
    console.error("[legacyImport] failed, will retry next launch", e);
  }
}
