-- Migration: add the optional old-name / synonym column.
-- Run once in your Supabase project (Dashboard -> SQL Editor). Safe to re-run.
--
-- The current (modern) name stays primary and is what the tree displays. The
-- old name is used as a fallback when looking lineage up against GBIF (whose
-- backbone often only recognises the former name) and is shown on the tree's
-- detail card.

alter table public.species add column if not exists old_name text;
