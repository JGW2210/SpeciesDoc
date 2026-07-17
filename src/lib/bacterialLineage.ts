import type { Lineage } from "../types";

// GBIF's bacterial backbone occasionally can't place a well-known species —
// it returns matchType NONE, or a phylum-less higher-rank/homonym match — even
// when the name is spelled correctly and current. (Yersinia is the motivating
// case: the isolate otherwise falls through to "Unplaced".) This curated map
// supplies the accepted lineage for such genera, keyed by lowercase genus, and
// takes priority over the GBIF lookup in the same way viruses/parasites do.
//
// Names are given in the form the bacterial display pipeline expects: phylum
// and order are still run through modernPhylum/modernOrder (both idempotent on
// already-current names), and resolveClass/resolvePhylum genus overrides still
// apply on top. Extend as more genera surface. Whole genera are placed here
// when every species shares the family (e.g. all Yersinia sit in Yersiniaceae).
interface BacterialRanks {
  phylum: string;
  class: string;
  order: string;
  family: string;
}

const BACTERIAL_LINEAGES: Record<string, BacterialRanks> = {
  // Enterobacterales / Yersiniaceae (split from Enterobacteriaceae, 2016).
  yersinia: {
    phylum: "Pseudomonadota",
    class: "Gammaproteobacteria",
    order: "Enterobacterales",
    family: "Yersiniaceae",
  },
};

// Curated lineage for a bacterial genus, or null when we don't have one (then
// GBIF is tried). Marked matchType "CURATED" so it counts as placed but stays
// distinguishable from a real backbone match.
export function bacterialLineage(genus: string, species: string): Lineage | null {
  const ranks = BACTERIAL_LINEAGES[genus.trim().toLowerCase()];
  if (!ranks) return null;
  return {
    kingdom: "Bacteria",
    phylum: ranks.phylum,
    class: ranks.class,
    order: ranks.order,
    family: ranks.family,
    genus: genus.trim(),
    species: `${genus.trim()} ${species.trim()}`.trim(),
    matchType: "CURATED",
    fetchedAt: new Date().toISOString(),
  };
}
