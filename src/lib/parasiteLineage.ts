import type { Lineage } from "../types";

// GBIF's protist/parasite taxonomy is inconsistent: it scatters protozoa across
// kingdoms Protozoa / Chromista / Animalia, forks Plasmodium (P. falciparum →
// Chromista, P. malariae → Animalia), misplaces Trichomonas under Animalia, and
// misses a few names entirely. This curated map supplies a consistent lineage
// for the problem genera, keyed by lowercase genus; the entered genus/species
// fill the rest. Kingdoms follow the scheme GBIF already uses for the rows it
// places well (Animalia helminths, Protozoa amoebae/flagellates, Chromista
// apicomplexa, Fungi) so the curated genera slot in alongside them. Intermediate
// ranks are optional. Extend as more parasites are logged.
interface ParasiteRanks {
  kingdom: string;
  phylum?: string;
  class?: string;
  order?: string;
  family: string;
}

const PARASITE_LINEAGES: Record<string, ParasiteRanks> = {
  // — Apicomplexa (Chromista / Myzozoa) — joins Toxoplasma, Cyclospora, etc.
  // Unifies all Plasmodium spp. (GBIF forks them across two kingdoms).
  plasmodium: { kingdom: "Chromista", phylum: "Myzozoa", class: "Aconoidasida", order: "Haemospororida", family: "Plasmodiidae" },
  // Fixes the "Cryptosporidium spp." no-match.
  cryptosporidium: { kingdom: "Chromista", phylum: "Myzozoa", class: "Conoidasida", order: "Eucoccidiorida", family: "Cryptosporidiidae" },
  babesia: { kingdom: "Chromista", phylum: "Myzozoa", class: "Aconoidasida", order: "Piroplasmida", family: "Babesiidae" },
  // — Flagellates (Protozoa / Metamonada) — joins Giardia, Chilomastix.
  // GBIF misplaced Trichomonas under Animalia; Dientamoeba it couldn't match.
  trichomonas: { kingdom: "Protozoa", phylum: "Metamonada", class: "Trichomonadea", order: "Trichomonadida", family: "Trichomonadidae" },
  dientamoeba: { kingdom: "Protozoa", phylum: "Metamonada", class: "Trichomonadea", order: "Tritrichomonadida", family: "Dientamoebidae" },
  // — Ciliate (Protozoa / Ciliophora) — enter the genus as "Balantidium"
  // (GBIF fuzzy-matches the misspelling "Balantoides" to an ostracod arthropod).
  balantidium: { kingdom: "Protozoa", phylum: "Ciliophora", class: "Litostomatea", order: "Vestibuliferida", family: "Balantidiidae" },
  // — Filarial nematode (Animalia / Nematoda) — joins Loa. Enter as "Wuchereria"
  // (the misspelling "Wucheria" won't match GBIF or this map).
  wuchereria: { kingdom: "Animalia", phylum: "Nematoda", class: "Chromadorea", order: "Rhabditida", family: "Onchocercidae" },
};

// Curated lineage for a parasite genus, or null when we don't have one (then GBIF
// is tried). Marked matchType "CURATED" so it counts as placed but is
// distinguishable. Mirrors viralLineage().
export function parasiteLineage(genus: string, species: string): Lineage | null {
  const ranks = PARASITE_LINEAGES[genus.trim().toLowerCase()];
  if (!ranks) return null;
  return {
    realm: null, // eukaryotes have no realm rank
    kingdom: ranks.kingdom,
    phylum: ranks.phylum ?? null,
    class: ranks.class ?? null,
    order: ranks.order ?? null,
    family: ranks.family,
    genus: genus.trim(),
    species: `${genus.trim()} ${species.trim()}`.trim(),
    matchType: "CURATED",
    fetchedAt: new Date().toISOString(),
  };
}
