-- Ensure the `board` table saves one layout per user (idempotent, safe to re-run).
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- The app saves each user's Board arrangement with an upsert that relies on a
-- composite primary key (owner, id). If the original auth migration's board
-- section didn't fully apply, that key is missing and every save fails silently
-- ("Couldn't save" in the board bar). This script brings the table to the
-- correct shape regardless of its current state.

alter table public.board enable row level security;

-- 1. Ownership column (no-op if it already exists).
alter table public.board
  add column if not exists owner uuid references auth.users(id) on delete cascade default auth.uid();

-- 2. Drop any rows with no owner — pre-auth layouts can't fit a NOT NULL
--    composite key. This only clears saved *arrangements*, never logged organisms.
delete from public.board where owner is null;

-- 3. Make the primary key (owner, id), replacing any single-column key.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'board_pkey' and conrelid = 'public.board'::regclass
  ) then
    alter table public.board drop constraint board_pkey;
  end if;
  alter table public.board alter column owner set not null;
  alter table public.board add constraint board_pkey primary key (owner, id);
end $$;

-- 4. Owner-only access policy.
drop policy if exists "Public full access to board" on public.board;
drop policy if exists "Owner all board"             on public.board;
create policy "Owner all board"
  on public.board for all to authenticated
  using (auth.uid() = owner) with check (auth.uid() = owner);

-- Verify the shape: expect columns id, owner, data, updated_at and a PK on (owner, id).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'board'
order by ordinal_position;
