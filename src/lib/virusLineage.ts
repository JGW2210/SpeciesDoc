import type { Lineage } from "../types";

// GBIF's backbone virus taxonomy is sparse and lags ICTV, so many current genera
// don't match at all. This curated map supplies the ICTV lineage for known genera
// (down to family) keyed by lowercase genus; the entered genus/species fill the
// rest. Extend as more virus genera are logged. `kingdom` holds the ICTV kingdom
// (the realm is noted in comments). Lineages follow the ICTV 2023/24 release.
// Intermediate ranks are optional: some taxa (e.g. Deltavirus) are classified
// only at realm + family, with no kingdom/phylum/class/order.
interface ViralRanks {
  realm: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family: string;
}

const VIRAL_LINEAGES: Record<string, ViralRanks> = {
  // — Riboviria / Orthornavirae (RNA) —
  hepatovirus: { realm: "Riboviria", kingdom: "Orthornavirae", phylum: "Pisuviricota", class: "Pisoniviricetes", order: "Picornavirales", family: "Picornaviridae" },
  enterovirus: { realm: "Riboviria", kingdom: "Orthornavirae", phylum: "Pisuviricota", class: "Pisoniviricetes", order: "Picornavirales", family: "Picornaviridae" },
  betacoronavirus: { realm: "Riboviria", kingdom: "Orthornavirae", phylum: "Pisuviricota", class: "Pisoniviricetes", order: "Nidovirales", family: "Coronaviridae" },
  orthohepacivirus: { realm: "Riboviria", kingdom: "Orthornavirae", phylum: "Kitrinoviricota", class: "Flasuviricetes", order: "Amarillovirales", family: "Flaviviridae" },
  hepacivirus: { realm: "Riboviria", kingdom: "Orthornavirae", phylum: "Kitrinoviricota", class: "Flasuviricetes", order: "Amarillovirales", family: "Flaviviridae" },
  orthoflavivirus: { realm: "Riboviria", kingdom: "Orthornavirae", phylum: "Kitrinoviricota", class: "Flasuviricetes", order: "Amarillovirales", family: "Flaviviridae" },
  rotavirus: { realm: "Riboviria", kingdom: "Orthornavirae", phylum: "Duplornaviricota", class: "Resentoviricetes", order: "Reovirales", family: "Sedoreoviridae" },
  alphainfluenzavirus: { realm: "Riboviria", kingdom: "Orthornavirae", phylum: "Negarnaviricota", class: "Insthoviricetes", order: "Articulavirales", family: "Orthomyxoviridae" },
  // — Riboviria / Pararnavirae (reverse-transcribing) —
  lentivirus: { realm: "Riboviria", kingdom: "Pararnavirae", phylum: "Artverviricota", class: "Revtraviricetes", order: "Ortervirales", family: "Retroviridae" },
  // — Ribozyviria (HDV; classified only at realm + family) —
  deltavirus: { realm: "Ribozyviria", family: "Kolmioviridae" },
  // — Duplodnaviria / Heunggongvirae (dsDNA, herpes) —
  simplexvirus: { realm: "Duplodnaviria", kingdom: "Heunggongvirae", phylum: "Peploviricota", class: "Herviviricetes", order: "Herpesvirales", family: "Orthoherpesviridae" },
  // — Varidnaviria / Bamfordvirae (dsDNA, adeno/pox) —
  mastadenovirus: { realm: "Varidnaviria", kingdom: "Bamfordvirae", phylum: "Preplasmiviricota", class: "Tectiliviricetes", order: "Rowavirales", family: "Adenoviridae" },
  orthopoxvirus: { realm: "Varidnaviria", kingdom: "Bamfordvirae", phylum: "Nucleocytoviricota", class: "Pokkesviricetes", order: "Chitovirales", family: "Poxviridae" },
};

// Curated lineage for a virus genus, or null when we don't have one (then GBIF is
// tried). Marked matchType "CURATED" so it counts as placed but is distinguishable.
export function viralLineage(genus: string, species: string): Lineage | null {
  const ranks = VIRAL_LINEAGES[genus.trim().toLowerCase()];
  if (!ranks) return null;
  return {
    realm: ranks.realm,
    kingdom: ranks.kingdom ?? null,
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
