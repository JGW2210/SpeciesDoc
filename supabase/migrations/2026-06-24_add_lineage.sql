-- Migration: add the cached taxonomic lineage column used by the Tree view.
-- Run once in your Supabase project (Dashboard -> SQL Editor). Safe to re-run.
--
-- The app fills this in automatically by looking each isolate up against the
-- GBIF backbone taxonomy when you save it, and the Tree view has a
-- "Fetch lineage" button to backfill existing rows.

alter table public.species add column if not exists lineage jsonb;
