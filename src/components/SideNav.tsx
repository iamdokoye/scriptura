import { useAppStore, type View, type Workspace } from "../store/app";

interface NavItem {
  id: View;
  icon: string;
  label: string;
  /** When true the item is shown but not yet clickable */
  comingSoon?: boolean;
}

const STUDY_ITEMS: NavItem[] = [
  { id: "reading",   icon: "menu_book",  label: "Library"   },
  { id: "search",    icon: "search",     label: "Search"    },
  { id: "bookmarks", icon: "bookmark",   label: "Bookmarks" },
  { id: "notes",     icon: "edit_note",  label: "Notes"     },
  { id: "history",   icon: "history",    label: "History"   },
  { id: "modules",   icon: "extension",  label: "Modules"   },
];

const WORSHIP_ITEMS: NavItem[] = [
  { id: "reading",   icon: "slideshow",      label: "Live"    },
  { id: "search",    icon: "queue_music",    label: "Setlist",  comingSoon: true },
  { id: "bookmarks", icon: "library_music",  label: "Songs",    comingSoon: true },
];

interface Props {
  variant: "icon-rail" | "full";
}

export default function SideNav({ variant }: Props) {
  const { view, setView, workspace, setWorkspace } = useAppStore();
  const items = workspace === "worship" ? WORSHIP_ITEMS : STUDY_ITEMS;

  if (variant === "icon-rail") {
    return (
      <nav className="fixed left-0 top-12 h-[calc(100vh-48px)] flex flex-col z-40 bg-surface-container-lowest border-r border-outline-variant dark:border-outline w-[64px] hover:w-[200px] group overflow-hidden transition-all duration-200 shrink-0">
        {/* Nav items */}
        <div className="flex-1 flex flex-col items-start w-full py-4 space-y-1">
          {items.map((item) => {
            const active = view === item.id && !item.comingSoon;
            return (
              <button
                key={item.id + item.label}
                onClick={() => !item.comingSoon && setView(item.id)}
                title={item.comingSoon ? `${item.label} — coming soon` : item.label}
                className={`w-full flex items-center px-4 py-3 transition-all ${
                  item.comingSoon
                    ? "opacity-40 cursor-default"
                    : active
                    ? "bg-secondary-container text-on-secondary-container font-bold border-r-2 border-primary translate-x-0.5"
                    : "text-secondary hover:bg-surface-container-high"
                }`}
              >
                <span className="material-symbols-outlined mr-4 flex-shrink-0 text-[20px]">
                  {item.icon}
                </span>
                <span className="font-body-ui text-body-ui whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                  {item.label}
                  {item.comingSoon && (
                    <span className="text-[9px] font-metadata-mono text-on-surface-variant bg-surface-container px-1 rounded">soon</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Workspace switcher */}
        <WorkspaceSwitcher workspace={workspace} setWorkspace={setWorkspace} compact />
      </nav>
    );
  }

  // full variant
  return (
    <nav className="w-sidebar-width bg-surface-container-lowest border-r border-outline-variant dark:border-outline flex flex-col shrink-0 h-full z-40">
      <div className="p-4 border-b border-outline-variant dark:border-outline">
        <h2 className="font-headline-md text-headline-md font-bold text-primary">Scriptura</h2>
        <p className="font-metadata-mono text-metadata-mono text-on-surface-variant mt-0.5">
          {workspace === "worship" ? "Worship" : "Bible Study"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {items.map((item) => {
          const active = view === item.id && !item.comingSoon;
          return (
            <button
              key={item.id + item.label}
              onClick={() => !item.comingSoon && setView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all text-left ${
                item.comingSoon
                  ? "opacity-40 cursor-default"
                  : active
                  ? "bg-secondary-container text-on-secondary-container font-bold border-r-2 border-primary"
                  : "text-secondary hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="font-body-ui text-body-ui flex-1">{item.label}</span>
              {item.comingSoon && (
                <span className="text-[9px] font-metadata-mono text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">soon</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher workspace={workspace} setWorkspace={setWorkspace} />
    </nav>
  );
}

function WorkspaceSwitcher({
  workspace,
  setWorkspace,
  compact = false,
}: {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  compact?: boolean;
}) {
  return (
    <div className={`border-t border-outline-variant dark:border-outline ${compact ? "p-2" : "p-3"}`}>
      {!compact && (
        <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2 px-1">
          Workspace
        </p>
      )}
      <div className={`flex ${compact ? "flex-col gap-1" : "gap-1"}`}>
        <WorkspaceButton
          label="Study"
          icon="menu_book"
          active={workspace === "study"}
          compact={compact}
          onClick={() => setWorkspace("study")}
        />
        <WorkspaceButton
          label="Worship"
          icon="church"
          active={workspace === "worship"}
          compact={compact}
          onClick={() => setWorkspace("worship")}
        />
      </div>
    </div>
  );
}

function WorkspaceButton({
  label,
  icon,
  active,
  compact,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  if (compact) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={`w-full flex items-center justify-center p-2 rounded-DEFAULT transition-colors ${
          active
            ? "bg-primary text-on-primary"
            : "text-on-surface-variant hover:bg-surface-container-high"
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-DEFAULT font-body-ui text-[12px] transition-colors ${
        active
          ? "bg-primary text-on-primary"
          : "text-on-surface-variant hover:bg-surface-container-high"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );
}
