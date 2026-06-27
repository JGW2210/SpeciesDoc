-- SpeciesDoc — database schema
-- Run this in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- It creates one table, `species`, holding a logged isolate and its biochemical
-- test panel. Every test column is free text so you can record "+", "-", "variable",
-- "weak", or a short note interchangeably.

create table if not exists public.species (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

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

-- Row Level Security ---------------------------------------------------------
-- Enable RLS, then add a policy. The policy below is OPEN: anyone holding the
-- public anon key (i.e. anyone who can load the app) may read and write rows.
-- That is fine for a personal, single-user bench log. If you later add Supabase
-- Auth, replace this policy with one scoped to `auth.uid()`.

alter table public.species enable row level security;

drop policy if exists "Public full access to species" on public.species;
create policy "Public full access to species"
  on public.species
  for all
  to anon
  using (true)
  with check (true);

-- Custom board layout (one row) -------------------------------------------
-- Holds the user-defined categories/subcategories arrangement for the Board view.

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

-- Viruses & Parasites sections -------------------------------------------
-- Mirror `species` with a domain-specific test panel. They reuse the `board`
-- table above (each section stores its layout under a different id). See
-- migrations/2026-06-27_add_virus_parasite.sql for the standalone migration.

create table if not exists public.viruses (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
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
alter table public.viruses enable row level security;
drop policy if exists "Public full access to viruses" on public.viruses;
create policy "Public full access to viruses"
  on public.viruses for all to anon using (true) with check (true);

create table if not exists public.parasites (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
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
alter table public.parasites enable row level security;
drop policy if exists "Public full access to parasites" on public.parasites;
create policy "Public full access to parasites"
  on public.parasites for all to anon using (true) with check (true);
