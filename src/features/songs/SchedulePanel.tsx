import { useSongsLive } from "./liveStore";

export default function SchedulePanel({ width }: { width: number }) {
  const { schedule, previewId, live, preview, goLive, removeFromSchedule, moveInSchedule, clearSchedule } = useSongsLive();

  return (
    <section style={{ width }} className="shrink-0 flex flex-col overflow-hidden panel rounded-3xl">
      <div className="shrink-0 flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-outline-variant">
        <h2 className="font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide">Schedule</h2>
        {schedule.length > 0 && (
          <button
            onClick={() => void clearSchedule()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-error ghost"
            title="Clear the whole schedule"
          >
            <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
            <span className="hidden min-[1100px]:inline">Clear</span>
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {schedule.length === 0 ? (
          <p className="p-4 text-center font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
            Nothing scheduled yet. Double-click a song in the library below to add it.
          </p>
        ) : (
          <ul className="space-y-1">
            {schedule.map((s, i) => {
              const selected = s.id === previewId;
              const isLive = live?.songId === s.id;
              return (
                <li key={s.id} className="group relative">
                  <button
                    onClick={() => void preview(s.id)}
                    onDoubleClick={async () => { await preview(s.id); goLive(0); }}
                    title="Click to preview • Double-click to send live"
                    className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                      selected ? "row-selected border-primary/40 shadow-sm" : "border-outline-variant/50 hover:bg-surface-container-low"
                    }`}
                  >
                    <span className={`font-metadata-mono text-[11px] shrink-0 mt-0.5 ${selected ? "text-primary font-bold" : "text-on-surface-variant"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`font-body-ui text-[13px] font-semibold truncate ${selected ? "text-primary" : "text-on-surface"}`}>{s.title}</span>
                        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse shrink-0" title="Live" />}
                      </span>
                      {s.author && <span className="block font-body-ui text-[11px] text-on-surface-variant truncate">{s.author}</span>}
                    </span>
                  </button>
                  <span className="absolute right-1.5 top-1.5 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-surface/90 rounded-md">
                    <RowBtn icon="arrow_upward" title="Move up" disabled={i === 0} onClick={() => void moveInSchedule(s.id, -1)} />
                    <RowBtn icon="arrow_downward" title="Move down" disabled={i === schedule.length - 1} onClick={() => void moveInSchedule(s.id, 1)} />
                    <RowBtn icon="close" title="Remove from schedule" onClick={() => void removeFromSchedule(s.id)} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function RowBtn({ icon, title, onClick, disabled }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="ghost p-0.5 rounded text-secondary disabled:opacity-30 disabled:pointer-events-none">
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );
}
