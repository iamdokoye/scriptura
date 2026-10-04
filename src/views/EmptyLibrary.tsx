import { useAppStore } from "../store/app";

export default function EmptyLibrary() {
  const { setView } = useAppStore();

  return (
    <div className="flex flex-1 items-center justify-center h-full p-3">
      <div className="flex flex-1 h-full items-center justify-center panel rounded-3xl">
      <div className="flex flex-col items-center text-center max-w-sm px-8">
        <span className="material-symbols-outlined text-[72px] text-primary mb-6">
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
          className="px-6 py-2.5 btn-primary font-body-ui text-body-ui font-medium rounded-lg"
        >
          Browse modules
        </button>
      </div>
      </div>
    </div>
  );
}
