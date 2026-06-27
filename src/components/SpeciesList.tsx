import { useMemo, useState } from "react";
import { tv, type Species, type TestKey } from "../types";
import type { Category } from "../data/categories";
import { binomial } from "../lib/format";
import { useDomain } from "../domains";
import SpeciesCard from "./SpeciesCard";

type Filters = Partial<Record<TestKey, string>>;
type DatePreset = "any" | "today" | "7d" | "30d" | "custom";

const DAY = 86_400_000;

// Sentinel filter value: any entered value that isn't one of the defaults.
const OTHER = "__other__";

interface FilterOpt {
  value: string;
  label: string;
  title?: string;
  group?: string;
}

// Filter chips for a category: its fixed options, or — for free-text fields with
// quick-pick suggestions — each suggestion plus an "Other" bucket.
function filterOptionsFor(cat: Category): FilterOpt[] {
  if (cat.options) return cat.options;
  if (cat.suggestions) {
    return [
      ...cat.suggestions.map((s) => ({ value: s, label: s })),
      { value: OTHER, label: "Other", title: "Any other entered value" },
    ];
  }
  return [];
}

// The set of "default" values that count as recognised (so anything else is Other).
function defaultsFor(cat: Category): string[] {
  if (cat.options) return cat.options.map((o) => o.value);
  return cat.suggestions ?? [];
}

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
  const { categories, bands, bandOf } = useDomain();
  // Filterable: fixed-option tests, plus free-text tests that carry suggestions.
  const FILTERABLE = useMemo(
    () => categories.filter((c) => !!c.options || !!c.suggestions),
    [categories],
  );
  const catByKey = useMemo(() => {
    const m: Record<string, Category> = {};
    for (const c of categories) m[c.key] = c;
    return m;
  }, [categories]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("any");
  const [collapsed, setCollapsed] = useState(false);
  const [sort, setSort] = useState<"added" | "az">("added");

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
    return species.filter((s: Species) => {
      if (q && !binomial(s.genus, s.species).toLowerCase().includes(q)) return false;
      for (const key of Object.keys(filters) as TestKey[]) {
        const want = filters[key]!;
        const val = tv(s, key).trim();
        if (want === OTHER) {
          // "Other" = a non-empty value that isn't one of the recognised defaults.
          const cat = catByKey[key];
          const defaults = cat ? defaultsFor(cat) : [];
          if (val === "" || defaults.some((d) => d.toLowerCase() === val.toLowerCase())) return false;
        } else if (val.toLowerCase() !== want.toLowerCase()) {
          return false;
        }
      }
      if (fromTs !== null || toTs !== null) {
        const ts = new Date(s.created_at).getTime();
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      return true;
    });
  }, [species, query, filters, dateFrom, dateTo, catByKey]);

  const grouped = useMemo(() => {
    const arranged =
      sort === "az"
        ? [...filtered].sort((a, b) =>
            binomial(a.genus, a.species).localeCompare(binomial(b.genus, b.species)),
          )
        : filtered; // "added" keeps the created_at-desc order from the source
    return bands.map((group) => ({
      group,
      items: arranged.filter((s) => bandOf(s) === group.id),
    }));
  }, [filtered, sort, bands, bandOf]);

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
          <button
            type="button"
            className={`filterbtn${collapsed ? " has-active" : ""}`}
            aria-pressed={collapsed}
            title={collapsed ? "Show test details" : "Collapse to names only"}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "Expand all" : "Collapse all"}
          </button>
          <button
            type="button"
            className={`filterbtn${sort === "az" ? " has-active" : ""}`}
            aria-pressed={sort === "az"}
            title={sort === "az" ? "Sorted A–Z — switch to newest first" : "Sort A–Z"}
            onClick={() => setSort((s) => (s === "az" ? "added" : "az"))}
          >
            {sort === "az" ? "Sort: A–Z" : "Sort: Newest"}
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
              {FILTERABLE.map((cat) => {
                const opts = filterOptionsFor(cat);
                const wide = opts.length > 4;
                return (
                  <div key={cat.key} className={`fitem${wide ? " fitem--wide" : ""}`}>
                    <div className="fitem__sublabel">{cat.label}</div>
                    <div className="fitem__opts">
                      {opts.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`fopt${filters[cat.key] === opt.value ? " is-on" : ""}${opt.value === OTHER ? " fopt--other" : ""}`}
                          title={
                            opt.group ? `${opt.group} — ${opt.title ?? opt.value}` : opt.title ?? opt.value
                          }
                          onClick={() => toggleFilter(cat.key, opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
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
                <span className="activefilters__v">{filters[key] === OTHER ? "Other" : filters[key]}</span>
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
                    collapsed={collapsed}
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
