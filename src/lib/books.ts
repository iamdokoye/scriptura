export interface BookGroup {
  label: string;
  testament: "OT" | "NT";
  books: string[];
}

export const BOOK_GROUPS: BookGroup[] = [
  {
    label: "Pentateuch",
    testament: "OT",
    books: ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"],
  },
  {
    label: "History",
    testament: "OT",
    books: [
      "Joshua", "Judges", "Ruth",
      "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
      "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther",
    ],
  },
  {
    label: "Poetry & Wisdom",
    testament: "OT",
    books: ["Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon"],
  },
  {
    label: "Major Prophets",
    testament: "OT",
    books: ["Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel"],
  },
  {
    label: "Minor Prophets",
    testament: "OT",
    books: [
      "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
      "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
    ],
  },
  {
    label: "Gospels",
    testament: "NT",
    books: ["Matthew", "Mark", "Luke", "John"],
  },
  {
    label: "Acts",
    testament: "NT",
    books: ["Acts"],
  },
  {
    label: "Paul's Epistles",
    testament: "NT",
    books: [
      "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
      "Ephesians", "Philippians", "Colossians",
      "1 Thessalonians", "2 Thessalonians",
      "1 Timothy", "2 Timothy", "Titus", "Philemon",
    ],
  },
  {
    label: "General Epistles",
    testament: "NT",
    books: ["Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude"],
  },
  {
    label: "Revelation",
    testament: "NT",
    books: ["Revelation"],
  },
];

export const OT_BOOKS = BOOK_GROUPS.filter((g) => g.testament === "OT").flatMap((g) => g.books);
export const NT_BOOKS = BOOK_GROUPS.filter((g) => g.testament === "NT").flatMap((g) => g.books);
export const ALL_BOOKS = [...OT_BOOKS, ...NT_BOOKS];
