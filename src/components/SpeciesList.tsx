import { useMemo, useState } from "react";
import type { Species, TestKey } from "../types";
import { GRAM_GROUPS, gramGroupOf, binomial } from "../lib/format";
import { CATEGORIES } from "../data/categories";
import SpeciesCard from "./SpeciesCard";

// Only the discrete tests (those with fixed options) make sense as filters.
const FILTERABLE = CATEGORIES.filter((c) => !!c.options);

type Filters = Partial<Record<TestKey, string>>;
type DatePreset = "any" | "today" | "7d" | "30d" | "custom";

const DAY = 86_400_000;

// Local YYYY-MM-DD for a date (matches what <input type="date"> uses).
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface SpeciesListProps {
  species: Species[];
  loading: boolean;
  editingId: string | null;
  onEdit: (s: Species) => void;
  onDelete: (id: string) => void;
}

export default function SpeciesList({
  species,
  loading,
  editingId,
  onEdit,
  onDelete,
}: SpeciesListProps) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("any");

  const activeKeys = Object.keys(filters) as TestKey[];
  const dateActive = !!(dateFrom || dateTo);
  const activeCount = activeKeys.length + (dateActive ? 1 : 0);

  // Click a value to set it; click the same value again to clear that test.
  const toggleFilter = (key: TestKey, value: string) =>
    setFilters((f) => {
      const next = { ...f };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });

  const applyPreset = (p: DatePreset) => {
    setDatePreset(p);
    const now = new Date();
    if (p === "any") {
      setDateFrom("");
      setDateTo("");
    } else if (p === "today") {
      setDateFrom(isoDay(now));
      setDateTo("");
    } else if (p === "7d") {
      setDateFrom(isoDay(new Date(now.getTime() - 6 * DAY)));
      setDateTo("");
    } else if (p === "30d") {
      setDateFrom(isoDay(new Date(now.getTime() - 29 * DAY)));
      setDateTo("");
    }
  };

  const clearDate = () => applyPreset("any");

  const clearFilters = () => {
    setFilters({});
    clearDate();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return species.filter((s) => {
      if (q && !binomial(s.genus, s.species).toLowerCase().includes(q)) return false;
      for (const key of Object.keys(filters) as TestKey[]) {
        const want = filters[key]!.toLowerCase();
        if ((s[key] ?? "").trim().toLowerCase() !== want) return false;
      }
      if (fromTs !== null || toTs !== null) {
        const ts = new Date(s.created_at).getTime();
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      return true;
    });
  }, [species, query, filters, dateFrom, dateTo]);

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

  const dateLabel =
    datePreset === "today"
      ? "Added today"
      : datePreset === "7d"
        ? "Added ≤ 7 days"
        : datePreset === "30d"
          ? "Added ≤ 30 days"
          : `Added ${dateFrom || "…"} – ${dateTo || "now"}`;

  let visible = 0;

  return (
    <div className="list">
      <div className="list__bar">
        <h2 className="list__title">Isolate log</h2>
        <div className="list__tools">
          <input
            className="list__search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            aria-label="Filter isolates by name"
          />
          <button
            type="button"
            className={`filterbtn${filterOpen ? " is-open" : ""}${activeCount ? " has-active" : ""}`}
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((o) => !o)}
          >
            ID filter
            {activeCount > 0 && <span className="filterbtn__badge">{activeCount}</span>}
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="filterpanel">
          <div className="filterpanel__head">
            <span className="filterpanel__title">Filter isolates</span>
            {activeCount > 0 && (
              <button type="button" className="filterpanel__clear" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>

          <div className="filterpanel__section">
            <div className="fitem__label">Date added</div>
            <div className="dpresets">
              {(
                [
                  ["any", "Any time"],
                  ["today", "Today"],
                  ["7d", "Last 7 days"],
                  ["30d", "Last 30 days"],
                ] as [DatePreset, string][]
              ).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  className={`dpreset${datePreset === p ? " is-on" : ""}`}
                  onClick={() => applyPreset(p)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="drange">
              <label className="drange__field">
                <span>From</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setDatePreset("custom");
                  }}
                />
              </label>
              <label className="drange__field">
                <span>To</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setDatePreset("custom");
                  }}
                />
              </label>
            </div>
          </div>

          <div className="filterpanel__section">
            <div className="fitem__label">ID characteristics</div>
            <div className="filterpanel__grid">
              {FILTERABLE.map((cat) => (
                <div key={cat.key} className="fitem">
                  <div className="fitem__sublabel">{cat.label}</div>
                  <div className="fitem__opts">
                    {cat.options!.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`fopt${filters[cat.key] === opt.value ? " is-on" : ""}`}
                        title={opt.title ?? opt.value}
                        onClick={() => toggleFilter(cat.key, opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <div className="activefilters">
          {dateActive && (
            <button
              type="button"
              className="activefilters__chip"
              onClick={clearDate}
              title="Remove date filter"
            >
              <span className="activefilters__v">{dateLabel}</span>
              <span className="activefilters__x">×</span>
            </button>
          )}
          {activeKeys.map((key) => {
            const cat = FILTERABLE.find((c) => c.key === key)!;
            return (
              <button
                key={key}
                type="button"
                className="activefilters__chip"
                onClick={() =>
                  setFilters((f) => {
                    const next = { ...f };
                    delete next[key];
                    return next;
                  })
                }
                title="Remove filter"
              >
                <span className="activefilters__k">{cat.short}</span>
                <span className="activefilters__v">{filters[key]}</span>
                <span className="activefilters__x">×</span>
              </button>
            );
          })}
        </div>
      )}

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
                const card = (
                  <SpeciesCard
                    key={s.id}
                    species={s}
                    index={visible}
                    isEditing={s.id === editingId}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                );
                visible += 1;
                return card;
              })}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <p className="list__status">No isolates match the current filters.</p>
      )}
    </div>
  );
}
