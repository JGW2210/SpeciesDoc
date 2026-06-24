import { useMemo, useState } from "react";
import type { Species } from "../types";
import { GRAM_GROUPS, gramGroupOf, binomial } from "../lib/format";
import SpeciesCard from "./SpeciesCard";

interface SpeciesListProps {
  species: Species[];
  loading: boolean;
  onDelete: (id: string) => void;
}

export default function SpeciesList({ species, loading, onDelete }: SpeciesListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return species;
    return species.filter((s) => binomial(s.genus, s.species).toLowerCase().includes(q));
  }, [species, query]);

  const grouped = useMemo(() => {
    return GRAM_GROUPS.map((group) => ({
      group,
      items: filtered.filter((s) => gramGroupOf(s) === group.id),
    }));
  }, [filtered]);

  if (loading) {
    return <p className="list__status">Loading the bench log…</p>;
  }

  if (species.length === 0) {
    return (
      <div className="empty">
        <p className="empty__head">No isolates logged yet.</p>
        <p className="empty__sub">Streak a plate, run your panel, and record the first one on the left.</p>
      </div>
    );
  }

  let visible = 0;

  return (
    <div className="list">
      <div className="list__bar">
        <h2 className="list__title">Isolate log</h2>
        <input
          className="list__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          aria-label="Filter isolates by name"
        />
      </div>

      {grouped.map(({ group, items }) => {
        if (items.length === 0) return null;
        return (
          <section key={group.id} className={`band band--${group.id}`}>
            <div className="band__head">
              <h3 className="band__title">{group.title}</h3>
              <span className="band__blurb">{group.blurb}</span>
              <span className="band__count">{items.length}</span>
            </div>
            <div className="band__grid">
              {items.map((s) => {
                const card = <SpeciesCard key={s.id} species={s} index={visible} onDelete={onDelete} />;
                visible += 1;
                return card;
              })}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <p className="list__status">No isolates match “{query}”.</p>
      )}
    </div>
  );
}
