import { useMemo, useState } from "react";
import { buildTaxonomy, gatherIsolates, type TaxNode } from "../lib/taxonomy";
import { binomial } from "../lib/format";
import type { Species } from "../types";

interface OutlineTreeProps {
  species: Species[];
  query: string;
  selectedId: string | null;
  onSelect: (s: Species) => void;
}

// Does this subtree contain anything matching the (lowercased) query? Matches on
// an isolate's binomial, or on any group name (so searching a genus/phylum works).
function subtreeMatches(node: TaxNode, q: string): boolean {
  if (node.rank === "isolate") {
    return binomial(node.isolate!.genus, node.isolate!.species).toLowerCase().includes(q);
  }
  if (node.name.toLowerCase().includes(q)) return true;
  return (node.children ?? []).some((c) => subtreeMatches(c, q));
}

// A legible, indented, keyboard-navigable alternative to the radial tree:
// phylum → class → genus → isolate, each branch collapsible. Searching filters to
// matching branches and auto-expands them.
export default function OutlineTree({ species, query, selectedId, onSelect }: OutlineTreeProps) {
  const root = useMemo(() => buildTaxonomy(species), [species]);
  const q = query.trim().toLowerCase();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const phyla = root.children ?? [];
  const anyVisible = !q || phyla.some((p) => subtreeMatches(p, q));

  return (
    <div className="outline" role="tree" aria-label="Taxonomic outline of logged isolates">
      {phyla.map((n) => (
        <OutlineRow
          key={n.name}
          node={n}
          path={n.name}
          depth={0}
          q={q}
          expanded={expanded}
          toggle={toggle}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
      {!anyVisible && <p className="outline__none">No isolates match “{query}”.</p>}
    </div>
  );
}

interface OutlineRowProps {
  node: TaxNode;
  path: string;
  depth: number;
  q: string;
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedId: string | null;
  onSelect: (s: Species) => void;
}

function OutlineRow({ node, path, depth, q, expanded, toggle, selectedId, onSelect }: OutlineRowProps) {
  if (q && !subtreeMatches(node, q)) return null;
  const pad = depth * 16 + 12;

  // Isolate leaf.
  if (node.rank === "isolate") {
    const s = node.isolate!;
    return (
      <button
        type="button"
        role="treeitem"
        className={`outline__leaf${selectedId === s.id ? " is-sel" : ""}`}
        style={{ paddingLeft: pad }}
        onClick={() => onSelect(s)}
      >
        <span className="outline__bullet" aria-hidden="true" />
        <em>{binomial(s.genus, s.species)}</em>
      </button>
    );
  }

  // Group node (phylum / class / genus). When searching, force-open so matches show.
  const kids = node.children ?? [];
  const count = gatherIsolates(node).length;
  const open = q !== "" || expanded.has(path);
  const label =
    node.rank === "genus" ? (
      <>
        <em>{node.name}</em> <span className="outline__rank">spp.</span>
      </>
    ) : (
      node.name
    );

  return (
    <div className="outline__group" role="treeitem" aria-expanded={open}>
      <button
        type="button"
        className={`outline__toggle outline__toggle--${node.rank}`}
        style={{ paddingLeft: pad }}
        aria-expanded={open}
        onClick={() => toggle(path)}
        disabled={q !== ""}
      >
        <span className={`outline__chev${open ? " is-open" : ""}`} aria-hidden="true">
          ▸
        </span>
        {node.tag && <span className="outline__tag">{node.tag}</span>}
        <span className="outline__name">{label}</span>
        <span className="outline__count">{count}</span>
      </button>
      {open && (
        <div role="group">
          {kids.map((c) => (
            <OutlineRow
              key={c.rank === "isolate" ? c.isolate!.id : c.name}
              node={c}
              path={`${path}/${c.rank === "isolate" ? c.isolate!.id : c.name}`}
              depth={depth + 1}
              q={q}
              expanded={expanded}
              toggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
