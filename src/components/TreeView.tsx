import { useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchy,
  cluster,
  type HierarchyNode,
  type HierarchyPointNode,
} from "d3-hierarchy";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import {
  buildTaxonomy,
  gatherIsolates,
  resolvePhylum,
  resolveClass,
  type TaxNode,
} from "../lib/taxonomy";
import { binomial } from "../lib/format";
import { CATEGORIES } from "../data/categories";
import OutlineTree from "./OutlineTree";
import type { Species } from "../types";

// Horizontal dendrogram geometry (a rectangular cladogram: root at the left,
// ranks fanning out to the right, species labels down the right edge).
const ROW_H = 17; // vertical spacing between leaves
const COL_W = 156; // horizontal spacing between ranks
const PAD_LEFT = 30;
const PAD_TOP = 24;
const PAD_BOT = 24;
const LABEL_W = 300; // right margin reserved for species labels
const COLLAPSE_MIN = 3; // genera with this many isolates auto-collapse into one node

const PHYLUM_COLORS = [
  "#6a2c91",
  "#c12968",
  "#0e7c86",
  "#9a6a16",
  "#2f6f4f",
  "#3a567a",
  "#8a4b9c",
  "#b2563a",
  "#4d6b8a",
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PHYLUM_COLORS[h % PHYLUM_COLORS.length];
}

// Cartesian projection: depth (node.y) → x, breadth (node.x) → y.
const sx = (n: HierarchyPointNode<TaxNode>) => n.y + PAD_LEFT;
const sy = (n: HierarchyPointNode<TaxNode>) => n.x + PAD_TOP;

// Stable collapse key per collapsible node (rank-prefixed to avoid clashes).
function keyOf(node: TaxNode, phylum: string): string | null {
  if (node.rank === "phylum") return `p:${node.name}`;
  if (node.rank === "class") return `c:${phylum}/${node.name}`;
  if (node.rank === "genus") return `g:${phylum}/${node.name}`;
  return null;
}

// Genera with many isolates start collapsed; phyla/classes start expanded.
function defaultCollapsed(node: TaxNode): boolean {
  return node.rank === "genus" && gatherIsolates(node).length >= COLLAPSE_MIN;
}

// Apply collapse state: a collapsed node becomes a leaf carrying every isolate
// beneath it. `overrides` flips a node away from its default state.
function collapse(node: TaxNode, phylum: string, overrides: Set<string>): TaxNode {
  const key = keyOf(node, phylum);
  const isCollapsed = key ? defaultCollapsed(node) !== overrides.has(key) : false;
  const isolates = node.rank === "isolate" ? undefined : gatherIsolates(node);

  if (key && isCollapsed) {
    return { ...node, key, isolates, children: undefined };
  }
  const nextPhylum = node.rank === "phylum" ? node.name : phylum;
  return {
    ...node,
    key: key ?? node.key,
    isolates,
    children: node.children?.map((c) => collapse(c, nextPhylum, overrides)),
  };
}

const hits = (s: Species, q: string) =>
  q !== "" && binomial(s.genus, s.species).toLowerCase().includes(q);

// Find a (phylum/class) subtree by its collapse key, to re-root the layout when
// the user focuses on a branch.
function findByKey(node: TaxNode, phylum: string, target: string): TaxNode | null {
  if (keyOf(node, phylum) === target) return node;
  const nextPhylum = node.rank === "phylum" ? node.name : phylum;
  for (const c of node.children ?? []) {
    const found = findByKey(c, nextPhylum, target);
    if (found) return found;
  }
  return null;
}

// Every collapsible genus key, and which ones are "big" (collapsed by default),
// so Expand-all / Collapse-all can compute the right override set.
function genusKeys(species: Species[]): { all: string[]; big: Set<string> } {
  const all: string[] = [];
  const big = new Set<string>();
  const walk = (n: TaxNode, phylum: string) => {
    if (n.rank === "genus") {
      const k = keyOf(n, phylum)!;
      all.push(k);
      if (gatherIsolates(n).length >= COLLAPSE_MIN) big.add(k);
    }
    const nextPhylum = n.rank === "phylum" ? n.name : phylum;
    n.children?.forEach((c) => walk(c, nextPhylum));
  };
  walk(buildTaxonomy(species), "");
  return { all, big };
}

// "Bacteria › Pseudomonadota › β" trail for the current focus key.
function focusCrumb(focus: string | null): { label: string; key: string | null }[] {
  const trail: { label: string; key: string | null }[] = [{ label: "Bacteria", key: null }];
  if (!focus) return trail;
  if (focus.startsWith("p:")) {
    trail.push({ label: focus.slice(2), key: focus });
  } else if (focus.startsWith("c:")) {
    const rest = focus.slice(2); // phylum/Class
    const slash = rest.indexOf("/");
    trail.push({ label: rest.slice(0, slash), key: `p:${rest.slice(0, slash)}` });
    trail.push({ label: rest.slice(slash + 1), key: focus });
  }
  return trail;
}

interface TreeViewProps {
  species: Species[];
  enriching: boolean;
  onRefreshLineage: () => void;
  onEdit: (s: Species) => void;
}

export default function TreeView({ species, enriching, onRefreshLineage, onEdit }: TreeViewProps) {
  const [mode, setMode] = useState<"dendro" | "outline">("dendro");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Species | null>(null);

  if (species.length === 0) {
    return (
      <div className="empty">
        <p className="empty__head">Nothing to branch yet.</p>
        <p className="empty__sub">Log a few isolates and they’ll appear here as a taxonomic tree.</p>
      </div>
    );
  }

  const missing = species.filter((s) => !s.lineage || s.lineage.matchType === "NONE").length;
  const unplaced = species.filter((s) => s.lineage && s.lineage.matchType === "NONE");

  return (
    <div className="tree">
      <div className="tree__bar">
        <div>
          <h2 className="tree__title">Taxonomic tree</h2>
          <p className="tree__sub">
            Topology from GBIF lineage · branches are ranks, not evolutionary distance
          </p>
        </div>
        <div className="tree__actions">
          <input
            className="list__search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an isolate…"
            aria-label="Search the tree by name"
          />
          <div className="treetoggle" role="group" aria-label="Tree layout">
            <button
              type="button"
              className={`treetoggle__btn${mode === "dendro" ? " is-on" : ""}`}
              aria-pressed={mode === "dendro"}
              onClick={() => setMode("dendro")}
            >
              Dendrogram
            </button>
            <button
              type="button"
              className={`treetoggle__btn${mode === "outline" ? " is-on" : ""}`}
              aria-pressed={mode === "outline"}
              onClick={() => setMode("outline")}
            >
              Outline
            </button>
          </div>
          <button
            type="button"
            className="btn btn--ghost tree__refresh"
            onClick={onRefreshLineage}
            disabled={enriching || missing === 0}
            title="Look up lineage from GBIF for isolates that don't have it yet"
          >
            {enriching ? "Fetching…" : missing > 0 ? `Fetch lineage (${missing})` : "Lineage up to date"}
          </button>
        </div>
      </div>

      <div className={`tree__stage tree__stage--${mode}`}>
        {mode === "dendro" ? (
          <Dendrogram
            species={species}
            query={query}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        ) : (
          <OutlineTree
            species={species}
            query={query}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        )}

        {selected && (
          <aside className="treedetail">
            <button className="treedetail__close" onClick={() => setSelected(null)} aria-label="Close">
              ×
            </button>
            <h3 className="treedetail__name">
              <em>{binomial(selected.genus, selected.species)}</em>
            </h3>
            {selected.old_name && (
              <p className="treedetail__syn">
                syn. <em>{selected.old_name}</em>
              </p>
            )}
            <Lineagecrumb species={selected} />
            <Readout species={selected} />
            <button className="btn btn--ghost treedetail__edit" onClick={() => onEdit(selected)}>
              Edit isolate
            </button>
          </aside>
        )}
      </div>

      {unplaced.length > 0 && (
        <div className="treeunplaced">
          <div className="treeunplaced__head">Unplaced — no taxonomy match ({unplaced.length})</div>
          <p className="treeunplaced__hint">
            GBIF couldn’t place these names. Check the spelling, or they may be too esoteric to match —
            click one to edit.
          </p>
          <div className="treeunplaced__chips">
            {unplaced.map((s) => (
              <button key={s.id} className="treeunplaced__chip" onClick={() => onEdit(s)} title="Edit isolate">
                <em>{binomial(s.genus, s.species)}</em>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface DendrogramProps {
  species: Species[];
  query: string;
  selectedId: string | null;
  onSelect: (s: Species) => void;
}

function Dendrogram({ species, query, selectedId, onSelect }: DendrogramProps) {
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const q = query.trim().toLowerCase();

  const toggle = (key: string) =>
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const gk = useMemo(() => genusKeys(species), [species]);
  const expandAll = () => setOverrides(new Set(gk.big));
  const collapseAll = () => setOverrides(new Set(gk.all.filter((k) => !gk.big.has(k))));
  const resetLayout = () => {
    setOverrides(new Set());
    setFocus(null);
  };
  const resetView = () => {
    if (svgRef.current && zoomRef.current)
      select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  };

  // Wire up pan + wheel/pinch zoom once.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const sel = select(svg);
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 12])
      .on("zoom", (e) => setTransform(e.transform));
    sel.call(z).on("dblclick.zoom", null); // keep double-clicks for nodes
    zoomRef.current = z;
    return () => {
      sel.on(".zoom", null);
    };
  }, []);

  const focusPhylum = focus
    ? focus.startsWith("p:")
      ? focus.slice(2)
      : focus.slice(2, focus.indexOf("/"))
    : null;

  const { leaves, links, internals, handles, vbW, vbH, fit, fitSig } = useMemo(() => {
    const full = collapse(buildTaxonomy(species), "", overrides);
    const rootData = focus ? findByKey(full, "", focus) ?? full : full;

    const hroot = hierarchy(rootData);
    const leafCount = hroot.leaves().length;
    let maxDepth = 1;
    hroot.each((n) => {
      if (n.depth > maxDepth) maxDepth = n.depth;
    });
    const H = Math.max((leafCount - 1) * ROW_H, 80);
    const W = maxDepth * COL_W;
    const root = cluster<TaxNode>().size([H, W]).separation(() => 1)(hroot);

    const allLeaves = root.leaves();
    const allLinks = root.links();

    // Internal nodes that get a rank label (phylum / class / genus) drawn on the
    // left side of the canvas, well clear of the right-edge species labels.
    const internalNodes = root
      .descendants()
      .filter(
        (n) => !!n.children && n.depth >= 1 && ["phylum", "class", "genus"].includes(n.data.rank),
      );

    // Collapse handle on expanded, collapsible genera.
    const handleNodes = root
      .descendants()
      .filter((n) => !!n.children && n.data.rank === "genus" && (n.data.isolates?.length ?? 0) >= COLLAPSE_MIN);

    // When searching, frame the matches: fit the bounding box of matched tips.
    let fit: ZoomTransform | null = null;
    let fitSig = "";
    if (q) {
      const pts = allLeaves
        .filter((leaf) => {
          const d = leaf.data;
          if (d.isolate) return hits(d.isolate, q);
          return (d.isolates ?? []).some((s) => hits(s, q));
        })
        .map((leaf) => [sx(leaf), sy(leaf)] as [number, number]);
      if (pts.length) {
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const w = Math.max(Math.max(...xs) - Math.min(...xs), 1) + LABEL_W;
        const h = Math.max(Math.max(...ys) - Math.min(...ys), 1) + 80;
        const vw = PAD_LEFT + W + LABEL_W;
        const vh = H + PAD_TOP + PAD_BOT;
        const k = Math.max(0.5, Math.min(6, Math.min(vw / w, vh / h)));
        const tx = vw / 2 - k * cx;
        const ty = vh / 2 - k * cy;
        fit = zoomIdentity.translate(tx, ty).scale(k);
        fitSig = `${Math.round(k * 100)}:${Math.round(tx)}:${Math.round(ty)}`;
      }
    }

    return {
      leaves: allLeaves,
      links: allLinks,
      internals: internalNodes,
      handles: handleNodes,
      vbW: PAD_LEFT + W + LABEL_W,
      vbH: H + PAD_TOP + PAD_BOT,
      fit,
      fitSig,
    };
  }, [species, overrides, focus, q]);

  // Apply the fit-to-search transform (or reset when the search clears).
  useEffect(() => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    const sel = select(svg);
    if (fit) sel.call(z.transform, fit);
    else if (q === "") sel.call(z.transform, zoomIdentity);
  }, [fitSig, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const crumb = focusCrumb(focus);

  const phylumColor = (n: HierarchyNode<TaxNode>) => {
    const p = n.ancestors().find((a) => a.data.rank === "phylum");
    return p ? colorFor(p.data.name) : focusPhylum ? colorFor(focusPhylum) : "#5b6573";
  };

  return (
    <>
      {focus && (
        <nav className="tree__crumb" aria-label="Focused branch">
          {crumb.map((c, i) => (
            <span key={i} className="tree__crumb-item">
              {i > 0 && (
                <span className="tree__crumb-sep" aria-hidden="true">
                  ›
                </span>
              )}
              {i < crumb.length - 1 ? (
                <button type="button" className="tree__crumb-link" onClick={() => setFocus(c.key)}>
                  {c.label}
                </button>
              ) : (
                <span className="tree__crumb-cur">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="tree__controls">
        <button type="button" className="btn btn--ghost btn--sm" onClick={expandAll}>
          Expand all
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={collapseAll}>
          Collapse all
        </button>
        {(transform.k !== 1 || transform.x !== 0 || transform.y !== 0) && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetView}>
            Reset view
          </button>
        )}
        {(overrides.size > 0 || focus) && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetLayout}>
            Reset layout
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        className="tree__svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label="Dendrogram of logged isolates. Scroll to zoom, drag to pan."
      >
        <g transform={transform.toString()}>
          {/* branches */}
          <g className="tree__links" fill="none">
            {links.map((lk, i) => {
              const x1 = sx(lk.source);
              const y1 = sy(lk.source);
              const x2 = sx(lk.target);
              const y2 = sy(lk.target);
              return <path key={i} className="tree__link" d={`M${x1},${y1}L${x1},${y2}L${x2},${y2}`} />;
            })}
          </g>

          {/* rank labels on internal nodes (phylum / class / genus) */}
          {internals.map((n) => {
            const d = n.data;
            const isPhylum = d.rank === "phylum";
            const isClass = d.rank === "class";
            const color = isPhylum ? colorFor(d.name) : phylumColor(n);
            const onClickNode = () =>
              isPhylum || isClass
                ? setFocus(
                    isPhylum
                      ? `p:${d.name}`
                      : `c:${n.parent?.data.name ?? ""}/${d.name}`,
                  )
                : toggle(d.key ?? keyOf(d, n.parent?.data.name ?? "") ?? "");
            return (
              <g key={`${d.rank}-${sx(n)}-${sy(n)}`} className="dendlabel" onClick={onClickNode}>
                <circle className="dendlabel__dot" cx={sx(n)} cy={sy(n)} r={3.2} fill={color} />
                <text
                  className={`dendlabel__text dendlabel__text--${d.rank}`}
                  x={sx(n) + 6}
                  y={sy(n) - 5}
                  fill={isPhylum ? color : undefined}
                >
                  {isClass && d.tag ? `${d.tag} ${d.name}` : d.name}
                  <title>
                    {isPhylum || isClass ? "Focus on " : "Collapse "}
                    {d.name}
                  </title>
                </text>
              </g>
            );
          })}

          {/* collapse handles on expanded genera */}
          {handles.map((n) => (
            <g
              key={`h-${n.data.key}`}
              className="treehandle"
              transform={`translate(${sx(n)},${sy(n)})`}
              onClick={() => toggle(n.data.key!)}
            >
              <circle r={6}>
                <title>Collapse {n.data.name}</title>
              </circle>
              <line x1={-3} y1={0} x2={3} y2={0} />
            </g>
          ))}

          {/* tips: isolates and collapsed blobs */}
          {leaves.map((leaf) => {
            const d = leaf.data;
            const color = phylumColor(leaf);
            const x = sx(leaf);
            const y = sy(leaf);

            // Collapsed genus/class/phylum — a counted blob.
            if (!leaf.children && d.rank !== "isolate" && d.isolates) {
              const count = d.isolates.length;
              const r = 5 + Math.min(count, 14) * 0.7;
              const anyHit = q !== "" && d.isolates.some((s) => hits(s, q));
              const cls = q !== "" ? (anyHit ? " is-hit" : " is-dim") : "";
              return (
                <g key={d.key} className={`treenode${cls}`}>
                  <circle
                    className="treenode__cluster"
                    cx={x}
                    cy={y}
                    r={r}
                    fill={color}
                    tabIndex={0}
                    role="button"
                    aria-label={`${d.name}, ${count} isolates. Activate to expand.`}
                    onClick={() => toggle(d.key!)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(d.key!);
                      }
                    }}
                  >
                    <title>{`${d.name} — ${count} isolate${count === 1 ? "" : "s"} (click to expand)`}</title>
                  </circle>
                  <text className="treenode__count" x={x} y={y} dy="0.32em" textAnchor="middle">
                    {count}
                  </text>
                  <text className="treenode__label treenode__label--cluster" x={x + r + 6} y={y} dy="0.31em">
                    <tspan fontStyle="italic">{d.name}</tspan> spp.
                  </text>
                </g>
              );
            }

            // Individual isolate tip.
            const s = d.isolate!;
            const isSel = selectedId === s.id;
            const hit = hits(s, q);
            const cls = q !== "" ? (hit ? " is-hit" : " is-dim") : "";
            return (
              <g key={s.id} className={`treenode${cls}`}>
                <circle
                  className={`treenode__dot${isSel ? " is-sel" : ""}`}
                  cx={x}
                  cy={y}
                  r={isSel ? 6 : 4}
                  fill={color}
                  tabIndex={0}
                  role="button"
                  aria-label={`${binomial(s.genus, s.species)}. Activate for details.`}
                  onClick={() => onSelect(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(s);
                    }
                  }}
                />
                <text
                  className="treenode__label"
                  x={x + 9}
                  y={y}
                  dy="0.31em"
                  onClick={() => onSelect(s)}
                >
                  {binomial(s.genus, s.species)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </>
  );
}

function Lineagecrumb({ species }: { species: Species }) {
  const lin = species.lineage;
  if (!lin || lin.matchType === "NONE") {
    return <p className="treedetail__crumb treedetail__crumb--none">No GBIF lineage — grouped by Gram.</p>;
  }
  const parts = [
    resolvePhylum(species.genus, lin.phylum),
    resolveClass(species.genus, lin.class),
    lin.order,
    lin.family,
    lin.genus,
  ].filter(Boolean);
  return (
    <p className="treedetail__crumb">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="treedetail__sep"> › </span>}
          {p}
        </span>
      ))}
    </p>
  );
}

const CHIP_KEYS = CATEGORIES.filter((c) => c.key !== "other_notes");

function Readout({ species }: { species: Species }) {
  const results = CHIP_KEYS.map((cat) => ({ cat, value: species[cat.key] })).filter(
    (r): r is { cat: (typeof CHIP_KEYS)[number]; value: string } => !!r.value && r.value.trim() !== "",
  );
  if (results.length === 0) {
    return <p className="treedetail__crumb treedetail__crumb--none">No test results recorded.</p>;
  }
  return (
    <ul className="readout treedetail__readout">
      {results.map(({ cat, value }) => (
        <li key={cat.key} className="rchip rchip--neutral">
          <span className="rchip__k">{cat.short}</span>
          <span className="rchip__v">{value}</span>
        </li>
      ))}
    </ul>
  );
}
