// Taxonomic lineage fetched from the GBIF backbone, cached on the row.
export interface Lineage {
  realm?: string | null; // virus top rank (ICTV); GBIF doesn't return it
  kingdom?: string | null;
  phylum?: string | null;
  class?: string | null;
  order?: string | null;
  family?: string | null;
  genus?: string | null;
  species?: string | null;
  matchType?: string | null; // EXACT | FUZZY | HIGHERRANK | NONE
  fetchedAt: string;
}

// A logged specimen — a bacterial isolate, virus, or parasite. The base columns
// are shared across every domain; each domain's test-panel results live in extra
// nullable text columns addressed by key (see the domain config + `tv()`).
export interface Specimen {
  id: string;
  created_at: string;
  owner: string | null; // auth user id of whoever logged it (null for pre-auth rows)
  genus: string;
  species: string;
  old_name: string | null; // optional synonym / former name, used for lineage fallback
  lineage: Lineage | null;
  // per-domain test columns (gram, genome_type, life_cycle, … other_notes)
  [test: string]: string | null | Lineage;
}

// Everything the form collects and writes (lineage is fetched, not entered).
// Declared explicitly (not via Omit) so the base name fields keep their precise
// types alongside the per-test index signature.
export interface SpecimenDraft {
  genus: string;
  species: string;
  old_name: string | null;
  [test: string]: string | null;
}

// Read a test-panel value as a plain string ("" when unset / not a string).
export function tv(row: Specimen | SpecimenDraft, key: string): string {
  const v = (row as Specimen)[key];
  return typeof v === "string" ? v : "";
}

// Back-compat aliases: most of the app was written against "Species". A
// specimen is the generic row; a test key is just a column name string.
export type Species = Specimen;
export type SpeciesDraft = SpecimenDraft;
export type TestKey = string;
