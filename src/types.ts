// Database row shape. Test fields are nullable free text.
export interface Species {
  id: string;
  created_at: string;
  genus: string;
  species: string;
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

// Everything except id/created_at — what the form collects and writes.
export type SpeciesDraft = Omit<Species, "id" | "created_at">;

// The set of test-result column keys (excludes genus/species).
export type TestKey = Exclude<keyof SpeciesDraft, "genus" | "species">;
