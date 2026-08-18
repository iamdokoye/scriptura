import { useAppStore } from "../store/app";

// Canonical book list — OT then NT
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
  const { currentRef, setCurrentRef, primaryModule } = useAppStore();

  return (
    <aside className="w-[220px] bg-surface-container-lowest border-r border-outline-variant flex flex-col h-full overflow-y-auto shrink-0">
      <div className="p-4 border-b border-outline-variant">
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface">Study Library</h2>
        <p className="font-metadata-mono text-metadata-mono text-secondary mt-1">
          {primaryModule ?? "No module active"}
        </p>
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
