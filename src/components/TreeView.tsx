import { useMemo, useState } from "react";
import {
  hierarchy,
  cluster,
  type HierarchyPointNode,
  type HierarchyPointLink,
} from "d3-hierarchy";
import { polygonHull, polygonCentroid } from "d3-polygon";
import { buildTaxonomy, modernPhylum, resolveClass, type TaxNode } from "../lib/taxonomy";
import { binomial } from "../lib/format";
import { CATEGORIES } from "../data/categories";
import type { Species } from "../types";

const SIZE = 1000;
const C = SIZE / 2;
const RADIUS = 332; // radius of the leaf ring
const HULL_PAD = 30;
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

// Polar (angle from d3 cluster, radius) → cartesian, centre at origin.
function pos(node: HierarchyPointNode<TaxNode>): [number, number] {
  const a = node.x - Math.PI / 2;
  return [node.y * Math.cos(a), node.y * Math.sin(a)];
}

function gatherIsolates(node: TaxNode): Species[] {
  if (node.isolate) return [node.isolate];
  const out: Species[] = [];
  for (const c of node.children ?? []) out.push(...gatherIsolates(c));
  return out;
}

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

interface TreeViewProps {
  species: Species[];
  enriching: boolean;
  onRefreshLineage: () => void;
  onEdit: (s: Species) => void;
}

export default function TreeView({ species, enriching, onRefreshLineage, onEdit }: TreeViewProps) {
  const [selected, setSelected] = useState<Species | null>(null);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const { leaves, links, hulls, handles } = useMemo(() => {
    const data = collapse(buildTaxonomy(species), "", overrides);
    const root = cluster<TaxNode>()
      .size([2 * Math.PI, RADIUS])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / (a.depth || 1))(hierarchy(data));

    const allLeaves = root.leaves();
    const allLinks = root.links();

    // Collapse handle only on expanded genera (phyla/classes collapse via their
    // hull label / greek tag instead, to avoid overlapping controls near centre).
    const handleNodes = root
      .descendants()
      .filter((n) => !!n.children && n.data.rank === "genus" && (n.data.isolates?.length ?? 0) >= COLLAPSE_MIN);

    // One hull per *expanded* phylum (skip collapsed phyla, which are single nodes).
    const phyla = (root.children ?? []).filter((p) => !!p.children);
    const hullShapes = phyla.map((p) => {
      const pts = p.leaves().map(pos);
      pts.push(pos(p));
      const color = colorFor(p.data.name);
      const hull = pts.length >= 3 ? polygonHull(pts as [number, number][]) : null;

      let path: string;
      let labelAt: [number, number];
      if (hull) {
        const [cx, cy] = polygonCentroid(hull);
        const padded = hull.map(([x, y]) => {
          const dx = x - cx;
          const dy = y - cy;
          const len = Math.hypot(dx, dy) || 1;
          return [x + (dx / len) * HULL_PAD, y + (dy / len) * HULL_PAD] as [number, number];
        });
        path = "M" + padded.map((q) => q.join(",")).join("L") + "Z";
        labelAt = padded.reduce((far, q) => (Math.hypot(...q) > Math.hypot(...far) ? q : far), padded[0]);
      } else {
        // Too few points for a hull — don't draw a stray circle, just label it.
        const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
        const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
        path = "";
        labelAt = [cx, cy < 0 ? cy - 14 : cy + 14];
      }
      return { name: p.data.name, color, path, labelAt };
    });

    return { leaves: allLeaves, links: allLinks, hulls: hullShapes, handles: handleNodes };
  }, [species, overrides]);

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
          {overrides.size > 0 && (
            <button type="button" className="btn btn--ghost" onClick={() => setOverrides(new Set())}>
              Reset layout
            </button>
          )}
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

      <div className="tree__stage">
        <svg
          className="tree__svg"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label="Taxonomic tree of logged isolates"
        >
          <g transform={`translate(${C},${C})`}>
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
                  onClick={() => toggle(`p:${h.name}`)}
                >
                  {h.name}
                  <title>Collapse {h.name}</title>
                </text>
              </g>
            ))}

            <g className="tree__links" fill="none">
              {links.map((lk: HierarchyPointLink<TaxNode>, i) => {
                const [sx, sy] = pos(lk.source);
                const [tx, ty] = pos(lk.target);
                return <path key={i} className="tree__link" d={`M${sx},${sy}L${tx},${ty}`} />;
              })}
            </g>

            {links
              .map((l) => l.target)
              .filter((n) => n.data.rank === "class" && n.data.tag && n.children)
              .map((n) => {
                const [x, y] = pos(n);
                return (
                  <text
                    key={n.data.name}
                    className="tree__greek"
                    x={x}
                    y={y}
                    textAnchor="middle"
                    onClick={() => toggle(`c:${n.parent?.data.name ?? ""}/${n.data.name}`)}
                  >
                    {n.data.tag}
                    <title>Collapse {n.data.name}</title>
                  </text>
                );
              })}

            {/* collapse handles on expanded, collapsible nodes */}
            {handles.map((n) => {
              const [x, y] = pos(n);
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

            {/* tips: isolates and collapsed nodes */}
            {leaves.map((leaf, i) => {
              const angleDeg = (leaf.x * 180) / Math.PI - 90;
              const flip = leaf.x >= Math.PI;
              const d = leaf.data;
              const phylum = leaf.ancestors().find((a) => a.data.rank === "phylum");
              const color = phylum ? colorFor(phylum.data.name) : "#5b6573";
              const floatStyle = {
                animationDelay: `${(i % 12) * -0.5}s`,
                animationDuration: `${6 + (i % 5)}s`,
              };

              // Collapsed node (genus / class / phylum) — a counted blob.
              if (!leaf.children && d.rank !== "isolate" && d.isolates) {
                const count = d.isolates.length;
                const r = 7 + Math.min(count, 16) * 0.95;
                const fill = d.rank === "phylum" ? colorFor(d.name) : color;
                // Major sections keep the large, coloured hull-style title.
                const major = d.rank === "phylum";
                return (
                  <g key={d.key} transform={`rotate(${angleDeg}) translate(${leaf.y},0)`}>
                    <g className="treenode" style={floatStyle}>
                      <circle
                        className="treenode__cluster"
                        r={r}
                        fill={fill}
                        onClick={() => toggle(d.key!)}
                      >
                        <title>{`${d.name} — ${count} isolate${count === 1 ? "" : "s"} (click to expand)`}</title>
                      </circle>
                      {/* counter-rotate so the count always reads upright */}
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

              // Individual isolate tip.
              const s = d.isolate!;
              const isSel = selected?.id === s.id;
              return (
                <g key={s.id} transform={`rotate(${angleDeg}) translate(${leaf.y},0)`}>
                  <g className="treenode" style={floatStyle}>
                    <circle
                      className={`treenode__dot${isSel ? " is-sel" : ""}`}
                      r={isSel ? 7 : 4.5}
                      fill={color}
                      onClick={() => setSelected(s)}
                    />
                    <text
                      className="treenode__label"
                      transform={flip ? "rotate(180)" : undefined}
                      x={flip ? -10 : 10}
                      dy="0.31em"
                      textAnchor={flip ? "end" : "start"}
                      onClick={() => setSelected(s)}
                    >
                      {binomial(s.genus, s.species)}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>

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

function Lineagecrumb({ species }: { species: Species }) {
  const lin = species.lineage;
  if (!lin || lin.matchType === "NONE") {
    return <p className="treedetail__crumb treedetail__crumb--none">No GBIF lineage — grouped by Gram.</p>;
  }
  const parts = [
    modernPhylum(lin.phylum),
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
