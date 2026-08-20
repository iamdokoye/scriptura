import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type InstalledModule } from "../lib/tauri";

const CANON: { section: string; books: string[] }[] = [
  { section: "Pentateuch", books: ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"] },
  { section: "Historical", books: ["Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther"] },
  { section: "Wisdom", books: ["Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon"] },
  { section: "Major Prophets", books: ["Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel"] },
  { section: "Minor Prophets", books: ["Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi"] },
  { section: "Gospels", books: ["Matthew", "Mark", "Luke", "John"] },
  { section: "Acts", books: ["Acts"] },
  { section: "Epistles", books: ["Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude"] },
  { section: "Revelation", books: ["Revelation"] },
];

export default function BookNavigator() {
  const {
    currentRef, setCurrentRef,
    primaryModule, setPrimaryModule,
    parallelMode, parallelModule, setParallelModule,
  } = useAppStore();

  const [bibleModules, setBibleModules] = useState<InstalledModule[]>([]);
  const [showPrimaryPicker, setShowPrimaryPicker] = useState(false);
  const [showParallelPicker, setShowParallelPicker] = useState(false);
  const primaryPickerRef = useRef<HTMLDivElement>(null);
  const parallelPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listInstalledModules()
      .then((mods) => setBibleModules(mods.filter((m) => m.category === "Bible")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (primaryPickerRef.current && !primaryPickerRef.current.contains(e.target as Node)) {
        setShowPrimaryPicker(false);
      }
      if (parallelPickerRef.current && !parallelPickerRef.current.contains(e.target as Node)) {
        setShowParallelPicker(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <aside className="w-[220px] bg-surface-container-lowest border-r border-outline-variant flex flex-col h-full overflow-y-auto shrink-0">
      <div className="p-4 border-b border-outline-variant">
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface">Study Library</h2>

        {/* Primary translation picker */}
        <div ref={primaryPickerRef} className="relative mt-1.5">
          <button
            onClick={() => setShowPrimaryPicker((v) => !v)}
            className="flex items-center gap-0.5 text-primary hover:opacity-75 transition-opacity max-w-full"
            title="Switch Bible translation"
          >
            <span className="font-metadata-mono text-metadata-mono truncate">
              {primaryModule ?? "No module active"}
            </span>
            <span className="material-symbols-outlined text-[14px] shrink-0">expand_more</span>
          </button>
          {showPrimaryPicker && bibleModules.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-outline-variant rounded-DEFAULT shadow-lg min-w-[160px] max-h-48 overflow-y-auto">
              {bibleModules.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setPrimaryModule(m.id); setShowPrimaryPicker(false); }}
                  className={`w-full text-left px-3 py-2 font-body-ui text-body-ui transition-colors ${
                    m.id === primaryModule
                      ? "bg-secondary-container text-on-secondary-container font-medium"
                      : "hover:bg-surface-container-high text-on-surface"
                  }`}
                >
                  {m.id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Parallel translation picker — only visible when parallel mode is on */}
        {parallelMode && (
          <div ref={parallelPickerRef} className="relative mt-1.5">
            <button
              onClick={() => setShowParallelPicker((v) => !v)}
              className="flex items-center gap-0.5 text-secondary hover:text-primary transition-colors max-w-full"
              title="Switch parallel translation"
            >
              <span className="material-symbols-outlined text-[12px] shrink-0">splitscreen</span>
              <span className="font-metadata-mono text-[11px] truncate ml-0.5">
                {parallelModule ?? "Pick parallel…"}
              </span>
              <span className="material-symbols-outlined text-[12px] shrink-0">expand_more</span>
            </button>
            {showParallelPicker && bibleModules.length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-outline-variant rounded-DEFAULT shadow-lg min-w-[160px] max-h-48 overflow-y-auto">
                {parallelModule && (
                  <button
                    onClick={() => { setParallelModule(null); setShowParallelPicker(false); }}
                    className="w-full text-left px-3 py-2 font-body-ui text-body-ui text-secondary hover:bg-surface-container-high"
                  >
                    — None
                  </button>
                )}
                {bibleModules.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setParallelModule(m.id); setShowParallelPicker(false); }}
                    className={`w-full text-left px-3 py-2 font-body-ui text-body-ui transition-colors ${
                      m.id === parallelModule
                        ? "bg-secondary-container text-on-secondary-container font-medium"
                        : "hover:bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {m.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-2 space-y-1 font-body-ui text-body-ui">
        {CANON.map((group) => (
          <details
            key={group.section}
            open={group.books.includes(currentRef.book)}
            className="group"
          >
            <summary className="flex items-center py-1.5 px-2 hover:bg-surface-container cursor-pointer rounded-DEFAULT select-none text-on-surface-variant font-medium">
              <span className="material-symbols-outlined text-[16px] mr-2 transition-transform group-open:rotate-90">
                chevron_right
              </span>
              {group.section}
            </summary>
            <div className="ml-6 mt-1 border-l border-outline-variant pl-2 space-y-0.5">
              {group.books.map((book) => (
                <button
                  key={book}
                  onClick={() => setCurrentRef({ book, chapter: 1, verse: 1 })}
                  className={`w-full text-left py-1 px-2 rounded-DEFAULT transition-colors ${
                    currentRef.book === book
                      ? "bg-secondary-container text-on-secondary-container font-medium"
                      : "text-secondary hover:bg-surface-container"
                  }`}
                >
                  {book}
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>
    </aside>
  );
}
