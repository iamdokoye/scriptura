import { useAppStore } from "../store/app";

export default function EmptyLibrary() {
  const { setView } = useAppStore();

  return (
    <div className="flex flex-1 items-center justify-center h-full bg-surface">
      <div className="flex flex-col items-center text-center max-w-sm px-8">
        <span className="material-symbols-outlined text-[72px] text-on-surface-variant mb-6">
          library_books
        </span>
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-3">
          No Bible modules installed
        </h2>
        <p className="font-body-ui text-body-ui text-on-surface-variant mb-8">
          Download a free Bible text to start reading and studying. The KJV and WEB are available at no cost.
        </p>
        <button
          onClick={() => setView("modules")}
          className="px-6 py-2.5 bg-primary text-on-primary font-body-ui text-body-ui font-medium rounded-DEFAULT hover:bg-primary-container transition-colors shadow-sm"
        >
          Browse modules
        </button>
      </div>
    </div>
  );
}
