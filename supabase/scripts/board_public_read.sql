-- Make boards publicly viewable while keeping edits owner-only (idempotent).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Lets anyone view any user's board layout (the app shows other boards as
-- read-only). Inserting, updating, or deleting a board row still requires being
-- its signed-in owner.

alter table public.board enable row level security;

drop policy if exists "Public full access to board" on public.board;
drop policy if exists "Owner all board"             on public.board;
drop policy if exists "Public read board"           on public.board;
drop policy if exists "Owner write board"           on public.board;

create policy "Public read board"
  on public.board for select
  to anon, authenticated
  using (true);

create policy "Owner write board"
  on public.board for all
  to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);
