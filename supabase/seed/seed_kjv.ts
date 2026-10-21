/**
 * Seed script for public.kjv_verses in Supabase / Postgres.
 *
 * Downloads the public-domain King James Bible (scrollmapper KJV.json),
 * maps the 66 canonical books in order, strips translator [ ] markers,
 * computes a canonical SHA-256 content checksum, loads idempotently,
 * and FAILS LOUDLY unless the database contains exactly 31,102 verses and 66 books.
 *
 * Usage:
 *   # Direct via Supabase admin API (service role key):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node --experimental-strip-types supabase/seed/seed_kjv.ts
 *
 *   # Direct via Postgres connection:
 *   DATABASE_URL=... node --experimental-strip-types supabase/seed/seed_kjv.ts
 *
 *   # Export as idempotent SQL statements:
 *   node --experimental-strip-types supabase/seed/seed_kjv.ts --sql-file supabase/seed/kjv_verses.sql
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const BIBLE_URL =
  "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json";

export const BIBLE_BOOKS = [
  // OT
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
  // NT
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
  "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
] as const;

export interface KjvVerseRow {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  book_order: number;
}

export async function loadRawKjvData(): Promise<any> {
  const localCandidates = ["/tmp/KJV.json", "./supabase/seed/KJV.json"];
  for (const p of localCandidates) {
    if (fs.existsSync(p)) {
      console.log(`[seed] Reading cached source from ${p}`);
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }

  console.log(`[seed] Downloading KJV from ${BIBLE_URL}...`);
  const res = await fetch(BIBLE_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`Failed to download KJV source: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

export function parseAndFormatVerses(data: any): { verses: KjvVerseRow[]; checksum: string } {
  const rawBooks = data?.books;
  if (!Array.isArray(rawBooks)) {
    throw new Error("Invalid KJV JSON structure: missing 'books' array");
  }
  if (rawBooks.length !== BIBLE_BOOKS.length) {
    throw new Error(`Expected ${BIBLE_BOOKS.length} books in source, found ${rawBooks.length}`);
  }

  const verses: KjvVerseRow[] = [];
  const hasher = crypto.createHash("sha256");

  for (let i = 0; i < BIBLE_BOOKS.length; i++) {
    const bookName = BIBLE_BOOKS[i];
    const bookData = rawBooks[i];
    const bookOrder = i + 1;

    for (const chapter of bookData.chapters || []) {
      const chapterNum = Number(chapter.chapter);
      for (const v of chapter.verses || []) {
        const verseNum = Number(v.verse);
        // Strips translator [ ] marks and collapses whitespace
        const cleanText = String(v.text ?? "")
          .replace(/\[/g, "")
          .replace(/\]/g, "")
          .split(/\s+/)
          .filter(Boolean)
          .join(" ");

        if (!cleanText) continue;

        const row: KjvVerseRow = {
          book: bookName,
          chapter: chapterNum,
          verse: verseNum,
          text: cleanText,
          book_order: bookOrder,
        };

        verses.push(row);
        hasher.update(`${bookName}:${bookOrder}:${chapterNum}:${verseNum}:${cleanText}\n`);
      }
    }
  }

  const checksum = hasher.digest("hex");
  return { verses, checksum };
}

export function escapeSqlString(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export async function generateSqlSeedFile(verses: KjvVerseRow[], outputPath: string) {
  console.log(`[seed] Generating SQL seed file at ${outputPath}...`);
  const writeStream = fs.createWriteStream(outputPath, { encoding: "utf8" });
  writeStream.write("-- Seed for public.kjv_verses\nBEGIN;\n");

  const batchSize = 1000;
  for (let i = 0; i < verses.length; i += batchSize) {
    const batch = verses.slice(i, i + batchSize);
    const values = batch
      .map(
        (v) =>
          `(${escapeSqlString(v.book)}, ${v.chapter}, ${v.verse}, ${escapeSqlString(v.text)}, ${v.book_order})`
      )
      .join(",\n  ");

    writeStream.write(
      `INSERT INTO public.kjv_verses (book, chapter, verse, text, book_order)\nVALUES\n  ${values}\nON CONFLICT (book, chapter, verse) DO UPDATE SET text = EXCLUDED.text, book_order = EXCLUDED.book_order;\n`
    );
  }

  writeStream.write("COMMIT;\n");
  await new Promise((resolve) => writeStream.end(resolve));
  console.log(`[seed] Successfully generated ${outputPath} (${verses.length} verses)`);
}

export async function seedViaSupabaseClient(
  supabaseUrl: string,
  serviceKey: string,
  verses: KjvVerseRow[]
) {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[seed] Uploading ${verses.length} verses to Supabase via service role...`);
  const batchSize = 500;
  for (let i = 0; i < verses.length; i += batchSize) {
    const batch = verses.slice(i, i + batchSize);
    const { error } = await supabase.from("kjv_verses").upsert(batch, {
      onConflict: "book,chapter,verse",
    });
    if (error) {
      throw new Error(`Failed to upsert batch at offset ${i}: ${error.message}`);
    }
    if ((i + batchSize) % 5000 < batchSize || i + batchSize >= verses.length) {
      console.log(`[seed] Processed ${Math.min(i + batchSize, verses.length)} / ${verses.length} verses`);
    }
  }

  // Verification step
  console.log("[seed] Verifying database row count...");
  const { count, error: countErr } = await supabase
    .from("kjv_verses")
    .select("*", { count: "exact", head: true });
  if (countErr) throw new Error(`Verification query failed: ${countErr.message}`);

  if (count !== 31102) {
    throw new Error(`FATAL: Verification failed! Expected 31,102 rows, found ${count}`);
  }
}

export async function run() {
  const args = process.argv.slice(2);
  const sqlFileIdx = args.indexOf("--sql-file");
  const sqlFilePath = sqlFileIdx !== -1 ? args[sqlFileIdx + 1] : null;

  const raw = await loadRawKjvData();
  const { verses, checksum } = parseAndFormatVerses(raw);

  const distinctBooks = new Set(verses.map((v) => v.book)).size;

  console.log("--------------------------------------------------");
  console.log(`[seed] Parsed verses:  ${verses.length}`);
  console.log(`[seed] Canonical books: ${distinctBooks}`);
  console.log(`[seed] SHA-256 digest:  ${checksum}`);
  console.log("--------------------------------------------------");

  if (verses.length !== 31102 || distinctBooks !== 66) {
    throw new Error(
      `FATAL: Invalid verse parsing: expected 31,102 verses and 66 books, got ${verses.length} verses and ${distinctBooks} books`
    );
  }

  if (sqlFilePath) {
    await generateSqlSeedFile(verses, sqlFilePath);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    await seedViaSupabaseClient(supabaseUrl, serviceKey, verses);
    console.log(`[seed] SUCCESS: Seeded and verified 31,102 rows across 66 books.`);
  } else if (!sqlFilePath) {
    console.log("[seed] No SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY provided.");
    console.log("[seed] Tip: pass --sql-file supabase/seed/kjv_verses.sql to produce an SQL file,");
    console.log("[seed] or provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  }
}

// If invoked directly from CLI:
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error("[seed] FATAL ERROR:", err);
    process.exit(1);
  });
}
