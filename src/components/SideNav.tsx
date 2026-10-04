import { useAppStore, type View } from "../store/app";

interface NavItem {
  id: View;
  icon: string;
  label: string;
}

const NAV_ITEMS: Record<View, NavItem> = {
  reading:    { id: "reading",   icon: "menu_book",  label: "Library"   },
  live:       { id: "live",      icon: "live_tv",    label: "Live Show" },
  bookmarks:  { id: "bookmarks", icon: "bookmark",   label: "Bookmarks" },
  search:     { id: "search",    icon: "search",     label: "Search"    },
  history:    { id: "history",   icon: "history",    label: "History"   },
  modules:    { id: "modules",   icon: "extension",  label: "Modules"   },
  notes:      { id: "notes",     icon: "edit_note",  label: "Notes"     },
  customize:  { id: "customize", icon: "palette",    label: "Customize" },
};

// Study mode is the personal-study experience only — Live Show and
// Customize (presentation themes) don't exist there at all, not just
// reordered lower. Choosing Presentation adds them on top of everything
// Study already has (see Preferences.workspace, src-tauri/src/types.rs).
const STUDY_ORDER: View[] = ["reading", "bookmarks", "search", "history", "modules", "notes"];
const PRESENTATION_ORDER: View[] = ["live", "reading", "customize", "search", "modules", "bookmarks", "notes", "history"];

interface Props {
  // "icon-rail" = 64px collapsed with hover-expand (reading contexts)
  // "full" = 280px always visible (utility views)
  variant: "icon-rail" | "full";
}

export default function SideNav({ variant }: Props) {
  const { view, setView, workspace } = useAppStore();
  const items = (workspace === "presentation" ? PRESENTATION_ORDER : STUDY_ORDER).map((id) => NAV_ITEMS[id]);

  if (variant === "icon-rail") {
    return (
      <nav className="fixed left-0 top-14 h-[calc(100vh-56px)] flex flex-col z-40 glass !rounded-none !border-y-0 !border-l-0 w-[64px] hover:w-[200px] group overflow-hidden transition-all duration-200 shrink-0">
        <div className="flex flex-col h-full items-start w-full py-4 px-2 space-y-2">
          {items.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-all ${
                  active ? "ctl-active font-bold" : "text-secondary hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined mr-4 flex-shrink-0 text-[20px]">
                  {item.icon}
                </span>
                <span className="font-body-ui text-body-ui whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // full variant
  return (
    <nav className="w-sidebar-width glass !rounded-none !border-y-0 !border-l-0 h-full flex flex-col shrink-0 z-40">
      <div className="p-5 pb-3">
        <h2 className="font-headline-md text-headline-md font-bold text-primary">
          Scriptura
        </h2>
        <p className="font-metadata-mono text-metadata-mono text-on-surface-variant mt-0.5">
          {workspace === "presentation" ? "Live Presentation" : "Bible Study"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1.5">
        {items.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-left ${
                active ? "ctl-active font-bold" : "text-secondary hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="font-body-ui text-body-ui">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
