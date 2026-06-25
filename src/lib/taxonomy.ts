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
// validly published equivalents for display.
const MODERN_PHYLUM: Record<string, string> = {
  Actinobacteria: "Actinomycetota",
  Actinobacteriota: "Actinomycetota",
  Firmicutes: "Bacillota",
  Proteobacteria: "Pseudomonadota",
  Bacteroidetes: "Bacteroidota",
  Chlamydiae: "Chlamydiota",
  Spirochaetes: "Spirochaetota",
  Cyanobacteria: "Cyanobacteriota",
  Tenericutes: "Mycoplasmatota",
  Fusobacteria: "Fusobacteriota",
  "Deinococcus-Thermus": "Deinococcota",
  Chloroflexi: "Chloroflexota",
  Verrucomicrobia: "Verrucomicrobiota",
  Planctomycetes: "Planctomycetota",
  Acidobacteria: "Acidobacteriota",
  Aquificae: "Aquificota",
  Thermotogae: "Thermotogota",
  Synergistetes: "Synergistota",
  Gemmatimonadetes: "Gemmatimonadota",
  Nitrospirae: "Nitrospirota",
  Epsilonbacteraeota: "Campylobacterota",
  Fibrobacteres: "Fibrobacterota",
};

export function modernPhylum(name: string | null | undefined): string {
  if (!name) return "Other bacteria";
  // Strip GTDB-style split suffixes (e.g. Firmicutes_A, Actinobacteriota_B) so
  // they fold into the single current phylum.
  const base = name.replace(/_[A-Z]+$/, "");
  return MODERN_PHYLUM[base] ?? base;
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
      node = child(node, modernPhylum(lin.phylum), "phylum");
      if (lin.class && GREEK[lin.class]) {
        node = child(node, lin.class, "class", GREEK[lin.class]);
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
