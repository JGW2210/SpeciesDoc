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

  -- biochemical / morphological test panel
  gram              text,
  oxidase           text,
  catalase          text,
  indole            text,
  fermentation      text,
  distinctive_shape text,
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
