// Public Supabase connection values for this project.
//
// The publishable key (sb_publishable_...) and project URL are designed to be
// exposed in a browser app — they end up in the client bundle either way, and
// access is governed by Row Level Security on the database. They are NOT secret
// keys. Never put the `sb_secret_...` / service_role key here.
//
// Environment variables override these when present, so local dev or a
// different deployment can point at another project without editing source:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (see .env.example)
export const SUPABASE_URL = "https://kgggfjxssnpovejwdrgu.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0sTcB32Xn8PsEU7M1OJhhg_zYS_iwVE";
