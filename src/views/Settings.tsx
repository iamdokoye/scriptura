import { useEffect, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type Preferences } from "../lib/tauri";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import SideNav from "../components/SideNav";

const DEFAULT_PREFS: Preferences = {
  theme: "light",
  font_size_reading: 18,
  show_strongs: true,
  show_morph: false,
  verse_display: "verse-per-line",
  default_commentary: null,
};

export default function Settings() {
  const { setTheme, setShowStrongs, setReadingFontSize, showCommentary, setShowCommentary, showNotes, setShowNotes, showCrossRefs, setShowCrossRefs, showRedLetter, setShowRedLetter, displayPrefs, setDisplayPrefs } = useAppStore();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPreferences().then(setPrefs).catch(() => {});
  }, []);

  async function save(update: Partial<Preferences>) {
    const next = { ...prefs, ...update };
    setPrefs(next);
    setSaving(true);
    try {
      await api.setPreferences(update);
      if (update.theme) setTheme(update.theme);
      if (update.show_strongs !== undefined) setShowStrongs(update.show_strongs);
      if (update.font_size_reading !== undefined) setReadingFontSize(update.font_size_reading);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />

      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-2xl mx-auto p-8 space-y-8">
          <div>
            <h1 className="font-display-lg text-display-lg text-on-surface mb-1">Settings</h1>
            <p className="font-body-ui text-body-ui text-on-surface-variant">Preferences for Scriptura.</p>
          </div>

          {/* Appearance */}
          <SettingsCard title="Appearance" icon="palette">
            <SettingsRow label="Theme">
              <div className="flex flex-wrap gap-2">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => save({ theme: t })}
                    className={`px-3 py-1.5 rounded-DEFAULT font-body-ui text-body-ui capitalize text-sm transition-colors ${
                      prefs.theme === t
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </SettingsRow>
            <SettingsRow label="Reading font size" description="Ctrl+± for 1px steps · Ctrl+Alt+± for preset jumps">
              <div className="flex items-center gap-2 flex-wrap">
                {([14, 16, 32, 48, 64, 72, 98] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => save({ font_size_reading: size })}
                    className={`px-2.5 py-1 rounded-DEFAULT font-metadata-mono text-[11px] transition-colors ${
                      prefs.font_size_reading === size
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {size}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-1">
                  <button onClick={() => save({ font_size_reading: Math.max(14, prefs.font_size_reading - 1) })}
                    className="w-7 h-7 rounded-DEFAULT bg-surface-container hover:bg-surface-container-high flex items-center justify-center font-bold text-on-surface text-sm">−</button>
                  <span className="font-metadata-mono text-metadata-mono text-on-surface w-12 text-center">{prefs.font_size_reading}px</span>
                  <button onClick={() => save({ font_size_reading: Math.min(98, prefs.font_size_reading + 1) })}
                    className="w-7 h-7 rounded-DEFAULT bg-surface-container hover:bg-surface-container-high flex items-center justify-center font-bold text-on-surface text-sm">+</button>
                </div>
              </div>
            </SettingsRow>
            <SettingsRow label="Verse layout">
              <div className="flex flex-wrap gap-2">
                {(["verse-per-line", "paragraph"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => save({ verse_display: v })}
                    className={`px-3 py-1.5 rounded-DEFAULT font-body-ui text-body-ui text-sm transition-colors ${
                      prefs.verse_display === v
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {v === "verse-per-line" ? "Verse per line" : "Paragraph"}
                  </button>
                ))}
              </div>
            </SettingsRow>
          </SettingsCard>

          {/* Study tools */}
          <SettingsCard title="Study Tools" icon="school">
            <SettingsRow label="Show Strong's numbers">
              <Toggle value={prefs.show_strongs} onChange={(v) => save({ show_strongs: v })} />
            </SettingsRow>
            <SettingsRow label="Show morphology tags">
              <Toggle value={prefs.show_morph} onChange={(v) => save({ show_morph: v })} />
            </SettingsRow>
            <SettingsRow label="Commentary" description="Shows the Matthew Henry commentary icon on verse hover.">
              <Toggle value={showCommentary} onChange={setShowCommentary} />
            </SettingsRow>
            <SettingsRow label="Notes" description="Shows the notes icon on verse hover to add and view notes.">
              <Toggle value={showNotes} onChange={setShowNotes} />
            </SettingsRow>
            <SettingsRow label="Cross-references" description="Shows related verses for each passage. Requires the TSK module (auto-installed).">
              <Toggle value={showCrossRefs} onChange={setShowCrossRefs} />
            </SettingsRow>
            <SettingsRow label="Red letter text" description="Highlights the words of Jesus in red. Supported by OSIS and GBF modules (e.g. KJV, ASV).">
              <Toggle value={showRedLetter} onChange={setShowRedLetter} />
            </SettingsRow>
          </SettingsCard>

          {/* Presentation */}
          <SettingsCard title="Presentation" icon="slideshow">
            <SettingsRow
              label="Verse context"
              description="Controls how many verses appear on the live presentation window. Use Ctrl+1–4 to switch live."
            >
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 1, label: "Active only", icon: "filter_1", desc: "Single active verse" },
                  { value: 2, label: "Active + Next", icon: "filter_2", desc: "Active verse and the next" },
                  { value: 3, label: "Prev + Active + Next", icon: "filter_3", desc: "Three verses centred on active" },
                  { value: 4, label: "Full chapter", icon: "density_medium", desc: "Scrollable chapter view" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDisplayPrefs({ presentationContext: opt.value })}
                    title={opt.desc}
                    className={`flex items-center gap-2 px-3 py-2 rounded-DEFAULT font-body-ui text-sm transition-colors ${
                      displayPrefs.presentationContext === opt.value
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </SettingsRow>
          </SettingsCard>

          {/* Sync & Backup — disabled stub */}
          <SettingsCard title="Sync & Backup" icon="sync">
            <div className="flex items-start gap-3 p-3 rounded-DEFAULT bg-surface-container">
              <span className="material-symbols-outlined text-on-surface-variant text-[20px] mt-0.5">cloud_off</span>
              <div>
                <p className="font-body-ui text-body-ui text-on-surface font-medium">Cloud sync — coming soon</p>
                <p className="font-body-ui text-[13px] text-on-surface-variant mt-0.5">
                  Sync your notes and bookmarks across devices. Not yet available in this version.
                </p>
              </div>
            </div>
          </SettingsCard>

          {/* Help */}
          <SettingsCard title="Help" icon="help">
            <SettingsRow label="Tutorial" description="Step-by-step walkthrough of Scriptura's features.">
              <button
                disabled
                className="flex items-center gap-2 px-3 py-1.5 rounded-DEFAULT font-body-ui text-sm bg-surface-container text-on-surface-variant opacity-50 cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">play_circle</span>
                Coming soon
              </button>
            </SettingsRow>

            <div className="px-4 py-3 space-y-3 border-t border-outline-variant">
              <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">FAQs</p>
              {([
                { q: "How do I install Bible modules?", a: "Go to the Modules view (bookshelf icon), search for a translation, and click Install." },
                { q: "How do I start a presentation?", a: "Click the slideshow icon in the top bar to open the Presentation window, then navigate verses from the reading view." },
                { q: "What are Strong's numbers?", a: "Strong's numbers link each word to its original Hebrew or Greek dictionary entry. Enable them in Study Tools settings." },
                { q: "How do I change the font or size?", a: "Open Settings → Appearance → Text Settings to adjust font family, size, margins, and spacing." },
              ] as const).map(({ q, a }) => (
                <details key={q} className="group">
                  <summary className="font-body-ui text-[13px] text-on-surface cursor-pointer list-none flex items-start justify-between gap-2 py-1">
                    <span>{q}</span>
                    <span className="material-symbols-outlined text-[16px] text-secondary shrink-0 mt-0.5 group-open:rotate-180 transition-transform">expand_more</span>
                  </summary>
                  <p className="font-body-ui text-[12px] text-on-surface-variant mt-1.5 leading-relaxed">{a}</p>
                </details>
              ))}
            </div>

            <SettingsRow label="Send feedback" description="Report a bug or suggest a feature — opens your mail app.">
              <button
                onClick={() => {
                  const subject = encodeURIComponent("Feedback regarding Scriptura v0.1.0");
                  const body = encodeURIComponent(
                    "Hi,\n\nI have the following question or comment:\n\n\n\n---\nScriptura v0.1.0 · macOS"
                  );
                  shellOpen(`mailto:okkodann@gmail.com?subject=${subject}&body=${body}`).catch(() => {});
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-DEFAULT font-body-ui text-sm bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">mail</span>
                Email us
              </button>
            </SettingsRow>
          </SettingsCard>

          {/* About */}
          <SettingsCard title="About" icon="info">
            <div className="font-body-ui text-body-ui text-on-surface-variant space-y-1">
              <p>Scriptura — open-source desktop Bible study</p>
              <p className="font-metadata-mono text-metadata-mono">Version 0.1.0-dev</p>
              <p className="text-[13px] mt-2">
                SWORD module format is copyright The SWORD Project contributors.
                Public-domain texts (KJV, WEB) are freely distributable.
              </p>
            </div>
          </SettingsCard>

          {saving && (
            <p className="font-metadata-mono text-metadata-mono text-secondary text-center">Saving…</p>
          )}
        </div>
      </main>
    </div>
  );
}

function SettingsCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="border border-outline-variant rounded-DEFAULT bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant bg-surface-container-low">
        <span className="material-symbols-outlined text-[18px] text-secondary">{icon}</span>
        <h2 className="font-headline-md text-[16px] font-medium text-on-surface">{title}</h2>
      </div>
      <div className="divide-y divide-outline-variant">{children}</div>
    </div>
  );
}

function SettingsRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-x-4 gap-y-1 flex-wrap px-4 py-3">
      <div className="shrink-0">
        <span className="font-body-ui text-body-ui text-on-surface block">{label}</span>
        {description && (
          <span className="font-body-ui text-[11px] text-on-surface-variant">{description}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full overflow-hidden transition-colors ${value ? "bg-primary" : "bg-surface-container-high"}`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}
