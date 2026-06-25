import type { Species } from "../types";
import { gramGroupOf, binomial } from "./format";

// A node in the taxonomic tree handed to d3.hierarchy.
export interface TaxNode {
  name: string; // display name
  rank: "root" | "phylum" | "class" | "genus" | "isolate";
  tag?: string; // optional short marker (e.g. greek letter for Proteobacteria)
  isolate?: Species; // present on individual leaves
  isolates?: Species[]; // all isolates under a genus (used for collapsing)
  key?: string; // stable id for a genus node (phylum/genus)
  children?: TaxNode[];
}

// Proteobacteria classes get their classic greek shorthand, matching the
// α/β/γ/ε labels in the reference tree.
const GREEK: Record<string, string> = {
  Alphaproteobacteria: "α",
  Betaproteobacteria: "β",
  Gammaproteobacteria: "γ",
  Deltaproteobacteria: "δ",
  Epsilonproteobacteria: "ε",
  Zetaproteobacteria: "ζ",
};

// GBIF's backbone still uses pre-2021 phylum names; map them to the current,
// validly published equivalents (ICNP, Oren & Garrity 2021) for display. Keys
// are former names; modern names not listed here pass through unchanged.
const MODERN_PHYLUM: Record<string, string> = {
  Acidobacteria: "Acidobacteriota",
  Actinobacteria: "Actinomycetota",
  Actinobacteriota: "Actinomycetota",
  Aquificae: "Aquificota",
  Armatimonadetes: "Armatimonadota",
  Atribacterota: "Atribacterota",
  Bacteroidetes: "Bacteroidota",
  Balneolaeota: "Balneolota",
  Caldiserica: "Caldisericota",
  Calditrichaeota: "Calditrichota",
  Chlamydiae: "Chlamydiota",
  Chlorobi: "Chlorobiota",
  Chloroflexi: "Chloroflexota",
  Chrysiogenetes: "Chrysiogenota",
  Coprothermobacterota: "Coprothermobacterota",
  Cyanobacteria: "Cyanobacteriota",
  Deferribacteres: "Deferribacterota",
  "Deinococcus-Thermus": "Deinococcota",
  Deinococcota: "Deinococcota",
  Dictyoglomi: "Dictyoglomota",
  Elusimicrobia: "Elusimicrobiota",
  Epsilonbacteraeota: "Campylobacterota",
  Epsilonproteobacteria: "Campylobacterota",
  Fibrobacteres: "Fibrobacterota",
  Firmicutes: "Bacillota",
  Fusobacteria: "Fusobacteriota",
  Gemmatimonadetes: "Gemmatimonadota",
  Ignavibacteriae: "Ignavibacteriota",
  Kiritimatiellaeota: "Kiritimatiellota",
  Lentisphaerae: "Lentisphaerota",
  Nitrospinae: "Nitrospinota",
  Nitrospirae: "Nitrospirota",
  Planctomycetes: "Planctomycetota",
  Proteobacteria: "Pseudomonadota",
  Rhodothermaeota: "Rhodothermota",
  Spirochaetes: "Spirochaetota",
  Synergistetes: "Synergistota",
  Tenericutes: "Mycoplasmatota",
  Thermodesulfobacteria: "Thermodesulfobacteriota",
  Thermotogae: "Thermotogota",
  Verrucomicrobia: "Verrucomicrobiota",
};

export function modernPhylum(name: string | null | undefined): string {
  if (!name) return "Other bacteria";
  // Strip GTDB-style split suffixes (e.g. Firmicutes_A, Actinobacteriota_B) so
  // they fold into the single current phylum.
  const base = name.replace(/_[A-Z]+$/, "");
  return MODERN_PHYLUM[base] ?? base;
}

// GBIF/GTDB nests some genera inside a broader phylum that the ICNP recognises
// separately. Pin these to their ICNP phylum, keyed by lowercase genus. The
// classic case is the wall-less Mollicutes (Mycoplasma & relatives), which GTDB
// places inside Bacillota/Firmicutes but ICNP keeps as phylum Mycoplasmatota.
const PHYLUM_BY_GENUS: Record<string, string> = {
  mycoplasma: "Mycoplasmatota",
  mycoplasmoides: "Mycoplasmatota", // M. genitalium / pneumoniae were moved here
  mycoplasmopsis: "Mycoplasmatota",
  metamycoplasma: "Mycoplasmatota", // former Mycoplasma hominis
  ureaplasma: "Mycoplasmatota",
  acholeplasma: "Mycoplasmatota",
  spiroplasma: "Mycoplasmatota",
};

// The phylum to display for an isolate: a curated genus override if we have one,
// otherwise GBIF's cached phylum (modernised).
export function resolvePhylum(genus: string, gbifPhylum?: string | null): string {
  return PHYLUM_BY_GENUS[genus.trim().toLowerCase()] ?? modernPhylum(gbifPhylum);
}

// GBIF's bacterial backbone sometimes hands back the wrong Proteobacteria class
// (e.g. it has placed Neisseria under Alphaproteobacteria). These curated
// overrides pin well-known genera to their classical Bergey's/LPSN class so the
// tree's α/β/γ tags are correct. Keyed by lowercase genus; extend as needed.
// Genera not listed fall through to whatever GBIF returned.
const CLASS_BY_GENUS: Record<string, string> = {
  // Betaproteobacteria — GTDB folds these into Gammaproteobacteria, so the GBIF
  // backbone frequently mislabels them.
  neisseria: "Betaproteobacteria",
  eikenella: "Betaproteobacteria",
  kingella: "Betaproteobacteria",
  chromobacterium: "Betaproteobacteria",
  bordetella: "Betaproteobacteria",
  achromobacter: "Betaproteobacteria",
  alcaligenes: "Betaproteobacteria",
  burkholderia: "Betaproteobacteria",
  ralstonia: "Betaproteobacteria",
  cupriavidus: "Betaproteobacteria",
  comamonas: "Betaproteobacteria",
  acidovorax: "Betaproteobacteria",
  delftia: "Betaproteobacteria",
  oligella: "Betaproteobacteria",
  taylorella: "Betaproteobacteria",
  spirillum: "Betaproteobacteria",
  // Alphaproteobacteria
  brucella: "Alphaproteobacteria",
  ochrobactrum: "Alphaproteobacteria",
  bartonella: "Alphaproteobacteria",
  rickettsia: "Alphaproteobacteria",
  orientia: "Alphaproteobacteria",
  ehrlichia: "Alphaproteobacteria",
  anaplasma: "Alphaproteobacteria",
  agrobacterium: "Alphaproteobacteria",
  methylobacterium: "Alphaproteobacteria",
  sphingomonas: "Alphaproteobacteria",
  roseomonas: "Alphaproteobacteria",
  paracoccus: "Alphaproteobacteria",
  afipia: "Alphaproteobacteria",
  // Mollicutes — paired with the Mycoplasmatota phylum override above so the
  // detail breadcrumb reads consistently (GBIF reports these as "Bacilli").
  // Not in GREEK, so no class node/tag is drawn on the tree.
  mycoplasma: "Mollicutes",
  mycoplasmoides: "Mollicutes",
  mycoplasmopsis: "Mollicutes",
  metamycoplasma: "Mollicutes",
  ureaplasma: "Mollicutes",
  acholeplasma: "Mollicutes",
  spiroplasma: "Mollicutes",
};

// The class to display for an isolate: a curated override by genus if we have
// one, otherwise GBIF's cached class.
export function resolveClass(genus: string, gbifClass?: string | null): string | null {
  return CLASS_BY_GENUS[genus.trim().toLowerCase()] ?? gbifClass ?? null;
}

// Build the topology phylum → (class, only for Proteobacteria) → genus → isolate.
// Order/family are intentionally skipped to keep the radial tree readable like
// the reference figure; the full lineage is still shown in the detail panel.
export function buildTaxonomy(species: Species[]): TaxNode {
  const root: TaxNode = { name: "Bacteria", rank: "root", children: [] };

  const child = (parent: TaxNode, name: string, rank: TaxNode["rank"], tag?: string): TaxNode => {
    parent.children = parent.children ?? [];
    let n = parent.children.find((c) => !c.isolate && c.rank === rank && c.name === name);
    if (!n) {
      n = { name, rank, tag, children: [] };
      parent.children.push(n);
    }
    return n;
  };

  for (const s of species) {
    const lin = s.lineage;
    let node = root;

    if (lin && lin.matchType !== "NONE" && (lin.phylum || lin.class || lin.genus)) {
      node = child(node, resolvePhylum(s.genus, lin.phylum), "phylum");
      const cls = resolveClass(s.genus, lin.class);
      if (cls && GREEK[cls]) {
        node = child(node, cls, "class", GREEK[cls]);
      }
      // Use the entered (current) genus so the tree shows modern names, even when
      // GBIF placed the isolate via an old synonym.
      node = child(node, s.genus, "genus");
    } else {
      // No lineage yet: fall back to a Gram-based grouping so the isolate still
      // appears on the tree.
      const g = gramGroupOf(s);
      const label =
        g === "positive"
          ? "Unplaced · Gram-positive"
          : g === "negative"
            ? "Unplaced · Gram-negative"
            : g === "acidfast"
              ? "Unplaced · Acid-fast"
              : "Unplaced";
      node = child(node, label, "phylum");
      node = child(node, s.genus, "genus");
    }

    node.children = node.children ?? [];
    node.children.push({ name: binomial(s.genus, s.species), rank: "isolate", isolate: s });
  }

  // Stable ordering so the layout doesn't reshuffle between renders.
  const sortRec = (n: TaxNode) => {
    n.children?.sort((a, b) => a.name.localeCompare(b.name));
    n.children?.forEach(sortRec);
  };
  sortRec(root);

  return root;
}

// How many isolates have a real (matched) lineage vs. need a GBIF lookup.
export function lineageStats(species: Species[]): { matched: number; missing: number } {
  let matched = 0;
  for (const s of species) {
    if (s.lineage && s.lineage.matchType && s.lineage.matchType !== "NONE") matched += 1;
  }
  return { matched, missing: species.length - matched };
}
