-- Migration: add the Motility test column to an existing `species` table.
-- Run this once in your Supabase project (Dashboard -> SQL Editor) if you
-- created the table before Motility was added. New installs from schema.sql
-- already include the column, so this is a no-op there (IF NOT EXISTS).

alter table public.species add column if not exists motility text;
