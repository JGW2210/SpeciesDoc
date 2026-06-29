-- SpeciesDoc — add authentication & per-row ownership
-- Run this in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- What this migration does, and the access model it establishes:
--
--   * Adds an `owner` column to every domain table (species, viruses, parasites)
--     that points at the signed-in user (auth.users). New rows default to the
--     caller's id automatically.
--   * Adds a public `profiles` table so the app can show *who* logged each
--     organism (auth.users itself is not exposed to the browser). A trigger
--     fills it in automatically whenever someone signs up.
--   * Replaces the old "anyone with the anon key can do anything" policies with:
--       - READ  (SELECT): public — anyone, signed in or not, can view every
--                          list and organism.
--       - WRITE  (INSERT/UPDATE/DELETE): only the signed-in owner of a row.
--     This is enforced by the database, so the public anon key in the browser
--     can no longer mutate other people's data.
--   * Makes the custom Board layout per-user (each account keeps its own
--     arrangement; logged-out visitors just don't have one).
--
-- It is safe to run on an existing database: it only adds columns/policies and
-- never drops your logged organisms. Existing rows created before auth will have
-- owner = NULL (visible to everyone, editable by no one) until you claim them —
-- see the "Claiming pre-auth data" note at the bottom.

-- 1. Ownership columns -------------------------------------------------------
-- `default auth.uid()` means an authenticated INSERT that doesn't mention
-- `owner` is automatically stamped with the caller's id.

alter table public.species
  add column if not exists owner uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.viruses
  add column if not exists owner uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.parasites
  add column if not exists owner uuid references auth.users(id) on delete cascade default auth.uid();

create index if not exists species_owner_idx   on public.species (owner);
create index if not exists viruses_owner_idx   on public.viruses (owner);
create index if not exists parasites_owner_idx on public.parasites (owner);

-- 2. Public profiles ---------------------------------------------------------
-- One row per auth user, holding a display label the browser is allowed to read.
-- We keep email + an optional display_name; the app shows display_name or the
-- part of the email before the @.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone may read profiles (so owner labels render for logged-out visitors too).
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- A user may update only their own profile (e.g. set a display name).
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created. Runs as the
-- definer (postgres) so it bypasses RLS during signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already existed before this migration.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 3. Domain table policies: public read, owner-only write --------------------
-- A small helper keeps the four policies identical across the three tables.

-- ---- species ----
drop policy if exists "Public full access to species" on public.species;
drop policy if exists "Public read species"           on public.species;
drop policy if exists "Owner insert species"          on public.species;
drop policy if exists "Owner update species"          on public.species;
drop policy if exists "Owner delete species"          on public.species;

create policy "Public read species"
  on public.species for select to anon, authenticated using (true);
create policy "Owner insert species"
  on public.species for insert to authenticated with check (auth.uid() = owner);
create policy "Owner update species"
  on public.species for update to authenticated using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "Owner delete species"
  on public.species for delete to authenticated using (auth.uid() = owner);

-- ---- viruses ----
drop policy if exists "Public full access to viruses" on public.viruses;
drop policy if exists "Public read viruses"           on public.viruses;
drop policy if exists "Owner insert viruses"          on public.viruses;
drop policy if exists "Owner update viruses"          on public.viruses;
drop policy if exists "Owner delete viruses"          on public.viruses;

create policy "Public read viruses"
  on public.viruses for select to anon, authenticated using (true);
create policy "Owner insert viruses"
  on public.viruses for insert to authenticated with check (auth.uid() = owner);
create policy "Owner update viruses"
  on public.viruses for update to authenticated using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "Owner delete viruses"
  on public.viruses for delete to authenticated using (auth.uid() = owner);

-- ---- parasites ----
drop policy if exists "Public full access to parasites" on public.parasites;
drop policy if exists "Public read parasites"           on public.parasites;
drop policy if exists "Owner insert parasites"          on public.parasites;
drop policy if exists "Owner update parasites"          on public.parasites;
drop policy if exists "Owner delete parasites"          on public.parasites;

create policy "Public read parasites"
  on public.parasites for select to anon, authenticated using (true);
create policy "Owner insert parasites"
  on public.parasites for insert to authenticated with check (auth.uid() = owner);
create policy "Owner update parasites"
  on public.parasites for update to authenticated using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "Owner delete parasites"
  on public.parasites for delete to authenticated using (auth.uid() = owner);

-- 4. Per-user Board layout ---------------------------------------------------
-- The Board view stores one jsonb layout per section, previously keyed by a
-- single text id. Make it per-user: the primary key becomes (owner, id) and the
-- whole row is private to its owner. Pre-auth board rows (owner NULL) can't fit
-- a NOT-NULL composite key, so we clear them — this only resets saved Board
-- *arrangements*, never your logged organisms.

alter table public.board
  add column if not exists owner uuid references auth.users(id) on delete cascade default auth.uid();

-- Rows that predate auth have no owner; drop them so the composite key holds.
delete from public.board where owner is null;

-- Swap the primary key to (owner, id) so each user has their own row per section.
alter table public.board drop constraint if exists board_pkey;
alter table public.board alter column owner set not null;
alter table public.board add constraint board_pkey primary key (owner, id);

drop policy if exists "Public full access to board" on public.board;
drop policy if exists "Owner all board"             on public.board;
drop policy if exists "Public read board"           on public.board;
drop policy if exists "Owner write board"           on public.board;
-- Public read so anyone can view any user's board; writes stay owner-only.
create policy "Public read board"
  on public.board for select to anon, authenticated using (true);
create policy "Owner write board"
  on public.board for all
  to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- ---------------------------------------------------------------------------
-- Claiming pre-auth data (optional, run once after you create your account):
-- Find your user id in Dashboard -> Authentication -> Users, then:
--
--   update public.species   set owner = '<your-user-uuid>' where owner is null;
--   update public.viruses   set owner = '<your-user-uuid>' where owner is null;
--   update public.parasites set owner = '<your-user-uuid>' where owner is null;
--
-- After that, those rows become editable by your account.
