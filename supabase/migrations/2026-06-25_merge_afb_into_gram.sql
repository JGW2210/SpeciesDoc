-- Migration: fold the separate Acid-fast bacilli (afb) test into the Staining
-- field (the `gram` column), which now carries a fourth value, 'Acid-fast'.
-- Run once in your Supabase project (Dashboard -> SQL Editor).
--
-- Acid-fast wins: any isolate previously flagged acid-fast (afb set to anything
-- other than blank/negative) becomes Staining = 'Acid-fast', overwriting its old
-- Gram value, since acid-fast organisms barely Gram-stain. Then the now-unused
-- afb column is dropped.

update public.species
   set gram = 'Acid-fast'
 where afb is not null
   and lower(trim(afb)) not in ('', 'negative', 'neg', '-', '−');

alter table public.species drop column if exists afb;
