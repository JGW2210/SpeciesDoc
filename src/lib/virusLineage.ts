import type { Lineage } from "../types";

// GBIF's backbone virus taxonomy is sparse and lags ICTV, so many current genera
// don't match at all. This curated map supplies the ICTV lineage for known genera
// (down to family) keyed by lowercase genus; the entered genus/species fill the
// rest. Extend as more virus genera are logged. `kingdom` holds the ICTV kingdom
// (the realm is noted in comments). Lineages follow the ICTV 2023/24 release.
interface ViralRanks {
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
}

const VIRAL_LINEAGES: Record<string, ViralRanks> = {
  // — Riboviria / Orthornavirae (RNA) —
  hepatovirus: { kingdom: "Orthornavirae", phylum: "Pisuviricota", class: "Pisoniviricetes", order: "Picornavirales", family: "Picornaviridae" },
  enterovirus: { kingdom: "Orthornavirae", phylum: "Pisuviricota", class: "Pisoniviricetes", order: "Picornavirales", family: "Picornaviridae" },
  betacoronavirus: { kingdom: "Orthornavirae", phylum: "Pisuviricota", class: "Pisoniviricetes", order: "Nidovirales", family: "Coronaviridae" },
  orthohepacivirus: { kingdom: "Orthornavirae", phylum: "Kitrinoviricota", class: "Flasuviricetes", order: "Amarillovirales", family: "Flaviviridae" },
  hepacivirus: { kingdom: "Orthornavirae", phylum: "Kitrinoviricota", class: "Flasuviricetes", order: "Amarillovirales", family: "Flaviviridae" },
  orthoflavivirus: { kingdom: "Orthornavirae", phylum: "Kitrinoviricota", class: "Flasuviricetes", order: "Amarillovirales", family: "Flaviviridae" },
  rotavirus: { kingdom: "Orthornavirae", phylum: "Duplornaviricota", class: "Resentoviricetes", order: "Reovirales", family: "Sedoreoviridae" },
  alphainfluenzavirus: { kingdom: "Orthornavirae", phylum: "Negarnaviricota", class: "Insthoviricetes", order: "Articulavirales", family: "Orthomyxoviridae" },
  // — Riboviria / Pararnavirae (reverse-transcribing) —
  lentivirus: { kingdom: "Pararnavirae", phylum: "Artverviricota", class: "Revtraviricetes", order: "Ortervirales", family: "Retroviridae" },
  // — Duplodnaviria / Heunggongvirae (dsDNA, herpes) —
  simplexvirus: { kingdom: "Heunggongvirae", phylum: "Peploviricota", class: "Herviviricetes", order: "Herpesvirales", family: "Orthoherpesviridae" },
  // — Varidnaviria / Bamfordvirae (dsDNA, adeno/pox) —
  mastadenovirus: { kingdom: "Bamfordvirae", phylum: "Preplasmiviricota", class: "Tectiliviricetes", order: "Rowavirales", family: "Adenoviridae" },
  orthopoxvirus: { kingdom: "Bamfordvirae", phylum: "Nucleocytoviricota", class: "Pokkesviricetes", order: "Chitovirales", family: "Poxviridae" },
};

// Curated lineage for a virus genus, or null when we don't have one (then GBIF is
// tried). Marked matchType "CURATED" so it counts as placed but is distinguishable.
export function viralLineage(genus: string, species: string): Lineage | null {
  const ranks = VIRAL_LINEAGES[genus.trim().toLowerCase()];
  if (!ranks) return null;
  return {
    ...ranks,
    genus: genus.trim(),
    species: `${genus.trim()} ${species.trim()}`.trim(),
    matchType: "CURATED",
    fetchedAt: new Date().toISOString(),
  };
}
