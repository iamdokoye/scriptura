import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore, type DisplayPrefs } from "../store/app";
import { api, type Preferences } from "../lib/tauri";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { checkForUpdate, downloadAndInstall, getVersion } from "../lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { ACCENTS, isAccentId } from "../lib/accents";
import AccountPanel from "./account/AccountPanel";
import { useAccountStore } from "../store/accountStore";

const EXIT_MS = 180;

const FONT_SIZE_PRESETS = [14, 16, 32, 48, 64, 72, 98];

const DEFAULT_PREFS: Preferences = {
  theme: "light",
  font_size_reading: 18,
  show_strongs: true,
  show_morph: false,
  verse_display: "verse-per-line",
  default_commentary: null,
  show_commentary: true,
  show_notes: true,
  show_cross_refs: true,
  show_red_letter: true,
  font_family: "system",
  text_align: "left",
  margins: 0,
  line_spacing: 0.6,
  letter_spacing: 0,
  // 0 is a sentinel StrongsSheet resolves to half the viewport height —
  // see resolveHeight in StrongsSheet.tsx.
  strongs_sheet_height: 0,
  presentation_context: 1,
  default_lexicon_source: "ours",
  workspace: "study",
  split_long_verses: false,
  accent: "ink",
};

const FONTS: { id: DisplayPrefs["fontFamily"]; label: string }[] = [
  { id: "system", label: "Default" },
  { id: "serif",  label: "Serif" },
  { id: "times",  label: "Times" },
  { id: "mono",   label: "Mono" },
];


export default function Settings() {
  const accountStatus = useAccountStore((s) => s.status);
  const planId = useAccountStore((s) => s.summary?.plan);
  const [active, setActive] = useState("account");
  const [appVersion, setAppVersion] = useState("");
  const {
    settingsOpen, setSettingsOpen,
    setTheme, setAccent, setShowStrongs, setReadingFontSize,
    showCommentary, setShowCommentary,
    showNotes, setShowNotes,
    showCrossRefs, setShowCrossRefs,
    showRedLetter, setShowRedLetter,
    displayPrefs, setDisplayPrefs,
    workspace, setWorkspace,
  } = useAppStore();

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  // `mounted` outlives `settingsOpen` by the exit duration so the close
  // animation can play; `visible` drives the CSS transition itself.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);

  // Load saved preferences up front so the first open never flashes defaults.
  useEffect(() => { api.getPreferences().then(setPrefs).catch(() => {}); }, []);

  useEffect(() => {
    if (settingsOpen) {
      api.getPreferences().then(setPrefs).catch(() => {});
      setMounted(true);
      // Two frames: the closed styles must be committed before flipping to
      // the open ones, or the browser skips the transition.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setVisible(true));
      });
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }
    setVisible(false);
    setOpenSections(new Set());
    const t = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, setSettingsOpen]);

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save(update: Partial<Preferences>) {
    const next = { ...prefs, ...update };
    setPrefs(next);
    setSaving(true);
    try {
      await api.setPreferences(update);
      if (update.theme) setTheme(update.theme);
      if (update.accent && isAccentId(update.accent)) setAccent(update.accent);
      if (update.show_strongs !== undefined) setShowStrongs(update.show_strongs);
      if (update.font_size_reading !== undefined) setReadingFontSize(update.font_size_reading);
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  const isOpen = (id: string) => openSections.has(id);

  const nav = [
    { id: "account", icon: "account_circle", label: "Account", show: accountStatus !== "unavailable" },
    { id: "general", icon: "tune", label: "General", show: true },
    { id: "appearance", icon: "palette", label: "Appearance", show: true },
    { id: "study", icon: "school", label: "Study Tools", show: true },
    { id: "presentation", icon: "slideshow", label: "Presentation", show: true },
    { id: "sync", icon: "sync", label: "Sync & Backup", show: true },
    { id: "help", icon: "help", label: "Help", show: true },
    { id: "about", icon: "info", label: "About", show: true },
  ].filter((n) => n.show);
  const current = nav.some((n) => n.id === active) ? active : nav[0].id;
  const currentLabel = nav.find((n) => n.id === current)?.label ?? "Settings";
  const planLabel = `${(planId ?? "free").charAt(0).toUpperCase()}${(planId ?? "free").slice(1)} Plan`;

  return createPortal(
    <ActiveSectionContext.Provider value={current}>
    <div
      className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 transition-opacity ease-out motion-reduce:transition-none ${
        visible ? "opacity-100 duration-200" : "opacity-0 duration-[180ms] pointer-events-none"
      }`}
      onClick={() => setSettingsOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={`w-full max-w-[1000px] h-[min(700px,88vh)] glass glass-strong rounded-3xl overflow-hidden flex will-change-transform transition-[opacity,transform] motion-reduce:transition-none ${
          visible
            ? "opacity-100 translate-y-0 scale-100 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            : "opacity-0 translate-y-2 scale-[0.97] duration-[180ms] ease-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Section list */}
        <nav className="w-[230px] shrink-0 flex flex-col border-r border-outline-variant bg-surface-container-lowest/40">
          <h2 className="px-6 pt-6 pb-4 font-headline-sm text-headline-sm text-on-surface">Settings</h2>
          <ul className="flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5">
            {nav.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => setActive(n.id)}
                  aria-current={current === n.id ? "page" : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left font-body-ui text-[14px] transition-colors ${
                    current === n.id ? "row-selected text-primary font-semibold" : "text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{n.icon}</span>
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="p-4 space-y-2 border-t border-outline-variant">
            <button
              onClick={() => accountStatus !== "unavailable" && setActive("account")}
              className="w-full rounded-xl border border-outline-variant px-3 py-2 text-left font-body-ui text-[13px] font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
              title="View your plan"
            >
              {planLabel}
            </button>
            {appVersion && <p className="text-center font-metadata-mono text-[11px] text-on-surface-variant">version {appVersion}</p>}
          </div>
        </nav>

        {/* Selected section */}
        <section className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-8 py-5 border-b border-outline-variant shrink-0">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">{currentLabel}</h3>
            <div className="flex items-center gap-3">
              {saving && <span className="font-metadata-mono text-[11px] text-secondary">Saving…</span>}
              <button onClick={() => setSettingsOpen(false)} className="text-secondary hover:text-primary transition-colors" aria-label="Close settings">
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Workspace ────────────────────────────────────────────── */}
          {/* Kept outside the accordions, always visible — this is the one
              setting that changes what the whole app is set up to do, not a
              detail to dig for. Presentation tools (service queue, Live
              Show, presentation themes) genuinely don't exist in Study —
              switching here is what turns them on, not just reorders them. */}
          <Pane id="general">
          <div className="px-6 py-4">
            <SubRow label="Workspace" description="Study keeps things focused on personal Bible study. Presentation adds the live-show tools — service queue, Live Show console, presentation themes — on top.">
              <div className="flex gap-1.5">
                <ChipButton active={workspace === "study"} onClick={() => setWorkspace("study")}>
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">menu_book</span>
                  Study
                </ChipButton>
                <ChipButton active={workspace === "presentation"} onClick={() => setWorkspace("presentation")}>
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">live_tv</span>
                  Presentation
                </ChipButton>
              </div>
            </SubRow>
          </div>
          </Pane>

          {/* ── Appearance ───────────────────────────────────────────── */}
          <Pane id="appearance">
            {/* Text Settings sub-section */}
            <AccordionSection
              id="text-settings" icon="format_size" label="Text Settings"
              open={isOpen("text-settings")} onToggle={() => toggleSection("text-settings")}
              nested
            >
              <p className="font-body-ui text-[12px] leading-relaxed text-on-surface-variant -mt-1">
                These options style the text you read in the app. The live output has its own font, size and spacing — set them per theme in Themes.
              </p>
              {/* Font */}
              <SubRow label="Font">
                <div className="flex gap-1.5 flex-wrap">
                  {FONTS.map((f) => (
                    <ChipButton
                      key={f.id}
                      active={displayPrefs.fontFamily === f.id}
                      onClick={() => setDisplayPrefs({ fontFamily: f.id })}
                    >
                      {f.label}
                    </ChipButton>
                  ))}
                </div>
              </SubRow>

              {/* Alignment */}
              <SubRow label="Alignment">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setDisplayPrefs({ textAlign: "left" })}
                    title="Left align"
                    className={`p-1.5 rounded-md transition-colors ${displayPrefs.textAlign === "left" ? "btn-primary" : "ctl text-on-surface-variant"}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">format_align_left</span>
                  </button>
                  <button
                    onClick={() => setDisplayPrefs({ textAlign: "justify" })}
                    title="Justify"
                    className={`p-1.5 rounded-md transition-colors ${displayPrefs.textAlign === "justify" ? "btn-primary" : "ctl text-on-surface-variant"}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">format_align_justify</span>
                  </button>
                </div>
              </SubRow>

              {/* Font size */}
              <SubRow label="Font size">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => save({ font_size_reading: Math.max(14, prefs.font_size_reading - 1) })}
                    className="w-7 h-7 rounded-md ctl flex items-center justify-center font-bold text-on-surface text-sm"
                  >−</button>
                  <span className="font-metadata-mono text-on-surface w-10 text-center text-sm">{prefs.font_size_reading}px</span>
                  <button
                    onClick={() => save({ font_size_reading: Math.min(98, prefs.font_size_reading + 1) })}
                    className="w-7 h-7 rounded-md ctl flex items-center justify-center font-bold text-on-surface text-sm"
                  >+</button>
                  <div className="flex gap-1 ml-1 flex-wrap">
                    {FONT_SIZE_PRESETS.map((s) => (
                      <ChipButton
                        key={s}
                        active={prefs.font_size_reading === s}
                        onClick={() => save({ font_size_reading: s })}
                        mono
                      >
                        {s}
                      </ChipButton>
                    ))}
                  </div>
                </div>
              </SubRow>

              {/* Margins */}
              <SliderRow
                label="Margins"
                value={displayPrefs.margins}
                min={0} max={20} step={1}
                format={(v) => `${v}%`}
                onChange={(v) => setDisplayPrefs({ margins: v })}
              />

              {/* Line spacing */}
              <SliderRow
                label="Line spacing"
                value={displayPrefs.lineSpacing}
                min={0} max={1} step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => setDisplayPrefs({ lineSpacing: v })}
              />

              {/* Letter spacing */}
              <SliderRow
                label="Letter spacing"
                value={displayPrefs.letterSpacing}
                min={0} max={1} step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => setDisplayPrefs({ letterSpacing: v })}
              />
            </AccordionSection>

            {/* Theme */}
            <SubRow label="Theme">
              <div className="flex gap-1.5">
                {(["light", "dark", "system"] as const).map((t) => (
                  <ChipButton key={t} active={prefs.theme === t} onClick={() => save({ theme: t })}>
                    {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
                  </ChipButton>
                ))}
              </div>
            </SubRow>

            {/* Accent colour */}
            <SubRow label="Accent colour" description="The app's highlight colour — buttons, selections and links.">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
                {ACCENTS.map((a) => {
                  const selected = prefs.accent === a.id;
                  return (
                    <button
                      key={a.id}
                      role="radio"
                      aria-checked={selected}
                      aria-label={a.label}
                      title={a.label}
                      onClick={() => save({ accent: a.id })}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                        selected ? "ring-2 ring-offset-2 ring-offset-surface ring-on-surface/70" : "ring-1 ring-outline-variant"
                      }`}
                      style={{ background: a.swatch }}
                    >
                      {selected && <span className="material-symbols-outlined text-[16px] text-white">check</span>}
                    </button>
                  );
                })}
              </div>
            </SubRow>

            {/* Verse layout */}
            <SubRow label="Verse layout">
              <div className="flex gap-1.5">
                {(["verse-per-line", "paragraph"] as const).map((v) => (
                  <ChipButton key={v} active={prefs.verse_display === v} onClick={() => save({ verse_display: v })}>
                    {v === "verse-per-line" ? "Per line" : "Paragraph"}
                  </ChipButton>
                ))}
              </div>
            </SubRow>
          </Pane>

          {/* ── Study Tools ──────────────────────────────────────────── */}
          <Pane id="study">
            <SubRow label="Show Strong's numbers">
              <Toggle value={prefs.show_strongs} onChange={(v) => save({ show_strongs: v })} />
            </SubRow>
            <SubRow label="Show morphology tags">
              <Toggle value={prefs.show_morph} onChange={(v) => save({ show_morph: v })} />
            </SubRow>
            <SubRow label="Commentary" description="Matthew Henry icon on verse hover">
              <Toggle value={showCommentary} onChange={setShowCommentary} />
            </SubRow>
            <SubRow label="Notes" description="Notes icon on verse hover">
              <Toggle value={showNotes} onChange={setShowNotes} />
            </SubRow>
            <SubRow label="Cross-references" description="Requires TSK module (auto-installed)">
              <Toggle value={showCrossRefs} onChange={setShowCrossRefs} />
            </SubRow>
            <SubRow label="Red letter text" description="Words of Jesus in red (KJV, ASV…)">
              <Toggle value={showRedLetter} onChange={setShowRedLetter} />
            </SubRow>
            <SubRow label="Default Strong's source" description="The concordance sheet's own pill switcher can still change this per lookup">
              <div className="flex gap-1.5">
                {([
                  { id: "ours", label: "Scriptura" },
                  { id: "rich", label: "BDB / Abbott-Smith" },
                  { id: "thayer", label: "Thayer" },
                  { id: "lsj", label: "Full LSJ" },
                ] as const).map((opt) => (
                  <ChipButton
                    key={opt.id}
                    active={prefs.default_lexicon_source === opt.id}
                    onClick={() => save({ default_lexicon_source: opt.id })}
                  >
                    {opt.label}
                  </ChipButton>
                ))}
              </div>
            </SubRow>
          </Pane>

          {/* ── Presentation ─────────────────────────────────────────── */}
          <Pane id="presentation">
            <SubRow label="Verse context" description="Ctrl+1–4 to switch live. Controls how many verses appear on screen.">
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { value: 1, label: "1 — Active" },
                  { value: 2, label: "2 — +Next" },
                  { value: 3, label: "3 — Prev+Next" },
                  { value: 4, label: "4 — Chapter" },
                ] as const).map((opt) => (
                  <ChipButton
                    key={opt.value}
                    active={displayPrefs.presentationContext === opt.value}
                    onClick={() => setDisplayPrefs({ presentationContext: opt.value })}
                  >
                    {opt.label}
                  </ChipButton>
                ))}
              </div>
            </SubRow>
            <SubRow
              label="Auto-split long verses"
              description="When on, a long verse is split into labelled parts (a, b, c…) sized to fit the screen at your font size. A panel appears on the left of the operator console so you can send each part to the screen in sequence."
            >
              <Toggle value={displayPrefs.splitLongVerses} onChange={(v) => setDisplayPrefs({ splitLongVerses: v })} />
            </SubRow>
          </Pane>

          {/* ── Account ──────────────────────────────────────────────── */}
          <Pane id="account"><AccountPanel /></Pane>

          {/* ── Sync & Backup ────────────────────────────────────────── */}
          <Pane id="sync">
            <div className="flex items-start gap-3 px-6 py-3">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px] mt-0.5">cloud_off</span>
              <div>
                <p className="font-body-ui text-[13px] text-on-surface font-medium">Cloud sync — coming soon</p>
                <p className="font-body-ui text-[11px] text-on-surface-variant mt-0.5">
                  Sync your notes and bookmarks across devices. Not yet available in this version.
                </p>
              </div>
            </div>
          </Pane>

          {/* ── Help ─────────────────────────────────────────────────── */}
          <Pane id="help">
            {/* Tutorial / Shortcuts */}
            <SubRow label="Keyboard shortcuts" description="Every shortcut in one list. An onboarding tutorial is coming soon.">
              <button
                onClick={() => setShortcutsOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-body-ui ctl text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">keyboard</span>
                View shortcuts
              </button>
            </SubRow>

            {/* FAQs — nested accordion */}
            <AccordionSection
              id="faqs" icon="quiz" label="FAQs"
              open={isOpen("faqs")} onToggle={() => toggleSection("faqs")}
              nested
            >
              <div className="px-8 py-3 space-y-3.5">
                {([
                  { q: "How do I install Bible modules?", a: "Go to the Modules view (bookshelf icon), search for a translation, and click Install." },
                  { q: "How do I start a presentation?", a: "Click the slideshow icon in the top bar to open the Presentation window, then navigate verses from the reading view. Press Ctrl+Q to add the current verse or selected verse range to the schedule, and Ctrl+Shift+Q to open the queue panel." },
                  { q: "What are Strong's numbers?", a: "Strong's numbers link each word to its original Hebrew or Greek dictionary entry. Enable them in Study Tools settings." },
                  { q: "How do I change the font or size?", a: "Open Settings → Appearance → Text Settings to change the text you read in the app. The live output is styled by its theme instead — open Themes and edit the font, size and spacing there." },
                  { q: "How do I use the presentation verse context shortcuts?", a: "Press Ctrl+1–4 while presentation is active: 1 = active verse only, 2 = active + next, 3 = prev + active + next, 4 = full chapter scroll." },
                  { q: "Can I use two Bible translations side by side?", a: "Yes — click the splitscreen icon in the top bar to enable Parallel Mode, then pick the second translation from the Study Library sidebar. Enable the sync icon to scroll both panes together." },
                ] as const).map(({ q, a }) => (
                  <details key={q} className="group">
                    <summary className="font-body-ui text-[12px] text-on-surface cursor-pointer list-none flex items-start justify-between gap-2">
                      <span>{q}</span>
                      <span className="material-symbols-outlined text-[13px] text-secondary shrink-0 mt-0.5 group-open:rotate-180 transition-transform">expand_more</span>
                    </summary>
                    <p className="font-body-ui text-[11px] text-on-surface-variant mt-1.5 leading-relaxed pl-1">{a}</p>
                  </details>
                ))}
              </div>
            </AccordionSection>

            {/* Email feedback */}
            <SubRow label="Send feedback" description="Report a bug or suggest a feature.">
              <button
                onClick={() => {
                  const version = appVersion || "unknown";
                  const subject = encodeURIComponent(`Feedback regarding Scriptura v${version}`);
                  const body = encodeURIComponent(
                    `Hi,\n\nI have the following question or comment:\n\n\n\n---\nScriptura v${version}`
                  );
                  shellOpen(`mailto:okkodann@gmail.com?subject=${subject}&body=${body}`).catch(() => {});
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-body-ui ctl text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">mail</span>
                Email us
              </button>
            </SubRow>
          </Pane>

          {/* ── About ────────────────────────────────────────────────── */}
          <Pane id="about">
            <div className="px-6 py-3 font-body-ui text-[13px] text-on-surface-variant space-y-1.5">
              <p>Scriptura — open-source desktop Bible study</p>
              <p className="text-[12px] leading-relaxed text-on-surface-variant/80">
                SWORD module format is copyright The SWORD Project contributors.
                Public-domain texts are freely distributable.
              </p>
            </div>
            <SheetUpdateChecker />
          </Pane>

          </div>
        </section>
      </div>
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
    </ActiveSectionContext.Provider>,
    document.body,
  );
}

// ── Section panes ─────────────────────────────────────────────────────────────

const ActiveSectionContext = createContext("");

/** One page of Settings: shown only while it's the section selected in the sidebar. */
function Pane({ id, children }: { id: string; children: React.ReactNode }) {
  const active = useContext(ActiveSectionContext);
  if (active !== id) return null;
  return <div className="settings-pane-in divide-y divide-outline-variant">{children}</div>;
}

// ── Accordion section ─────────────────────────────────────────────────────────

function AccordionSection({
  icon, label, open, onToggle, children, nested,
}: {
  id?: string;
  icon: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  nested?: boolean;
}) {
  return (
    <div className={nested ? "border-t border-outline-variant" : ""}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-6 py-3 transition-colors hover:bg-surface-container-low text-left ${
          nested ? "pl-8 bg-surface-container-lowest" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-secondary ${nested ? "text-[16px]" : "text-[18px]"}`}>{icon}</span>
          <span className={`text-on-surface font-medium ${nested ? "font-body-ui text-[13px]" : "font-body-ui text-body-ui"}`}>{label}</span>
        </div>
        <span className={`material-symbols-outlined text-secondary transition-transform duration-200 ${open ? "rotate-180" : ""} ${nested ? "text-[16px]" : "text-[18px]"}`}>
          expand_more
        </span>
      </button>

      {open && (
        <div className={`divide-y divide-outline-variant ${nested ? "bg-surface-container-lowest" : "bg-surface"}`}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-4 pl-8 pr-6 py-3">
      <span className="font-body-ui text-[13px] text-on-surface shrink-0 w-28">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-primary h-1 cursor-pointer"
      />
      <span className="font-metadata-mono text-[12px] text-on-surface-variant w-9 text-right shrink-0">
        {format(value)}
      </span>
    </div>
  );
}

// ── Sub-row ───────────────────────────────────────────────────────────────────

type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date" }
  | { phase: "available"; update: Update }
  | { phase: "downloading"; downloaded: number; total: number | null }
  | { phase: "error"; message: string };

function SheetUpdateChecker() {
  const [version, setVersion] = useState("");
  const [state, setState] = useState<UpdateState>({ phase: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  async function handleCheck() {
    setState({ phase: "checking" });
    try {
      const result = await checkForUpdate();
      setState(
        result.status === "available"
          ? { phase: "available", update: result.update }
          : { phase: "up-to-date" },
      );
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Update check failed" });
    }
  }

  async function handleInstall(update: Update) {
    setState({ phase: "downloading", downloaded: 0, total: null });
    try {
      await downloadAndInstall(update, (downloaded, total) => {
        setState({ phase: "downloading", downloaded, total });
      });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Update failed" });
    }
  }

  return (
    <SubRow label="Version" description={version ? `Currently on v${version}` : undefined}>
      {state.phase === "idle" && (
        <button
          onClick={handleCheck}
          className="px-2.5 py-1 rounded-md text-[12px] font-body-ui ctl text-on-surface-variant transition-colors"
        >
          Check for updates
        </button>
      )}
      {state.phase === "checking" && (
        <span className="font-metadata-mono text-[11px] text-on-surface-variant">Checking…</span>
      )}
      {state.phase === "up-to-date" && (
        <span className="font-metadata-mono text-[11px] text-secondary">You're up to date</span>
      )}
      {state.phase === "available" && (
        <button
          onClick={() => handleInstall(state.update)}
          className="px-2.5 py-1 rounded-md text-[12px] font-body-ui btn-primary"
        >
          Download &amp; install v{state.update.version}
        </button>
      )}
      {state.phase === "downloading" && (
        <span className="font-metadata-mono text-[11px] text-on-surface-variant">
          {state.total
            ? `Downloading… ${Math.round((state.downloaded / state.total) * 100)}%`
            : "Downloading…"}
        </span>
      )}
      {state.phase === "error" && (
        <span className="font-metadata-mono text-[11px] text-error">{state.message}</span>
      )}
    </SubRow>
  );
}

function SubRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap pl-8 pr-6 py-3">
      <div className="shrink-0">
        <span className="font-body-ui text-[13px] text-on-surface block">{label}</span>
        {description && <span className="font-body-ui text-[11px] text-on-surface-variant">{description}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Chip button ───────────────────────────────────────────────────────────────

function ChipButton({ active, onClick, children, mono }: { active: boolean; onClick: () => void; children: React.ReactNode; mono?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[12px] transition-colors ${mono ? "font-metadata-mono" : "font-body-ui"} ${
        active
          ? "btn-primary"
          : "ctl text-on-surface-variant"
      }`}
    >
      {children}
    </button>
  );
}

// ── Shortcuts overlay ─────────────────────────────────────────────────────────

const SHORTCUT_GROUPS: Array<{
  label: string;
  icon: string;
  shortcuts: Array<{ keys: string[]; description: string; note?: string }>;
}> = [
  {
    label: "Navigation",
    icon: "menu_book",
    shortcuts: [
      { keys: ["Ctrl", "P"], description: "Previous chapter" },
      { keys: ["Ctrl", "N"], description: "Next chapter" },
      { keys: ["Alt", "H"], description: "Search history" },
    ],
  },
  {
    label: "Reading",
    icon: "chrome_reader_mode",
    shortcuts: [
      { keys: ["Ctrl", "F"], description: "Toggle fullscreen" },
      { keys: ["Esc"], description: "Exit fullscreen / close panels" },
      { keys: ["Ctrl", "K"], description: "Word search palette", note: "Fullscreen only" },
      { keys: ["Ctrl", "L"], description: "Focus scripture navigator", note: "Fullscreen only" },
    ],
  },
  {
    label: "Parallel",
    icon: "splitscreen",
    shortcuts: [
      { keys: ["splitscreen"], description: "Toggle parallel mode" },
      { keys: ["sync"], description: "Sync scroll between panes", note: "Parallel on" },
    ],
  },
  {
    label: "Font size",
    icon: "format_size",
    shortcuts: [
      { keys: ["Ctrl", "+"], description: "Increase font size by 1px" },
      { keys: ["Ctrl", "−"], description: "Decrease font size by 1px" },
      { keys: ["Ctrl", "Alt", "+"], description: "Jump to next preset size" },
      { keys: ["Ctrl", "Alt", "−"], description: "Jump to previous preset size" },
    ],
  },
  {
    label: "Search",
    icon: "search",
    shortcuts: [
      { keys: ["Alt", "P"], description: "Previous search result" },
      { keys: ["Alt", "N"], description: "Next search result" },
    ],
  },
  {
    label: "Service queue / Schedule",
    icon: "queue_play_next",
    shortcuts: [
      { keys: ["Ctrl", "Q"], description: "Add selected verse(s) to schedule" },
      { keys: ["Ctrl", "Shift", "Q"], description: "Toggle service queue drawer" },
      { keys: ["Shift", "Click"], description: "Select range of scriptures", note: "Live Show" },
    ],
  },
  {
    label: "Presentation",
    icon: "slideshow",
    shortcuts: [
      { keys: ["Ctrl", "1"], description: "Active verse only", note: "Presentation active" },
      { keys: ["Ctrl", "2"], description: "Active + next verse", note: "Presentation active" },
      { keys: ["Ctrl", "3"], description: "Prev + active + next", note: "Presentation active" },
      { keys: ["Ctrl", "4"], description: "Full chapter scroll", note: "Presentation active" },
    ],
  },
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col glass glass-strong rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-secondary">keyboard</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">Keyboard Shortcuts</span>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        {/* min-h-0 is required here: a flex child defaults to min-height:auto,
            which stops it from ever shrinking below its content size — without
            it, this content just grows past the parent's max-h-[80vh] instead
            of activating this div's own overflow-y-auto scroll, so the last
            group(s) get cut off instead of being reachable by scrolling. */}
        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="material-symbols-outlined text-[14px] text-secondary">{group.icon}</span>
                <span className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest">{group.label}</span>
              </div>
              <div className="space-y-1">
                {group.shortcuts.map((s) => (
                  <div key={s.description} className="flex items-center justify-between gap-4 py-1.5 px-2 rounded hover:bg-surface-container-low transition-colors">
                    <div>
                      <span className="font-body-ui text-[13px] text-on-surface">{s.description}</span>
                      {s.note && (
                        <span className="ml-2 font-body-ui text-[10px] text-on-surface-variant italic">{s.note}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, i) => (
                        <span key={i} className="inline-flex items-center justify-center text-on-surface px-1.5 py-0.5 field rounded-md">
                          {/^[a-z_]+$/.test(k)
                            ? <span className="material-symbols-outlined text-[14px] leading-none">{k}</span>
                            : <span className="font-metadata-mono text-[11px]">{k}</span>
                          }
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${value ? "bg-primary" : "bg-on-surface/15"}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${value ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}
