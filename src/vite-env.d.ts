/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_MODE?: 'mock' | 'real';
  readonly VITE_API_URL?: string;
  // Supabase — valores públicos por design (anon key é segura no frontend)
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
