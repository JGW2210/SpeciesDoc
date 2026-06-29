-- SpeciesDoc — database schema (auth-ready)
-- Run this in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Access model:
--   * READ is public — anyone, signed in or not, can view every list and
--     organism (governed by the public anon key + the SELECT policies below).
--   * WRITE (insert/update/delete) is restricted to the signed-in *owner* of a
--     row. Each row carries an `owner` column that defaults to the caller's id.
--   * The Board layout is private per user.
--
-- If you already created the old open-access schema, run the migration in
-- migrations/2026-06-29_add_auth_ownership.sql instead of this file.

-- Public profiles ------------------------------------------------------------
-- The browser cannot read auth.users directly, so we mirror a public label here
-- (used to show who logged each organism). A trigger keeps it in sync on signup.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select to anon, authenticated using (true);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

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

-- species --------------------------------------------------------------------
-- A logged bacterial isolate and its biochemical test panel. Every test column
-- is free text so you can record "+", "-", "variable", "weak", or a short note.

create table if not exists public.species (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  owner             uuid references auth.users(id) on delete cascade default auth.uid(),

  -- binomial name
  genus             text not null,
  species           text not null,
  old_name          text, -- optional synonym / former name (lineage fallback)

  -- cached GBIF taxonomic lineage (for the tree view)
  lineage           jsonb,

  -- biochemical / morphological test panel
  gram              text, -- Staining: Positive / Negative / Variable / Acid-fast
  oxidase           text,
  catalase          text,
  indole            text,
  fermentation      text,
  distinctive_shape text,
  motility          text,
  haemolysis        text,
  coagulase         text,
  aesculin          text,
  pyr_pyz           text,
  spores            text,
  dnase             text,
  tributyrin        text,
  hugh_leifson_of   text,
  atmosphere        text,
  methyl_red        text,
  voges_proskauer   text,
  citrate           text,
  other_notes       text
);

create index if not exists species_created_at_idx on public.species (created_at desc);
create index if not exists species_genus_idx on public.species (genus);
create index if not exists species_owner_idx on public.species (owner);

-- Row Level Security: public read, owner-only write.
alter table public.species enable row level security;

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

-- Custom board layout (one row per user per section) -------------------------
-- Holds the user-defined categories/subcategories arrangement for the Board
-- view. Private to its owner.

create table if not exists public.board (
  id         text not null,
  owner      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data       jsonb not null default '{"categories":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

alter table public.board enable row level security;

-- Public read so anyone can view any user's board; writes stay owner-only.
drop policy if exists "Public full access to board" on public.board;
drop policy if exists "Owner all board"             on public.board;
drop policy if exists "Public read board"           on public.board;
drop policy if exists "Owner write board"           on public.board;
create policy "Public read board"
  on public.board for select to anon, authenticated using (true);
create policy "Owner write board"
  on public.board for all to authenticated
  using (auth.uid() = owner) with check (auth.uid() = owner);

-- Viruses & Parasites sections -----------------------------------------------
-- Mirror `species` with a domain-specific test panel.

create table if not exists public.viruses (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  owner        uuid references auth.users(id) on delete cascade default auth.uid(),
  genus        text not null,
  species      text not null,
  old_name     text,
  lineage      jsonb,
  genome_type  text,
  envelope     text,
  capsid       text,
  morphology   text,
  host         text,
  transmission text,
  tropism      text,
  other_notes  text
);
create index if not exists viruses_created_at_idx on public.viruses (created_at desc);
create index if not exists viruses_owner_idx on public.viruses (owner);
alter table public.viruses enable row level security;

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

create table if not exists public.parasites (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  owner          uuid references auth.users(id) on delete cascade default auth.uid(),
  genus          text not null,
  species        text not null,
  old_name       text,
  lineage        jsonb,
  parasite_group text,
  stage          text,
  motility       text,
  host           text,
  transmission   text,
  site           text,
  diagnostic     text,
  other_notes    text
);
create index if not exists parasites_created_at_idx on public.parasites (created_at desc);
create index if not exists parasites_owner_idx on public.parasites (owner);
alter table public.parasites enable row level security;

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
