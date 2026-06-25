// Taxonomic lineage fetched from the GBIF backbone, cached on the row.
export interface Lineage {
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

// Database row shape. Test fields are nullable free text.
export interface Species {
  id: string;
  created_at: string;
  genus: string;
  species: string;
  old_name: string | null; // optional synonym / former name, used for lineage fallback
  lineage: Lineage | null;
  gram: string | null;
  oxidase: string | null;
  catalase: string | null;
  indole: string | null;
  fermentation: string | null;
  distinctive_shape: string | null;
  motility: string | null;
  haemolysis: string | null;
  coagulase: string | null;
  aesculin: string | null;
  pyr_pyz: string | null;
  spores: string | null;
  dnase: string | null;
  tributyrin: string | null;
  hugh_leifson_of: string | null;
  atmosphere: string | null;
  methyl_red: string | null;
  voges_proskauer: string | null;
  citrate: string | null;
  other_notes: string | null;
}

// Everything the form collects and writes (lineage is fetched, not entered).
export type SpeciesDraft = Omit<Species, "id" | "created_at" | "lineage">;

// The set of test-result column keys (excludes the name fields).
export type TestKey = Exclude<keyof SpeciesDraft, "genus" | "species" | "old_name">;
