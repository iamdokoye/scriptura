import { useAppStore, type View } from "../store/app";

interface NavItem {
  id: View;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "reading",   icon: "menu_book",     label: "Library"   },
  { id: "bookmarks", icon: "bookmark",      label: "Bookmarks" },
  { id: "search",    icon: "search",        label: "Search"    },
  { id: "songs",     icon: "music_note",    label: "Songs"     },
  { id: "history",   icon: "history",       label: "History"   },
  { id: "modules",   icon: "extension",     label: "Modules"   },
  { id: "notes",     icon: "edit_note",     label: "Notes"     },
];

interface Props {
  // "icon-rail" = 64px collapsed with hover-expand (reading contexts)
  // "full" = 280px always visible (utility views)
  variant: "icon-rail" | "full";
}

export default function SideNav({ variant }: Props) {
  const { view, setView } = useAppStore();

  if (variant === "icon-rail") {
    return (
      <nav className="fixed left-0 top-12 h-[calc(100vh-48px)] flex flex-col z-40 bg-surface-container-lowest border-r border-outline-variant dark:border-outline w-[64px] hover:w-[200px] group overflow-hidden transition-all duration-200 shrink-0">
        <div className="flex flex-col h-full items-start w-full py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full flex items-center px-4 py-3 transition-all ${
                  active
                    ? "bg-secondary-container text-on-secondary-container font-bold border-r-2 border-primary translate-x-0.5"
                    : "text-secondary hover:bg-surface-container-high"
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
    <nav className="w-sidebar-width bg-surface-container-lowest border-r border-outline-variant dark:border-outline flex flex-col shrink-0 h-full z-40">
      <div className="p-4 border-b border-outline-variant dark:border-outline">
        <h2 className="font-headline-md text-headline-md font-bold text-primary">
          Scriptura
        </h2>
        <p className="font-metadata-mono text-metadata-mono text-on-surface-variant mt-0.5">
          Bible Study
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all text-left ${
                active
                  ? "bg-secondary-container text-on-secondary-container font-bold border-r-2 border-primary"
                  : "text-secondary hover:bg-surface-container-high"
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
