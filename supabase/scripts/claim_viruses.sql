-- Claim the existing (pre-auth) virus list for one account.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- This ONLY touches the `viruses` table, and ONLY rows that currently have no
-- owner (owner is null) — i.e. organisms logged before authentication existed.
-- It will not reassign viruses that already belong to someone, and it leaves the
-- bacteria (`species`) and `parasites` lists untouched.

-- ── Option A (recommended): claim by your login email ──────────────────────
-- Replace the email below with the one you registered. The subquery resolves it
-- to your user id from auth.users (readable in the SQL editor as the postgres
-- role). Safe to re-run.

update public.viruses
set owner = (select id from auth.users where email = 'you@example.com')
where owner is null;

-- ── Option B: claim by user id ─────────────────────────────────────────────
-- If you'd rather paste your UUID directly (Dashboard -> Authentication ->
-- Users -> copy the ID), comment out Option A above and use this instead:
--
-- update public.viruses
-- set owner = '00000000-0000-0000-0000-000000000000'  -- your user UUID
-- where owner is null;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- How many viruses are now yours vs. still unclaimed:
select
  count(*) filter (where owner is not null) as claimed,
  count(*) filter (where owner is null)     as still_unclaimed
from public.viruses;
