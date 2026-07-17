import type { Lineage } from "../types";
import { binomial } from "./format";

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
  // A placeholder epithet ("sp."/"spp."/blank) isn't a real name — GBIF often
  // returns NONE for "Genus spp.", so look the genus up on its own instead.
  // Normalise to binomial casing (capitalised genus, lower-case epithet) before
  // querying: GBIF's name parser returns matchType NONE for a capitalised
  // epithet like "Yersinia Enterocolitica", so a correctly-spelled row entered
  // with odd casing would otherwise never place.
  const sp = species.trim();
  const genusOnly = sp === "" || /^spp?\.?$/i.test(sp);
  const g = genus.trim();
  const primary = genusOnly
    ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase()
    : binomial(genus, species);
  const main = await matchName(primary);
  if (placed(main)) return main;

  const alt = oldName && oldName.trim() ? await matchName(oldName) : null;
  if (placed(alt)) return alt;

  // Neither placed — return whichever we actually got back.
  return main ?? alt;
}
