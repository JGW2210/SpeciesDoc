import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { binomial } from "../lib/format";
import {
  EMPTY_BOARD,
  PRESET_COLORS,
  newCat,
  newSub,
  type Board,
  type BoardCat,
  type BoardSub,
} from "../lib/board";
import type { Species } from "../types";

const BOARD_ID = "main";

interface DragData {
  isoId: string;
  from: { catId: string; subId: string } | null;
}

interface CustomViewProps {
  species: Species[];
  onEdit: (s: Species) => void;
}

export default function CustomView({ species, onEdit }: CustomViewProps) {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [query, setQuery] = useState("");
  const [overSub, setOverSub] = useState<string | null>(null);
  const loaded = useRef(false);

  const byId = useMemo(() => new Map(species.map((s) => [s.id, s])), [species]);

  // Load the saved board once.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) {
        loaded.current = true;
        return;
      }
      const { data } = await supabase.from("board").select("data").eq("id", BOARD_ID).maybeSingle();
      if (active && data?.data) setBoard(data.data as Board);
      loaded.current = true;
    })();
    return () => {
      active = false;
    };
  }, []);

  // Debounced persist on every change (after the initial load).
  useEffect(() => {
    if (!loaded.current || !supabase) return;
    const t = setTimeout(() => {
      void supabase!
        .from("board")
        .upsert({ id: BOARD_ID, data: board, updated_at: new Date().toISOString() });
    }, 600);
    return () => clearTimeout(t);
  }, [board]);

  // --- mutations -----------------------------------------------------------
  const mutateCat = (catId: string, fn: (c: BoardCat) => BoardCat) =>
    setBoard((b) => ({ categories: b.categories.map((c) => (c.id === catId ? fn(c) : c)) }));

  const mutateSub = (catId: string, subId: string, fn: (s: BoardSub) => BoardSub) =>
    mutateCat(catId, (c) => ({ ...c, subs: c.subs.map((s) => (s.id === subId ? fn(s) : s)) }));

  const addCategory = () =>
    setBoard((b) => ({ categories: [...b.categories, newCat(b.categories.length + 1)] }));

  const removeCategory = (catId: string) =>
    setBoard((b) => ({ categories: b.categories.filter((c) => c.id !== catId) }));

  const addSub = (catId: string) =>
    mutateCat(catId, (c) => ({ ...c, subs: [...c.subs, newSub(c.subs.length + 1)] }));

  const removeSub = (catId: string, subId: string) =>
    mutateCat(catId, (c) => ({ ...c, subs: c.subs.filter((s) => s.id !== subId) }));

  const addIsolate = (catId: string, subId: string, isoId: string) =>
    mutateSub(catId, subId, (s) =>
      s.isolateIds.includes(isoId) ? s : { ...s, isolateIds: [...s.isolateIds, isoId] },
    );

  const removeIsolate = (catId: string, subId: string, isoId: string) =>
    mutateSub(catId, subId, (s) => ({ ...s, isolateIds: s.isolateIds.filter((i) => i !== isoId) }));

  const handleDrop = (catId: string, subId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverSub(null);
    let payload: DragData;
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (!payload?.isoId) return;
    if (payload.from && payload.from.subId !== subId) {
      removeIsolate(payload.from.catId, payload.from.subId, payload.isoId);
    }
    addIsolate(catId, subId, payload.isoId);
  };

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? species.filter((s) => binomial(s.genus, s.species).toLowerCase().includes(q))
      : species;
    return [...list].sort((a, b) =>
      binomial(a.genus, a.species).localeCompare(binomial(b.genus, b.species)),
    );
  }, [species, query]);

  return (
    <div className="cboard">
      <div className="cboard__bar">
        <div>
          <h2 className="cboard__title">Custom board</h2>
          <p className="cboard__sub">Build your own categories and drag isolates in from the palette.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={addCategory}>
          + Add category
        </button>
      </div>

      {/* palette of all isolates to drag from */}
      <div className="cpool">
        <div className="cpool__head">
          <span className="cpool__label">All isolates</span>
          <input
            className="list__search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter isolates"
          />
        </div>
        <div className="cpool__wrap">
          {pool.length === 0 ? (
            <span className="cboard__empty">No isolates.</span>
          ) : (
            pool.map((s) => <Chip key={s.id} s={s} from={null} />)
          )}
        </div>
      </div>

      {board.categories.length === 0 ? (
        <div className="empty">
          <p className="empty__head">No categories yet.</p>
          <p className="empty__sub">Add a category, then drag isolates from the palette into its subcategories.</p>
        </div>
      ) : (
        <div className="cboard__cats">
          {board.categories.map((cat) => {
            const total = cat.subs.reduce((n, s) => n + s.isolateIds.length, 0);
            return (
              <section
                key={cat.id}
                className="ccat"
                style={{ ["--cat" as string]: cat.color }}
              >
                <header className="ccat__head">
                  <button
                    type="button"
                    className={`chev${cat.collapsed ? "" : " is-open"}`}
                    aria-label={cat.collapsed ? "Expand" : "Collapse"}
                    onClick={() => mutateCat(cat.id, (c) => ({ ...c, collapsed: !c.collapsed }))}
                  >
                    ▸
                  </button>
                  <ColorDot color={cat.color} onPick={(c) => mutateCat(cat.id, (x) => ({ ...x, color: c }))} />
                  <input
                    className="ccat__name"
                    value={cat.name}
                    onChange={(e) => mutateCat(cat.id, (c) => ({ ...c, name: e.target.value }))}
                    aria-label="Category name"
                  />
                  <span className="ccat__count">{total}</span>
                  <button type="button" className="ccat__act" onClick={() => addSub(cat.id)}>
                    + Subcategory
                  </button>
                  <button
                    type="button"
                    className="ccat__del"
                    title="Delete category"
                    onClick={() => removeCategory(cat.id)}
                  >
                    ×
                  </button>
                </header>

                {!cat.collapsed && (
                  <div className="ccat__subs">
                    {cat.subs.map((sub) => {
                      const subColor = sub.color ?? cat.color;
                      return (
                        <div key={sub.id} className="csub" style={{ ["--sub" as string]: subColor }}>
                          <header className="csub__head">
                            <button
                              type="button"
                              className={`chev${sub.collapsed ? "" : " is-open"}`}
                              aria-label={sub.collapsed ? "Expand" : "Collapse"}
                              onClick={() =>
                                mutateSub(cat.id, sub.id, (s) => ({ ...s, collapsed: !s.collapsed }))
                              }
                            >
                              ▸
                            </button>
                            <ColorDot
                              color={subColor}
                              onPick={(c) => mutateSub(cat.id, sub.id, (s) => ({ ...s, color: c }))}
                            />
                            <input
                              className="csub__name"
                              value={sub.name}
                              onChange={(e) =>
                                mutateSub(cat.id, sub.id, (s) => ({ ...s, name: e.target.value }))
                              }
                              aria-label="Subcategory name"
                            />
                            <span className="csub__count">{sub.isolateIds.length}</span>
                            <button
                              type="button"
                              className="ccat__del"
                              title="Delete subcategory"
                              onClick={() => removeSub(cat.id, sub.id)}
                            >
                              ×
                            </button>
                          </header>

                          {!sub.collapsed && (
                            <div
                              className={`csub__drop${overSub === sub.id ? " is-over" : ""}`}
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (overSub !== sub.id) setOverSub(sub.id);
                              }}
                              onDragLeave={() => setOverSub((cur) => (cur === sub.id ? null : cur))}
                              onDrop={handleDrop(cat.id, sub.id)}
                            >
                              {sub.isolateIds.length === 0 && (
                                <span className="cboard__empty">Drag isolates here</span>
                              )}
                              {sub.isolateIds.map((id) => {
                                const s = byId.get(id);
                                if (!s) return null;
                                return (
                                  <Chip
                                    key={id}
                                    s={s}
                                    from={{ catId: cat.id, subId: sub.id }}
                                    onOpen={() => onEdit(s)}
                                    onRemove={() => removeIsolate(cat.id, sub.id, id)}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ChipProps {
  s: Species;
  from: DragData["from"];
  onRemove?: () => void;
  onOpen?: () => void;
}

function Chip({ s, from, onRemove, onOpen }: ChipProps) {
  return (
    <span
      className="cchip"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ isoId: s.id, from }));
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <em className="cchip__name" onClick={onOpen} title={onOpen ? "Edit isolate" : undefined}>
        {binomial(s.genus, s.species)}
      </em>
      {onRemove && (
        <button type="button" className="cchip__x" title="Remove" onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

function ColorDot({ color, onPick }: { color: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="cdot">
      <button
        type="button"
        className="cdot__btn"
        style={{ background: color }}
        title="Colour"
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <span className="cdot__pop" onMouseLeave={() => setOpen(false)}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="cdot__swatch"
              style={{ background: c }}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}
