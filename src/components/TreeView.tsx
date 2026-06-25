import { useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchy,
  cluster,
  type HierarchyNode,
  type HierarchyPointNode,
  type HierarchyPointLink,
} from "d3-hierarchy";
import { polygonHull, polygonCentroid } from "d3-polygon";
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

const COLLAPSE_MIN = 3; // genera with this many isolates auto-collapse into one node

// Radial geometry.
const SIZE = 1000;
const C = SIZE / 2;
const RADIUS = 332;
const HULL_PAD = 30;

// Dendrogram geometry (horizontal rectangular cladogram).
const ROW_H = 17;
const COL_W = 156;
const PAD_LEFT = 30;
const PAD_TOP = 24;
const PAD_BOT = 24;
const LABEL_W = 300;

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

// Radial polar → cartesian (centre at origin).
function polar(node: HierarchyPointNode<TaxNode>): [number, number] {
  const a = node.x - Math.PI / 2;
  return [node.y * Math.cos(a), node.y * Math.sin(a)];
}
// Dendrogram: depth (node.y) → x, breadth (node.x) → y.
const dx = (n: HierarchyPointNode<TaxNode>) => n.y + PAD_LEFT;
const dy = (n: HierarchyPointNode<TaxNode>) => n.x + PAD_TOP;

// Stable collapse key per collapsible node (rank-prefixed to avoid clashes).
function keyOf(node: TaxNode, phylum: string): string | null {
  if (node.rank === "phylum") return `p:${node.name}`;
  if (node.rank === "class") return `c:${phylum}/${node.name}`;
  if (node.rank === "genus") return `g:${phylum}/${node.name}`;
  return null;
}

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

const phylumOf = (focus: string | null) =>
  focus ? (focus.startsWith("p:") ? focus.slice(2) : focus.slice(2, focus.indexOf("/"))) : null;

// Shared interaction state for both SVG layouts: collapse overrides, focus
// (re-root), and pan/zoom.
function useTreeNav(species: Species[]) {
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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

  return {
    overrides,
    focus,
    setFocus,
    transform,
    svgRef,
    zoomRef,
    toggle,
    expandAll,
    collapseAll,
    resetLayout,
    resetView,
  };
}

type TreeNav = ReturnType<typeof useTreeNav>;

// Apply the fit-to-search transform (or reset when the search clears).
function useFit(nav: TreeNav, fit: ZoomTransform | null, fitSig: string, q: string) {
  useEffect(() => {
    const svg = nav.svgRef.current;
    const z = nav.zoomRef.current;
    if (!svg || !z) return;
    const sel = select(svg);
    if (fit) sel.call(z.transform, fit);
    else if (q === "") sel.call(z.transform, zoomIdentity);
  }, [fitSig, q]); // eslint-disable-line react-hooks/exhaustive-deps
}

function TreeControls({ nav }: { nav: TreeNav }) {
  const { transform, overrides, focus } = nav;
  const crumb = focusCrumb(focus);
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
                <button type="button" className="tree__crumb-link" onClick={() => nav.setFocus(c.key)}>
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
        <button type="button" className="btn btn--ghost btn--sm" onClick={nav.expandAll}>
          Expand all
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={nav.collapseAll}>
          Collapse all
        </button>
        {(transform.k !== 1 || transform.x !== 0 || transform.y !== 0) && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={nav.resetView}>
            Reset view
          </button>
        )}
        {(overrides.size > 0 || focus) && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={nav.resetLayout}>
            Reset layout
          </button>
        )}
      </div>
    </>
  );
}

type Layout = "radial" | "dendro" | "outline";

interface TreeViewProps {
  species: Species[];
  enriching: boolean;
  onRefreshLineage: () => void;
  onEdit: (s: Species) => void;
}

export default function TreeView({ species, enriching, onRefreshLineage, onEdit }: TreeViewProps) {
  const [mode, setMode] = useState<Layout>("dendro");
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
  const viewProps = {
    species,
    query,
    selectedId: selected?.id ?? null,
    onSelect: setSelected,
  };

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
            {(
              [
                ["radial", "Radial"],
                ["dendro", "Dendrogram"],
                ["outline", "Outline"],
              ] as [Layout, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={`treetoggle__btn${mode === m ? " is-on" : ""}`}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
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
        {mode === "radial" ? (
          <RadialTree {...viewProps} />
        ) : mode === "dendro" ? (
          <Dendrogram {...viewProps} />
        ) : (
          <OutlineTree {...viewProps} />
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

interface ViewProps {
  species: Species[];
  query: string;
  selectedId: string | null;
  onSelect: (s: Species) => void;
}

function RadialTree({ species, query, selectedId, onSelect }: ViewProps) {
  const nav = useTreeNav(species);
  const { overrides, focus, setFocus, transform, svgRef, toggle } = nav;
  const q = query.trim().toLowerCase();
  const focusPhylum = phylumOf(focus);

  const { leaves, links, hulls, handles, fit, fitSig } = useMemo(() => {
    const full = collapse(buildTaxonomy(species), "", overrides);
    const rootData = focus ? findByKey(full, "", focus) ?? full : full;
    const focused = rootData !== full;
    const root = cluster<TaxNode>()
      .size([2 * Math.PI, RADIUS])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / (a.depth || 1))(hierarchy(rootData));

    const allLeaves = root.leaves();
    const allLinks = root.links();

    const handleNodes = root
      .descendants()
      .filter((n) => !!n.children && n.data.rank === "genus" && (n.data.isolates?.length ?? 0) >= COLLAPSE_MIN);

    // One hull per *expanded* phylum; none when focused into a single branch.
    const phyla = focused ? [] : (root.children ?? []).filter((p) => !!p.children);
    const hullShapes = phyla.map((p) => {
      const pts = p.leaves().map(polar);
      pts.push(polar(p));
      const color = colorFor(p.data.name);
      const hull = pts.length >= 3 ? polygonHull(pts as [number, number][]) : null;

      let path: string;
      let labelAt: [number, number];
      if (hull) {
        const [cx, cy] = polygonCentroid(hull);
        const padded = hull.map(([x, y]) => {
          const ddx = x - cx;
          const ddy = y - cy;
          const len = Math.hypot(ddx, ddy) || 1;
          return [x + (ddx / len) * HULL_PAD, y + (ddy / len) * HULL_PAD] as [number, number];
        });
        path = "M" + padded.map((p2) => p2.join(",")).join("L") + "Z";
        labelAt = padded.reduce((far, p2) => (Math.hypot(...p2) > Math.hypot(...far) ? p2 : far), padded[0]);
      } else {
        const cx = pts.reduce((s, p2) => s + p2[0], 0) / pts.length;
        const cy = pts.reduce((s, p2) => s + p2[1], 0) / pts.length;
        path = "";
        labelAt = [cx, cy < 0 ? cy - 14 : cy + 14];
      }
      return { name: p.data.name, color, path, labelAt };
    });

    let fit: ZoomTransform | null = null;
    let fitSig = "";
    if (q) {
      const pts = allLeaves
        .filter((leaf) => {
          const d = leaf.data;
          if (d.isolate) return hits(d.isolate, q);
          return (d.isolates ?? []).some((s) => hits(s, q));
        })
        .map(polar);
      if (pts.length) {
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const w = Math.max(Math.max(...xs) - Math.min(...xs), 1);
        const h = Math.max(Math.max(...ys) - Math.min(...ys), 1);
        const k = Math.max(0.8, Math.min(5, (SIZE * 0.55) / Math.max(w, h)));
        const tx = C - k * (C + cx);
        const ty = C - k * (C + cy);
        fit = zoomIdentity.translate(tx, ty).scale(k);
        fitSig = `${Math.round(k * 100)}:${Math.round(tx)}:${Math.round(ty)}`;
      }
    }

    return { leaves: allLeaves, links: allLinks, hulls: hullShapes, handles: handleNodes, fit, fitSig };
  }, [species, overrides, focus, q]);

  useFit(nav, fit, fitSig, q);

  const still = q !== "" || !!focus || transform.k !== 1 || leaves.length > 140;

  return (
    <>
      <TreeControls nav={nav} />
      <svg
        ref={svgRef}
        className="tree__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Radial taxonomic tree of logged isolates. Scroll to zoom, drag to pan."
      >
        <g transform={transform.toString()}>
          <g className={`tree__content${still ? " is-still" : ""}`} transform={`translate(${C},${C})`}>
            {hulls.map((h) => (
              <g key={h.name} className="hull">
                {h.path && (
                  <path d={h.path} fill={h.color} fillOpacity={0.1} stroke={h.color} strokeOpacity={0.28} />
                )}
                <text
                  className="hull__label"
                  x={h.labelAt[0]}
                  y={h.labelAt[1]}
                  fill={h.color}
                  textAnchor={h.labelAt[0] < 0 ? "end" : "start"}
                  onClick={() => setFocus(`p:${h.name}`)}
                >
                  {h.name}
                  <title>Focus on {h.name}</title>
                </text>
              </g>
            ))}

            <g className="tree__links" fill="none">
              {links.map((lk: HierarchyPointLink<TaxNode>, i) => {
                const [sx, sy] = polar(lk.source);
                const [tx, ty] = polar(lk.target);
                return <path key={i} className="tree__link" d={`M${sx},${sy}L${tx},${ty}`} />;
              })}
            </g>

            {links
              .map((l) => l.target)
              .filter((n) => n.data.rank === "class" && n.data.tag && n.children)
              .map((n) => {
                const [x, y] = polar(n);
                return (
                  <text
                    key={n.data.name}
                    className="tree__greek"
                    x={x}
                    y={y}
                    textAnchor="middle"
                    onClick={() => setFocus(`c:${n.parent?.data.name ?? ""}/${n.data.name}`)}
                  >
                    {n.data.tag}
                    <title>Focus on {n.data.name}</title>
                  </text>
                );
              })}

            {handles.map((n) => {
              const [x, y] = polar(n);
              return (
                <g
                  key={`h-${n.data.key}`}
                  className="treehandle"
                  transform={`translate(${x},${y})`}
                  onClick={() => toggle(n.data.key!)}
                >
                  <circle r={6.5}>
                    <title>Collapse {n.data.name}</title>
                  </circle>
                  <line x1={-3} y1={0} x2={3} y2={0} />
                </g>
              );
            })}

            {leaves.map((leaf, i) => {
              const angleDeg = (leaf.x * 180) / Math.PI - 90;
              const flip = leaf.x >= Math.PI;
              const d = leaf.data;
              const phylum = leaf.ancestors().find((a) => a.data.rank === "phylum");
              const color = phylum
                ? colorFor(phylum.data.name)
                : focusPhylum
                  ? colorFor(focusPhylum)
                  : "#5b6573";
              const floatStyle = {
                animationDelay: `${(i % 12) * -0.5}s`,
                animationDuration: `${6 + (i % 5)}s`,
              };

              if (!leaf.children && d.rank !== "isolate" && d.isolates) {
                const count = d.isolates.length;
                const r = 7 + Math.min(count, 16) * 0.95;
                const fill = d.rank === "phylum" ? colorFor(d.name) : color;
                const major = d.rank === "phylum";
                const anyHit = q !== "" && d.isolates.some((s) => hits(s, q));
                const cls = q !== "" ? (anyHit ? " is-hit" : " is-dim") : "";
                return (
                  <g key={d.key} transform={`rotate(${angleDeg}) translate(${leaf.y},0)`}>
                    <g className={`treenode${cls}`} style={floatStyle}>
                      <circle
                        className="treenode__cluster"
                        r={r}
                        fill={fill}
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
                      <g transform={`rotate(${-angleDeg})`}>
                        <text className="treenode__count" dy="0.32em" textAnchor="middle">
                          {count}
                        </text>
                      </g>
                      <text
                        className={`treenode__label treenode__label--cluster${major ? " treenode__label--major" : ""}`}
                        style={major ? { fill } : undefined}
                        transform={flip ? "rotate(180)" : undefined}
                        x={flip ? -(r + 7) : r + 7}
                        dy="0.31em"
                        textAnchor={flip ? "end" : "start"}
                        onClick={() => toggle(d.key!)}
                      >
                        {d.rank === "genus" ? (
                          <>
                            <tspan fontStyle="italic">{d.name}</tspan> spp.
                          </>
                        ) : (
                          d.name
                        )}
                      </text>
                    </g>
                  </g>
                );
              }

              const s = d.isolate!;
              const isSel = selectedId === s.id;
              const hit = hits(s, q);
              const cls = q !== "" ? (hit ? " is-hit" : " is-dim") : "";
              return (
                <g key={s.id} transform={`rotate(${angleDeg}) translate(${leaf.y},0)`}>
                  <g className={`treenode${cls}`} style={floatStyle}>
                    <circle
                      className={`treenode__dot${isSel ? " is-sel" : ""}`}
                      r={isSel ? 7 : 4.5}
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
                      transform={flip ? "rotate(180)" : undefined}
                      x={flip ? -10 : 10}
                      dy="0.31em"
                      textAnchor={flip ? "end" : "start"}
                      onClick={() => onSelect(s)}
                    >
                      {binomial(s.genus, s.species)}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </>
  );
}

function Dendrogram({ species, query, selectedId, onSelect }: ViewProps) {
  const nav = useTreeNav(species);
  const { overrides, focus, setFocus, transform, svgRef, toggle } = nav;
  const q = query.trim().toLowerCase();
  const focusPhylum = phylumOf(focus);

  const { leaves, links, internals, handles, vbW, vbH, fit, fitSig } = useMemo(() => {
    // The dendrogram uses the detailed topology: class + order for every isolate.
    const full = collapse(buildTaxonomy(species, true), "", overrides);
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

    const internalNodes = root
      .descendants()
      .filter(
        (n) =>
          !!n.children && n.depth >= 1 && ["phylum", "class", "order", "genus"].includes(n.data.rank),
      );

    const handleNodes = root
      .descendants()
      .filter((n) => !!n.children && n.data.rank === "genus" && (n.data.isolates?.length ?? 0) >= COLLAPSE_MIN);

    let fit: ZoomTransform | null = null;
    let fitSig = "";
    if (q) {
      const pts = allLeaves
        .filter((leaf) => {
          const d = leaf.data;
          if (d.isolate) return hits(d.isolate, q);
          return (d.isolates ?? []).some((s) => hits(s, q));
        })
        .map((leaf) => [dx(leaf), dy(leaf)] as [number, number]);
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

  useFit(nav, fit, fitSig, q);

  const phylumColor = (n: HierarchyNode<TaxNode>) => {
    const p = n.ancestors().find((a) => a.data.rank === "phylum");
    return p ? colorFor(p.data.name) : focusPhylum ? colorFor(focusPhylum) : "#5b6573";
  };

  return (
    <>
      <TreeControls nav={nav} />
      <svg
        ref={svgRef}
        className="tree__svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label="Dendrogram of logged isolates. Scroll to zoom, drag to pan."
      >
        <g transform={transform.toString()}>
          <g className="tree__links" fill="none">
            {links.map((lk, i) => {
              const x1 = dx(lk.source);
              const y1 = dy(lk.source);
              const x2 = dx(lk.target);
              const y2 = dy(lk.target);
              return <path key={i} className="tree__link" d={`M${x1},${y1}L${x1},${y2}L${x2},${y2}`} />;
            })}
          </g>

          {internals.map((n) => {
            const d = n.data;
            const isPhylum = d.rank === "phylum";
            const isClass = d.rank === "class";
            const isGenus = d.rank === "genus";
            const color = isPhylum ? colorFor(d.name) : phylumColor(n);
            // phylum/class focus (re-root), genus collapses, order is display-only.
            const onClickNode = isPhylum
              ? () => setFocus(`p:${d.name}`)
              : isClass
                ? () => setFocus(`c:${n.parent?.data.name ?? ""}/${d.name}`)
                : isGenus
                  ? () => toggle(d.key!)
                  : undefined;
            return (
              <g
                key={`${d.rank}-${dx(n)}-${dy(n)}`}
                className={`dendlabel${onClickNode ? "" : " dendlabel--static"}`}
                onClick={onClickNode}
              >
                <circle className="dendlabel__dot" cx={dx(n)} cy={dy(n)} r={3.2} fill={color} />
                <text
                  className={`dendlabel__text dendlabel__text--${d.rank}`}
                  x={dx(n) + 6}
                  y={dy(n) - 5}
                  fill={isPhylum ? color : undefined}
                >
                  {isClass && d.tag ? `${d.tag} ${d.name}` : d.name}
                  {onClickNode && (
                    <title>
                      {isGenus ? "Collapse " : "Focus on "}
                      {d.name}
                    </title>
                  )}
                </text>
              </g>
            );
          })}

          {handles.map((n) => (
            <g
              key={`h-${n.data.key}`}
              className="treehandle"
              transform={`translate(${dx(n)},${dy(n)})`}
              onClick={() => toggle(n.data.key!)}
            >
              <circle r={6}>
                <title>Collapse {n.data.name}</title>
              </circle>
              <line x1={-3} y1={0} x2={3} y2={0} />
            </g>
          ))}

          {leaves.map((leaf) => {
            const d = leaf.data;
            const color = phylumColor(leaf);
            const x = dx(leaf);
            const y = dy(leaf);

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
                <text className="treenode__label" x={x + 9} y={y} dy="0.31em" onClick={() => onSelect(s)}>
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
