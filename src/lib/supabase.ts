import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config";

// Environment variables win when present; otherwise fall back to the committed
// public project values in config.ts so a fresh clone / deploy works out of the box.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || SUPABASE_URL;
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || SUPABASE_PUBLISHABLE_KEY;

// True only when both values are present and not the placeholder text.
export const isSupabaseConfigured =
  !!url &&
  !!anonKey &&
  !url.includes("your-project-ref") &&
  !anonKey.includes("your-anon-public-key");

// When unconfigured we export null and the UI shows a setup banner instead of
// crashing on a bad client.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;
