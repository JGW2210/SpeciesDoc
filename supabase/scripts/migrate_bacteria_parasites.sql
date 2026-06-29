-- Migrate the bacteria (`species`) and parasites (`parasites`) lists to a user.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- This leaves the `viruses` list untouched. Make sure the destination account
-- has been registered (so it exists in auth.users) before running.

-- ── Option A (recommended): claim the pre-auth rows by destination email ────
-- Targets only rows with NO owner yet (owner is null) — i.e. organisms logged
-- before authentication existed. Safe to re-run. Replace the email.

update public.species
set owner = (select id from auth.users where email = 'destination@example.com')
where owner is null;

update public.parasites
set owner = (select id from auth.users where email = 'destination@example.com')
where owner is null;

-- ── Option B: TRUE transfer from one account to another ────────────────────
-- Use this instead if these lists are already owned by some account and you
-- want to move them to a different one. Reassigns every row currently owned by
-- the source user to the destination user. Comment out Option A above first.
--
-- update public.species
-- set owner = (select id from auth.users where email = 'destination@example.com')
-- where owner = (select id from auth.users where email = 'source@example.com');
--
-- update public.parasites
-- set owner = (select id from auth.users where email = 'destination@example.com')
-- where owner = (select id from auth.users where email = 'source@example.com');

-- ── Option C: move ALL rows to the destination, regardless of current owner ─
-- update public.species   set owner = (select id from auth.users where email = 'destination@example.com');
-- update public.parasites set owner = (select id from auth.users where email = 'destination@example.com');

-- ── Verify ─────────────────────────────────────────────────────────────────
select 'species' as list,
       count(*) filter (where owner is not null) as claimed,
       count(*) filter (where owner is null)     as still_unclaimed
from public.species
union all
select 'parasites',
       count(*) filter (where owner is not null),
       count(*) filter (where owner is null)
from public.parasites;
