import type { Lineage, Species } from "../types";
import { gramGroupOf, binomial } from "./format";

// A node in the taxonomic tree handed to d3.hierarchy.
export interface TaxNode {
  name: string; // display name
  rank: "root" | "realm" | "kingdom" | "phylum" | "class" | "order" | "family" | "genus" | "isolate";
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

// GBIF/GTDB still returns superseded order names; map them to the current
// validly published name (by priority/ICNP). Keys are former names. Add entries
// as more surface. GTDB split suffixes (Rhizobiales_A) are stripped first, so a
// split order folds back into one node.
const MODERN_ORDER: Record<string, string> = {
  Rhizobiales: "Hyphomicrobiales", // Hyphomicrobiales has priority (2020)
  Enterobacteriales: "Enterobacterales", // emended form (2016)
  Corynebacteriales: "Mycobacteriales", // Mycobacteriales has priority
  Clostridiales: "Eubacteriales", // Eubacteriales (1938) has priority
  Xanthomonadales: "Lysobacterales", // Lysobacterales (1978) has priority
};

export function modernOrder(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.replace(/_[A-Z]+$/, "");
  return MODERN_ORDER[base] ?? base;
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
// `detailed` inserts a full class + order layer for every placed isolate (used
// by the dendrogram). `bacterial` (default true) applies the bacterial name
// corrections + Gram-based unplaced fallback; non-bacterial domains (viruses,
// parasites) use the raw GBIF lineage and a plain "Unplaced" fallback.
export interface TaxonomyOptions {
  detailed?: boolean;
  bacterial?: boolean;
}

// The ranks the non-bacterial detailed chain walks, top → bottom. Narrowed to
// the keys that exist on Lineage (a subset of TaxNode["rank"]) so the cached
// lineage can be indexed by rank without a cast.
type NbRank = "realm" | "kingdom" | "phylum" | "class" | "order" | "family";
const NB_RANKS: NbRank[] = ["realm", "kingdom", "phylum", "class", "order", "family"];

// A lineage's value at a rank, treating GBIF's placeholder kingdom "Viruses" as
// absent. GBIF tops every virus at kingdom "Viruses" (not a real ICTV rank),
// which otherwise forks a taxon away from curated rows carrying the true kingdom
// (e.g. Heunggongvirae) — so drop it and let the back-fill supply the real one.
function linRank(lin: Lineage, rank: NbRank): string | null | undefined {
  const v = lin[rank];
  return rank === "kingdom" && v === "Viruses" ? null : v;
}

// GBIF's virus backbone often returns a partial lineage (e.g. phylum but no
// realm/kingdom), while the curated map supplies the full chain for the genera
// it knows. Built naively, the same taxon then attaches under two different
// parents — once under the root (partial row) and once under its real ancestor
// (curated row) — so it forks. This derives, across all rows, the fullest set of
// higher-rank ancestors seen for each (rank, name); the build then back-fills any
// gaps so partial rows slot under the same ancestors as the complete ones.
function ancestryMap(species: Species[]): Map<string, Partial<Record<NbRank, string>>> {
  const anc = new Map<string, Partial<Record<NbRank, string>>>();
  for (const s of species) {
    const lin = s.lineage;
    if (!lin || lin.matchType === "NONE") continue;
    const present = NB_RANKS.map((r) => [r, linRank(lin, r)] as const).filter(([, v]) => v) as [
      NbRank,
      string,
    ][];
    present.forEach(([rank, name], i) => {
      const key = `${rank}:${name}`;
      const rec = anc.get(key) ?? {};
      for (let j = 0; j < i; j++) rec[present[j][0]] = present[j][1];
      anc.set(key, rec);
    });
  }
  return anc;
}

export function buildTaxonomy(species: Species[], opts: TaxonomyOptions = {}): TaxNode {
  const { detailed = false, bacterial = true } = opts;
  const root: TaxNode = { name: bacterial ? "Bacteria" : "Root", rank: "root", children: [] };

  // Only the non-bacterial detailed (dendrogram) topology walks the deep chain
  // where partial GBIF lineages cause forking; build the ancestry map for it.
  const anc = !bacterial && detailed ? ancestryMap(species) : null;

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

    if (lin && lin.matchType !== "NONE" && (lin.realm || lin.phylum || lin.class || lin.genus)) {
      if (bacterial) {
        node = child(node, resolvePhylum(s.genus, lin.phylum), "phylum");
        const cls = resolveClass(s.genus, lin.class);
        if (detailed) {
          // Show class for every phylum, plus the order, for finer grouping.
          if (cls) node = child(node, cls, "class", GREEK[cls]);
          const ord = modernOrder(lin.order);
          if (ord) node = child(node, ord, "order");
        } else if (cls && GREEK[cls]) {
          node = child(node, cls, "class", GREEK[cls]);
        }
      } else if (detailed) {
        // Non-bacterial detailed (dendrogram): the full available ICTV chain,
        // including realm + family, skipping any rank the lineage doesn't have.
        // Back-fill ranks this row is missing from the shared ancestry map so a
        // partial GBIF lineage lands under the same ancestors as a complete one
        // (no duplicate forked subtree). Filling from the deepest present rank
        // first picks up the longest known chain.
        const chain: Partial<Record<NbRank, string>> = {};
        for (const r of NB_RANKS) {
          const v = linRank(lin, r);
          if (v) chain[r] = v;
        }
        if (anc) {
          for (let i = NB_RANKS.length - 1; i >= 0; i--) {
            const r = NB_RANKS[i];
            if (!chain[r]) continue;
            const rec = anc.get(`${r}:${chain[r]}`);
            if (rec) for (const hr of NB_RANKS) if (rec[hr] && !chain[hr]) chain[hr] = rec[hr];
          }
        }
        for (const rank of NB_RANKS) if (chain[rank]) node = child(node, chain[rank] as string, rank);
      } else {
        // Non-bacterial lean (radial/outline): single top node + genus.
        node = child(node, lin.phylum || lin.kingdom || lin.realm || "Unplaced", "phylum");
      }
      // Use the entered (current) genus so the tree shows modern names, even when
      // GBIF placed the isolate via an old synonym.
      node = child(node, s.genus, "genus");
    } else if (bacterial) {
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
    } else {
      node = child(node, "Unplaced", "phylum");
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

// Every isolate beneath a node (the node itself if it is an isolate leaf).
export function gatherIsolates(node: TaxNode): Species[] {
  if (node.isolate) return [node.isolate];
  const out: Species[] = [];
  for (const c of node.children ?? []) out.push(...gatherIsolates(c));
  return out;
}

// How many isolates have a real (matched) lineage vs. need a GBIF lookup.
export function lineageStats(species: Species[]): { matched: number; missing: number } {
  let matched = 0;
  for (const s of species) {
    if (s.lineage && s.lineage.matchType && s.lineage.matchType !== "NONE") matched += 1;
  }
  return { matched, missing: species.length - matched };
}
