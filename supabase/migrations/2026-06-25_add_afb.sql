-- Migration: add the Acid-fast bacilli (AFB) staining test column.
-- Run once in your Supabase project (Dashboard -> SQL Editor). Safe to re-run.

alter table public.species add column if not exists afb text;
