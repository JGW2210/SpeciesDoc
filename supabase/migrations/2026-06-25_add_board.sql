-- Migration: add the Board view's custom-layout table.
-- Run once in your Supabase project (Dashboard -> SQL Editor). Safe to re-run.
-- Stores the user-defined categories/subcategories arrangement as one jsonb row.

create table if not exists public.board (
  id         text primary key,
  data       jsonb not null default '{"categories":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.board enable row level security;

drop policy if exists "Public full access to board" on public.board;
create policy "Public full access to board"
  on public.board
  for all
  to anon
  using (true)
  with check (true);
