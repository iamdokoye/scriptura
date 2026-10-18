/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Your Supabase project URL. Unset in builds without accounts. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's public (anon / publishable) key. Safe to ship: row-level security protects the data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
