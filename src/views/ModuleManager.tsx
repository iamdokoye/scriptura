import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/app";
import { api, type ModuleInfo } from "../lib/tauri";
import SideNav from "../components/SideNav";

type Category = ModuleInfo["category"] | "All";
const CATEGORIES: Category[] = ["All", "Bible", "Commentary", "Lexicon", "Dictionary", "Devotional"];

interface InstallState {
  [moduleId: string]: { progress: number; status: "idle" | "downloading" | "indexing" | "done" | "error"; message?: string };
}

export default function ModuleManager() {
  const { setHasModules, setPrimaryModule } = useAppStore();
  const [available, setAvailable] = useState<ModuleInfo[]>([]);
  const [installed, setInstalled] = useState<ModuleInfo[]>([]);
  const [tab, setTab] = useState<"available" | "installed">("available");
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [installState, setInstallState] = useState<InstallState>({});
  const [cipherModal, setCipherModal] = useState<{ moduleId: string; name: string } | null>(null);
  const [cipherKey, setCipherKey] = useState("");

  useEffect(() => {
    Promise.all([api.listAvailableModules(), api.listInstalledModules()]).then(
      ([avail, inst]) => {
        setAvailable(avail);
        setInstalled(inst);
        if (inst.length > 0) {
          setHasModules(true);
          const bible = inst.find((m) => m.category === "Bible");
          if (bible) setPrimaryModule(bible.id);
        }
        setLoading(false);
      }
    );

    // Listen for install progress events from Rust backend
    const unlisten = listen<{ module_id: string; progress: number; message: string }>(
      "module-install-progress",
      (event) => {
        const { module_id, progress, message } = event.payload;
        setInstallState((prev) => ({
          ...prev,
          [module_id]: {
            progress,
            status: progress < 50 ? "downloading" : progress < 100 ? "indexing" : "done",
            message,
          },
        }));
        if (progress === 100) {
          // Refresh installed list
          api.listInstalledModules().then((inst) => {
            setInstalled(inst);
            setHasModules(inst.length > 0);
          });
        }
      }
    );

    return () => { unlisten.then((f) => f()); };
  }, []);

  async function install(module_id: string, requires_key: boolean, name: string) {
    if (requires_key) {
      setCipherModal({ moduleId: module_id, name });
      return;
    }
    setInstallState((prev) => ({ ...prev, [module_id]: { progress: 0, status: "downloading" } }));
    try {
      await api.installModule(module_id);
    } catch (e) {
      setInstallState((prev) => ({ ...prev, [module_id]: { progress: 0, status: "error", message: String(e) } }));
    }
  }

  async function installWithKey() {
    if (!cipherModal) return;
    const { moduleId } = cipherModal;
    setCipherModal(null);
    setInstallState((prev) => ({ ...prev, [moduleId]: { progress: 0, status: "downloading" } }));
    try {
      await api.installModuleWithKey(moduleId, cipherKey);
    } catch (e) {
      setInstallState((prev) => ({ ...prev, [moduleId]: { progress: 0, status: "error", message: String(e) } }));
    }
    setCipherKey("");
  }

  const modules = (tab === "available" ? available : installed).filter((m) => {
    const matchCat = category === "All" || m.category === category;
    const matchQ = !query || m.name.toLowerCase().includes(query.toLowerCase()) || m.description.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQ;
  });

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />

      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant bg-surface shrink-0">
          <h1 className="font-display-lg text-display-lg text-on-surface mb-1">Module Library</h1>
          <p className="font-body-ui text-body-ui text-on-surface-variant">
            Download and manage Bible texts, commentaries, and lexicons.
          </p>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-outline-variant bg-surface shrink-0">
          <div className="flex gap-2">
            {(["available", "installed"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-DEFAULT font-body-ui text-body-ui capitalize transition-colors ${
                  tab === t
                    ? "bg-primary text-on-primary"
                    : "text-secondary hover:bg-surface-container-low"
                }`}
              >
                {t === "installed" ? `Installed (${installed.length})` : "Available"}
              </button>
            ))}
          </div>
          <div className="flex gap-2 ml-4 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-DEFAULT font-metadata-mono text-metadata-mono text-[11px] transition-colors ${
                  category === cat
                    ? "bg-secondary-container text-on-secondary-container"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input
              className="pl-8 pr-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-ui text-body-ui w-56 transition-colors"
              placeholder="Filter modules…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Module list */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <p className="font-body-ui text-body-ui text-on-surface-variant">Loading modules…</p>
            </div>
          ) : modules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-3">search_off</span>
              <p className="font-body-ui text-body-ui text-on-surface-variant">No modules found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-w-3xl">
              {modules.map((m) => {
                const state = installState[m.id];
                const isInstalling = state?.status === "downloading" || state?.status === "indexing";
                const isDone = state?.status === "done" || m.installed;
                return (
                  <div key={m.id} className="border border-outline-variant rounded-DEFAULT bg-surface p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-body-ui text-body-ui font-semibold text-on-surface">{m.name}</h3>
                        <span className="font-metadata-mono text-[10px] px-1.5 py-0.5 bg-surface-container text-on-surface-variant rounded-DEFAULT">{m.category}</span>
                        {m.requires_key && (
                          <span className="font-metadata-mono text-[10px] px-1.5 py-0.5 bg-error-container text-on-error-container rounded-DEFAULT">Requires key</span>
                        )}
                      </div>
                      <p className="font-body-ui text-[13px] text-on-surface-variant leading-relaxed">{m.description}</p>
                      {isInstalling && (
                        <div className="mt-2">
                          <div className="w-full bg-surface-container-high rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full transition-all"
                              style={{ width: `${state.progress}%` }}
                            />
                          </div>
                          <p className="font-metadata-mono text-[10px] text-secondary mt-1">{state.message}</p>
                        </div>
                      )}
                      {state?.status === "error" && (
                        <p className="font-body-ui text-[12px] text-error mt-1">{state.message}</p>
                      )}
                    </div>
                    <button
                      disabled={isDone || isInstalling}
                      onClick={() => install(m.id, m.requires_key, m.name)}
                      className={`shrink-0 px-4 py-1.5 rounded-DEFAULT font-body-ui text-body-ui text-sm transition-colors ${
                        isDone
                          ? "bg-surface-container text-on-surface-variant cursor-default"
                          : isInstalling
                          ? "bg-surface-container text-on-surface-variant cursor-wait"
                          : "bg-primary text-on-primary hover:bg-primary-container"
                      }`}
                    >
                      {isDone ? "Installed" : isInstalling ? (state.status === "indexing" ? "Indexing…" : "Downloading…") : "Install"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Cipher key modal */}
      {cipherModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-surface border border-outline-variant rounded-xl p-6 w-96 shadow-xl">
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-2">Enter cipher key</h2>
            <p className="font-body-ui text-body-ui text-on-surface-variant mb-4">
              <strong>{cipherModal.name}</strong> requires a license key to install.
            </p>
            <input
              className="w-full px-3 py-2 border border-outline-variant rounded-DEFAULT font-metadata-mono text-body-ui focus:outline-none focus:border-primary mb-4"
              placeholder="Cipher key"
              value={cipherKey}
              onChange={(e) => setCipherKey(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setCipherModal(null); setCipherKey(""); }} className="px-4 py-2 text-secondary font-body-ui text-body-ui hover:bg-surface-container-low rounded-DEFAULT">
                Cancel
              </button>
              <button onClick={installWithKey} disabled={!cipherKey.trim()} className="px-4 py-2 bg-primary text-on-primary font-body-ui text-body-ui rounded-DEFAULT hover:bg-primary-container disabled:opacity-50">
                Install
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
