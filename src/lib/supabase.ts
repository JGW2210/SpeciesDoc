import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// True only when both values are present and not the placeholder text.
export const isSupabaseConfigured =
  !!url &&
  !!anonKey &&
  !url.includes("your-project-ref") &&
  !anonKey.includes("your-anon-public-key");

// When unconfigured we export null and the UI shows a setup banner instead of
// crashing on a bad client.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
