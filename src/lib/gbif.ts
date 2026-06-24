import type { Lineage } from "../types";

// Look up a name against the GBIF backbone taxonomy and return its bacterial
// lineage. Runs in the browser (GBIF allows cross-origin requests). Returns a
// Lineage with matchType "NONE" when nothing matched, or null on a network/HTTP
// failure so callers can leave the cached value untouched.
export async function fetchLineage(genus: string, species: string): Promise<Lineage | null> {
  const name = `${genus} ${species}`.trim();
  if (!name) return null;

  const url = `https://api.gbif.org/v1/species/match?strict=false&verbose=false&name=${encodeURIComponent(
    name,
  )}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null; // offline / blocked
  }
  if (!res.ok) return null;

  const d = (await res.json()) as Record<string, string>;
  const fetchedAt = new Date().toISOString();

  if (!d || d.matchType === "NONE") {
    return { matchType: "NONE", genus, species: name, fetchedAt };
  }

  return {
    kingdom: d.kingdom ?? null,
    phylum: d.phylum ?? null,
    class: d.class ?? null,
    order: d.order ?? null,
    family: d.family ?? null,
    genus: d.genus ?? genus,
    species: d.species ?? name,
    matchType: d.matchType ?? null,
    fetchedAt,
  };
}
