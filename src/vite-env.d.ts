/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_KEY: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_TELEGRAM_BOT_TOKEN: string
  readonly VITE_TELEGRAM_CHAT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
