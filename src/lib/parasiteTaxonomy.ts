import type { Lineage } from "../types";

// GBIF still classifies protists under the deprecated, paraphyletic kingdoms
// Chromista and Protozoa. This lifts a fetched parasite lineage onto the modern
// eukaryote supergroups (Adl et al. 2019; Burki et al. 2020): the supergroup
// goes in the `realm` slot (as viruses use it for the ICTV realm), the clade
// names are corrected, and GBIF's class/order/family are kept beneath. Keyed off
// GBIF's phylum (more reliable than its kingdom), with a kingdom fallback.
// Genera GBIF mis-kingdoms (e.g. Plasmodium malariae → Animalia) are handled by
// the curated parasiteLineage map, which takes priority over this.

interface Supergroup {
  realm: string;
  // undefined = keep GBIF's value at that rank; null = drop it; string = set it.
  kingdom?: string | null;
  phylum?: string | null;
}

// By GBIF phylum (the more specific, reliable key).
const BY_PHYLUM: Record<string, Supergroup> = {
  // SAR · Alveolata
  Myzozoa: { realm: "SAR", kingdom: "Alveolata", phylum: "Apicomplexa" },
  Apicomplexa: { realm: "SAR", kingdom: "Alveolata", phylum: "Apicomplexa" },
  Ciliophora: { realm: "SAR", kingdom: "Alveolata" },
  Dinoflagellata: { realm: "SAR", kingdom: "Alveolata" },
  // SAR · Stramenopiles
  Bigyra: { realm: "SAR", kingdom: "Stramenopiles" },
  Ochrophyta: { realm: "SAR", kingdom: "Stramenopiles" },
  Oomycota: { realm: "SAR", kingdom: "Stramenopiles" },
  // SAR · Rhizaria
  Cercozoa: { realm: "SAR", kingdom: "Rhizaria" },
  Foraminifera: { realm: "SAR", kingdom: "Rhizaria" },
  // Amoebozoa (GBIF's "Amoebozoa" phylum is the supergroup — drop the duplicate)
  Amoebozoa: { realm: "Amoebozoa", kingdom: null, phylum: null },
  // Metamonada (likewise the supergroup name; class/order/family carry the detail)
  Metamonada: { realm: "Metamonada", kingdom: null, phylum: null },
  // Discoba (Euglenozoa is a real phylum within it — keep it)
  Euglenozoa: { realm: "Discoba", kingdom: null },
  Percolozoa: { realm: "Discoba", kingdom: null },
  Heterolobosea: { realm: "Discoba", kingdom: null },
};

// Fallback by GBIF kingdom for phyla not mapped above.
const BY_KINGDOM: Record<string, Supergroup> = {
  Animalia: { realm: "Opisthokonta", kingdom: "Animalia" },
  Fungi: { realm: "Opisthokonta", kingdom: "Fungi" },
  Chromista: { realm: "SAR", kingdom: null }, // a SAR phylum we haven't mapped yet
  // Protozoa is intentionally left unmapped: every protist phylum logged so far
  // is handled by BY_PHYLUM, so a Protozoa fallthrough flags a new phylum to add.
};

// Reclassify a GBIF parasite lineage onto the modern supergroups. Returns the
// lineage unchanged when nothing matches (e.g. already-CURATED rows, or a phylum
// we don't yet map — surfaced by the audit query so the table can be extended).
export function modernEukaryote(lin: Lineage): Lineage {
  const sg =
    (lin.phylum ? BY_PHYLUM[lin.phylum] : undefined) ??
    (lin.kingdom ? BY_KINGDOM[lin.kingdom] : undefined);
  if (!sg) return lin;
  return {
    ...lin,
    realm: sg.realm,
    kingdom: sg.kingdom === undefined ? lin.kingdom : sg.kingdom,
    phylum: sg.phylum === undefined ? lin.phylum : sg.phylum,
  };
}
