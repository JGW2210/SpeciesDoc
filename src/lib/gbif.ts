import type { Lineage } from "../types";

// One GBIF backbone match. Returns a Lineage with matchType "NONE" when nothing
// matched, or null on a network/HTTP failure so callers can leave the cached
// value untouched.
async function matchName(name: string): Promise<Lineage | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const url = `https://api.gbif.org/v1/species/match?strict=false&verbose=false&name=${encodeURIComponent(
    trimmed,
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
    return { matchType: "NONE", species: trimmed, fetchedAt };
  }

  return {
    kingdom: d.kingdom ?? null,
    phylum: d.phylum ?? null,
    class: d.class ?? null,
    order: d.order ?? null,
    family: d.family ?? null,
    genus: d.genus ?? null,
    species: d.species ?? trimmed,
    matchType: d.matchType ?? null,
    fetchedAt,
  };
}

// A usable placement needs at least a phylum from a real (non-NONE) match.
const placed = (l: Lineage | null): boolean => !!l && l.matchType !== "NONE" && !!l.phylum;

// Look a name up against GBIF. Modern names are often only registered under a
// synonym, so if the current name can't be placed we retry with the supplied
// old name and prefer whichever result actually lands in the taxonomy.
export async function fetchLineage(
  genus: string,
  species: string,
  oldName?: string | null,
): Promise<Lineage | null> {
  const primary = `${genus} ${species}`.trim();
  const main = await matchName(primary);
  if (placed(main)) return main;

  const alt = oldName && oldName.trim() ? await matchName(oldName) : null;
  if (placed(alt)) return alt;

  // Neither placed — return whichever we actually got back.
  return main ?? alt;
}
