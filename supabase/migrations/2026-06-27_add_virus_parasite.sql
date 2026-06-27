-- Migration: add the Viruses and Parasites sections.
--
-- Two new tables mirroring `species`: the shared base columns (name, lineage)
-- plus a domain-specific test panel. The existing `board` table is reused — each
-- section stores its Board layout under a different id ('virus' / 'parasite'),
-- so nothing there needs changing. Run once in Supabase (SQL Editor).

create table if not exists public.viruses (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  genus        text not null,
  species      text not null,
  old_name     text,
  lineage      jsonb,
  -- test panel (see src/domains/virus.ts)
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
create index if not exists viruses_genus_idx on public.viruses (genus);

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
  -- test panel (see src/domains/parasite.ts)
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
create index if not exists parasites_genus_idx on public.parasites (genus);

alter table public.parasites enable row level security;
drop policy if exists "Public full access to parasites" on public.parasites;
create policy "Public full access to parasites"
  on public.parasites for all to anon using (true) with check (true);
