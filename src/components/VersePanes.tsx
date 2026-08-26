import { memo, useEffect, useRef } from "react";
import type { ChapterText, TextSpan } from "../lib/tauri";
import type { DisplayPrefs } from "../store/app";

export const FONT_FAMILY_CSS: Record<string, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  serif:  `Georgia, "Palatino Linotype", Palatino, serif`,
  times:  `"Times New Roman", Times, serif`,
  mono:   `"Courier New", Courier, monospace`,
};

export function PrimaryPane({
  chapter, loading, error, currentVerse, onStrongsClick, onVerseClick, onCrossRefClick, onCompareClick, onCommentaryClick, onNotesClick, onAddToServiceClick, showBorder, showStrongs, showCrossRefs, showRedLetter, showCommentary, showNotes, readingFontSize, displayPrefs, fullscreen, scrollContainerRef,
}: {
  chapter: ChapterText | null;
  loading: boolean;
  error: string | null;
  currentVerse: number;
  onStrongsClick: (numbers: string[]) => void;
  onVerseClick: (verse: number) => void;
  onCrossRefClick: (verse: number) => void;
  onCompareClick: (verse: number) => void;
  onCommentaryClick: (verse: number) => void;
  onNotesClick: (verse: number) => void;
  /** Omitted entirely in Study workspace — service queue is a Presentation-only feature. */
  onAddToServiceClick?: (verse: number) => void;
  showBorder: boolean;
  showStrongs: boolean;
  showCrossRefs: boolean;
  showRedLetter: boolean;
  showCommentary: boolean;
  showNotes: boolean;
  readingFontSize: number;
  displayPrefs: DisplayPrefs;
  fullscreen?: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = (scrollContainerRef ?? internalRef) as React.RefObject<HTMLDivElement>;
  const prevChapterRef = useRef<ChapterText | null>(null);

  useEffect(() => {
    if (!chapter) return;
    const isNewChapter = chapter !== prevChapterRef.current;
    prevChapterRef.current = chapter;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-verse="${currentVerse}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: isNewChapter ? "start" : "nearest" });
  }, [chapter, currentVerse]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><span className="font-body-ui text-body-ui text-on-surface-variant">Loading…</span></div>;
  if (error) return <div className="flex-1 p-8"><p className="font-body-ui text-body-ui text-error">{error}</p></div>;
  if (!chapter) return <div className="flex-1 flex items-center justify-center"><span className="font-body-ui text-body-ui text-on-surface-variant">Select a module to begin reading.</span></div>;

  const maxWidth = fullscreen ? "100%" : "1100px";
  const horizPadding = `max(16px, ${displayPrefs.margins / 2}%)`;
  const textStyle: React.CSSProperties = {
    fontSize: `${readingFontSize}px`,
    lineHeight: 1 + displayPrefs.lineSpacing,
    letterSpacing: displayPrefs.letterSpacing === 0 ? undefined : `${(displayPrefs.letterSpacing * 0.1).toFixed(3)}em`,
    textAlign: displayPrefs.textAlign,
    fontFamily: FONT_FAMILY_CSS[displayPrefs.fontFamily],
  };

  return (
    <div ref={scrollRef} className={`flex-1 overflow-y-auto ${showBorder ? "border-r border-outline-variant" : ""}`}>
      <div className="mx-auto w-full py-8 space-y-4" style={{ maxWidth, paddingLeft: horizPadding, paddingRight: horizPadding }}>
        {chapter.verses.map((v) => (
          <VerseRow
            key={v.verse}
            verse={v.verse}
            spans={v.spans}
            active={v.verse === currentVerse}
            onStrongsClick={onStrongsClick}
            onVerseClick={() => onVerseClick(v.verse)}
            onCrossRefClick={() => onCrossRefClick(v.verse)}
            onCompareClick={() => onCompareClick(v.verse)}
            onCommentaryClick={() => onCommentaryClick(v.verse)}
            onNotesClick={() => onNotesClick(v.verse)}
            onAddToServiceClick={onAddToServiceClick && (() => onAddToServiceClick(v.verse))}
            showStrongs={showStrongs}
            showCrossRefs={showCrossRefs}
            showRedLetter={showRedLetter}
            showCommentary={showCommentary}
            showNotes={showNotes}
            textStyle={textStyle}
          />
        ))}
      </div>
    </div>
  );
}

export function ParallelPane({ chapter, onStrongsClick, showStrongs, readingFontSize, displayPrefs, scrollContainerRef }: { chapter: ChapterText; onStrongsClick: (numbers: string[]) => void; showStrongs: boolean; readingFontSize: number; displayPrefs: DisplayPrefs; scrollContainerRef?: React.RefObject<HTMLDivElement | null> }) {
  const horizPadding = `max(16px, ${displayPrefs.margins / 2}%)`;
  const textStyle: React.CSSProperties = {
    fontSize: `${readingFontSize}px`,
    lineHeight: 1 + displayPrefs.lineSpacing,
    letterSpacing: displayPrefs.letterSpacing === 0 ? undefined : `${(displayPrefs.letterSpacing * 0.1).toFixed(3)}em`,
    textAlign: displayPrefs.textAlign,
    fontFamily: FONT_FAMILY_CSS[displayPrefs.fontFamily],
  };
  return (
    <div ref={scrollContainerRef as React.RefObject<HTMLDivElement>} className="flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto w-full py-8 space-y-4" style={{ paddingLeft: horizPadding, paddingRight: horizPadding }}>
        <h2 className="font-headline-md text-headline-md text-primary mb-4 border-b border-outline-variant pb-2">
          {chapter.module_id}
        </h2>
        {chapter.verses.map((v) => (
          <VerseRow
            key={v.verse}
            verse={v.verse}
            spans={v.spans}
            active={false}
            onStrongsClick={onStrongsClick}
            onVerseClick={() => {}}
            onCrossRefClick={() => {}}
            onCompareClick={() => {}}
            onCommentaryClick={() => {}}
            onNotesClick={() => {}}
            showStrongs={showStrongs}
            showCrossRefs={false}
            showRedLetter={false}
            showCommentary={false}
            showNotes={false}
            textStyle={textStyle}
          />
        ))}
      </div>
    </div>
  );
}

export const VerseRow = memo(function VerseRow({
  verse, spans, active, onStrongsClick, onVerseClick, onCrossRefClick, onCompareClick, onCommentaryClick, onNotesClick, onAddToServiceClick, showStrongs, showCrossRefs, showRedLetter, showCommentary, showNotes, textStyle,
}: {
  verse: number;
  spans: TextSpan[];
  active: boolean;
  onStrongsClick: (numbers: string[]) => void;
  onVerseClick: () => void;
  onCrossRefClick: () => void;
  onCompareClick: () => void;
  onCommentaryClick: () => void;
  onNotesClick: () => void;
  onAddToServiceClick?: () => void;
  showStrongs: boolean;
  showCrossRefs: boolean;
  showRedLetter: boolean;
  showCommentary: boolean;
  showNotes: boolean;
  textStyle: React.CSSProperties;
}) {
  return (
    <div
      data-verse={verse}
      className={`verse-container relative group flex gap-3 p-verse-padding rounded-DEFAULT transition-colors cursor-pointer ${
        active
          ? "bg-surface-container-lowest border border-outline-variant shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
          : "hover:bg-surface-container-low"
      }`}
      onClick={onVerseClick}
    >
      <span
        className={`font-verse-number text-verse-number mt-2 w-6 text-right select-none shrink-0 ${
          active ? "text-primary font-bold" : "text-secondary"
        }`}
      >
        {verse}
      </span>
      <p
        className="font-body-reading text-on-surface flex-1 select-text"
        style={textStyle}
      >
        {spans.map((span, i) => {
          const red = showRedLetter && span.is_red_letter;
          const strongsNumbers = span.strongs ?? [];
          if (strongsNumbers.length > 0 && showStrongs) {
            return (
              <span
                key={i}
                className={`strongs-word relative group/word border-b border-dashed hover:bg-secondary/10 pb-0.5 ${red ? "text-red-600 dark:text-red-400 border-red-400" : "border-primary"}`}
                title={strongsNumbers.length === 1 ? "Double-click to look up in concordance" : "Double-click to look up this phrase's Strong's numbers"}
                onDoubleClick={(e) => { e.stopPropagation(); onStrongsClick(strongsNumbers); }}
              >
                <span className="strongs-tag absolute -top-3 left-1/2 -translate-x-1/2 flex gap-1 whitespace-nowrap font-metadata-mono text-[9px] text-secondary opacity-0 transition-opacity">
                  {strongsNumbers.map((strongs) => (
                    <button
                      key={strongs}
                      type="button"
                      className="hover:text-primary hover:underline"
                      title={`Look up ${strongs}`}
                      onClick={(e) => { e.stopPropagation(); onStrongsClick([strongs]); }}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      {strongs}
                    </button>
                  ))}
                </span>
                {span.text}
              </span>
            );
          }
          if (span.is_added) {
            return <em key={i} className={red ? "text-red-600 dark:text-red-400" : undefined}>{span.text}</em>;
          }
          return <span key={i} className={red ? "text-red-600 dark:text-red-400" : undefined}>{span.text}</span>;
        })}
      </p>

      <div className="verse-actions absolute -right-2 top-2 opacity-0 pointer-events-none flex flex-col gap-1 bg-surface border border-outline-variant shadow-sm rounded p-1 transition-opacity z-10">
        <button className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded" title="Copy">
          <span className="material-symbols-outlined text-[16px]">content_copy</span>
        </button>
        {showNotes && (
          <button
            className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
            title="Add note"
            onClick={(e) => { e.stopPropagation(); onNotesClick(); }}
          >
            <span className="material-symbols-outlined text-[16px]">edit_note</span>
          </button>
        )}
        <button className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded" title="Bookmark">
          <span className="material-symbols-outlined text-[16px]">bookmark_add</span>
        </button>
        {showCommentary && (
          <button
            className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
            title="Commentary"
            onClick={(e) => { e.stopPropagation(); onCommentaryClick(); }}
          >
            <span className="material-symbols-outlined text-[16px]">library_books</span>
          </button>
        )}
        {showCrossRefs && (
          <button
            className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
            title="Cross-references"
            onClick={(e) => { e.stopPropagation(); onCrossRefClick(); }}
          >
            <span className="material-symbols-outlined text-[16px]">link</span>
          </button>
        )}
        <button
          className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
          title="Compare translations"
          onClick={(e) => { e.stopPropagation(); onCompareClick(); }}
        >
          <span className="material-symbols-outlined text-[16px]">compare</span>
        </button>
        {onAddToServiceClick && (
          <button
            className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
            title="Add to service queue"
            onClick={(e) => { e.stopPropagation(); onAddToServiceClick(); }}
          >
            <span className="material-symbols-outlined text-[16px]">playlist_add</span>
          </button>
        )}
      </div>
    </div>
  );
});
