import type { Lineage } from "../types";

// GBIF's protist taxonomy is inconsistent: it forks Plasmodium across kingdoms,
// misplaces Trichomonas under Animalia, and misses Cryptosporidium/Dientamoeba.
// This curated map supplies a consistent lineage for the problem genera, keyed by
// lowercase genus, in the modern eukaryote-supergroup scheme (supergroup in the
// `realm` slot — see lib/parasiteTaxonomy.ts, which lifts the GBIF-matched rows
// onto the same scheme). This map takes priority over GBIF + that translation.
// Extend as more parasites are logged.
interface ParasiteRanks {
  realm: string; // eukaryotic supergroup (SAR, Amoebozoa, Metamonada, Discoba, Opisthokonta)
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family: string;
}

const PARASITE_LINEAGES: Record<string, ParasiteRanks> = {
  // — SAR · Alveolata · Apicomplexa — joins Toxoplasma, Cyclospora, etc.
  // Unifies all Plasmodium spp. (GBIF forks them across Chromista/Animalia).
  plasmodium: { realm: "SAR", kingdom: "Alveolata", phylum: "Apicomplexa", class: "Aconoidasida", order: "Haemospororida", family: "Plasmodiidae" },
  babesia: { realm: "SAR", kingdom: "Alveolata", phylum: "Apicomplexa", class: "Aconoidasida", order: "Piroplasmida", family: "Babesiidae" },
  // Fixes the "Cryptosporidium spp." no-match.
  cryptosporidium: { realm: "SAR", kingdom: "Alveolata", phylum: "Apicomplexa", class: "Conoidasida", order: "Eucoccidiorida", family: "Cryptosporidiidae" },
  // — SAR · Alveolata · Ciliophora — GBIF mislabels the class as Heterotrichea.
  balantidium: { realm: "SAR", kingdom: "Alveolata", phylum: "Ciliophora", class: "Litostomatea", order: "Vestibuliferida", family: "Balantidiidae" },
  // — Metamonada — flagellates GBIF misplaces under Animalia or can't match.
  trichomonas: { realm: "Metamonada", phylum: "Parabasalia", class: "Trichomonadea", order: "Trichomonadida", family: "Trichomonadidae" },
  dientamoeba: { realm: "Metamonada", phylum: "Parabasalia", class: "Trichomonadea", order: "Tritrichomonadida", family: "Dientamoebidae" },
  // — Opisthokonta · Animalia — filarial nematode; matches GBIF once spelled right.
  wuchereria: { realm: "Opisthokonta", kingdom: "Animalia", phylum: "Nematoda", class: "Chromadorea", order: "Rhabditida", family: "Onchocercidae" },
};

// Curated lineage for a parasite genus, or null when we don't have one (then GBIF
// + the modern-supergroup translation are used). Marked matchType "CURATED" so it
// counts as placed but is distinguishable. Mirrors viralLineage().
export function parasiteLineage(genus: string, species: string): Lineage | null {
  const r = PARASITE_LINEAGES[genus.trim().toLowerCase()];
  if (!r) return null;
  return {
    realm: r.realm,
    kingdom: r.kingdom ?? null,
    phylum: r.phylum ?? null,
    class: r.class ?? null,
    order: r.order ?? null,
    family: r.family,
    genus: genus.trim(),
    species: `${genus.trim()} ${species.trim()}`.trim(),
    matchType: "CURATED",
    fetchedAt: new Date().toISOString(),
  };
}
