import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { binomial } from "../lib/format";
import { useDomain } from "../domains";
import Readout from "./Readout";
import {
  EMPTY_BOARD,
  PRESET_COLORS,
  newCat,
  newSub,
  normalizeBoard,
  type Board,
  type BoardCat,
  type BoardSub,
} from "../lib/board";
import type { Species } from "../types";

// subId null = held directly on the category (no subcategory).
interface DragData {
  isoId: string;
  from: { catId: string; subId: string | null } | null;
}

interface CustomViewProps {
  // The full set, used to resolve the ids held in a saved arrangement so chips
  // always render regardless of the contributor filter.
  species: Species[];
  // The contributor-filtered set shown in the draggable palette.
  poolSpecies: Species[];
  // Whose board to display (from the contributor dropdown). Null = no board
  // (signed-out guest). Editing is allowed only when this is the signed-in user.
  viewOwner: string | null;
  // Public label of the displayed board's owner, for the read-only notice.
  ownerLabel: string | null;
  onEdit: (s: Species) => void;
}

export default function CustomView({
  species,
  poolSpecies,
  viewOwner,
  ownerLabel,
  onEdit,
}: CustomViewProps) {
  const { boardId } = useDomain();
  const { user } = useAuth();
  // You can only edit your own board; everyone else's is read-only.
  const readOnly = !user || viewOwner == null || viewOwner !== user.id;
  // A ref keeps read-only status available to the unmount flush without
  // re-binding that effect.
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [query, setQuery] = useState("");
  const [overSub, setOverSub] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // What's being dragged for reordering (null during isolate-chip drags).
  const [drag, setDrag] = useState<
    { kind: "cat"; catId: string } | { kind: "sub"; catId: string; subId: string } | null
  >(null);
  const [catDrop, setCatDrop] = useState<string | null>(null);
  const [subDrop, setSubDrop] = useState<string | null>(null);
  const endReorder = () => {
    setDrag(null);
    setCatDrop(null);
    setSubDrop(null);
  };
  const loaded = useRef(false);
  // Always-current snapshot so the unmount flush saves the latest state.
  const boardRef = useRef(board);
  boardRef.current = board;

  const byId = useMemo(() => new Map(species.map((s) => [s.id, s])), [species]);

  const writeBoard = async (b: Board): Promise<boolean> => {
    // Only the signed-in owner of the displayed board may save it.
    if (!supabase || readOnlyRef.current || !user) return false;
    const { error } = await supabase
      .from("board")
      .upsert(
        { id: boardId, owner: user.id, data: b, updated_at: new Date().toISOString() },
        { onConflict: "owner,id" },
      );
    return !error;
  };

  // Load the displayed contributor's saved board. Re-runs when the selected
  // owner (or section) changes. Reads are public, so other users' boards load
  // too — they just render read-only.
  useEffect(() => {
    let active = true;
    loaded.current = false;
    setBoard(EMPTY_BOARD);
    setSaveState("idle");
    (async () => {
      if (!supabase || !viewOwner) {
        loaded.current = true;
        return;
      }
      const { data } = await supabase
        .from("board")
        .select("data")
        .eq("id", boardId)
        .eq("owner", viewOwner)
        .maybeSingle();
      if (active && data?.data) setBoard(normalizeBoard(data.data as Board));
      loaded.current = true;
    })();
    return () => {
      active = false;
    };
  }, [boardId, viewOwner]);

  // Debounced persist on every change (after the initial load). Only the owner
  // of the board persists; read-only viewers never write.
  useEffect(() => {
    if (!loaded.current || !supabase || readOnly) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      const ok = await writeBoard(board);
      setSaveState(ok ? "saved" : "error");
    }, 500);
    return () => clearTimeout(t);
  }, [board, readOnly]);

  // Flush the latest state when leaving the view, so a pending debounce isn't
  // lost on unmount (the previous cause of changes not persisting).
  useEffect(() => {
    return () => {
      if (loaded.current && supabase && !readOnlyRef.current) void writeBoard(boardRef.current);
    };
  }, []);

  // --- mutations -----------------------------------------------------------
  const mutateCat = (catId: string, fn: (c: BoardCat) => BoardCat) =>
    setBoard((b) => ({ categories: b.categories.map((c) => (c.id === catId ? fn(c) : c)) }));

  const mutateSub = (catId: string, subId: string, fn: (s: BoardSub) => BoardSub) =>
    mutateCat(catId, (c) => ({ ...c, subs: c.subs.map((s) => (s.id === subId ? fn(s) : s)) }));

  const addCategory = () =>
    setBoard((b) => ({ categories: [...b.categories, newCat(b.categories.length + 1)] }));

  const removeCategory = (catId: string) => {
    const cat = board.categories.find((c) => c.id === catId);
    const n = cat ? cat.isolateIds.length + cat.subs.reduce((a, s) => a + s.isolateIds.length, 0) : 0;
    const ok = window.confirm(
      `Delete the category “${cat?.name ?? ""}”${
        n > 0 ? ` and its arrangement of ${n} isolate${n === 1 ? "" : "s"}` : ""
      }? This can’t be undone.`,
    );
    if (!ok) return;
    setBoard((b) => ({ categories: b.categories.filter((c) => c.id !== catId) }));
  };

  const addSub = (catId: string) =>
    mutateCat(catId, (c) => ({ ...c, subs: [...c.subs, newSub(c.subs.length + 1)] }));

  const removeSub = (catId: string, subId: string) =>
    mutateCat(catId, (c) => ({ ...c, subs: c.subs.filter((s) => s.id !== subId) }));

  // Reorder helpers: insert the dragged item before the drop target.
  const moveCategory = (dragId: string, targetId: string) =>
    setBoard((b) => {
      if (dragId === targetId) return b;
      const cats = [...b.categories];
      const from = cats.findIndex((c) => c.id === dragId);
      if (from < 0) return b;
      const [m] = cats.splice(from, 1);
      const to = cats.findIndex((c) => c.id === targetId);
      cats.splice(to < 0 ? cats.length : to, 0, m);
      return { categories: cats };
    });

  const moveSub = (catId: string, dragSubId: string, targetSubId: string) =>
    mutateCat(catId, (c) => {
      if (dragSubId === targetSubId) return c;
      const subs = [...c.subs];
      const from = subs.findIndex((s) => s.id === dragSubId);
      if (from < 0) return c;
      const [m] = subs.splice(from, 1);
      const to = subs.findIndex((s) => s.id === targetSubId);
      subs.splice(to < 0 ? subs.length : to, 0, m);
      return { ...c, subs };
    });

  // subId null targets the category's own isolate list.
  const addIsolate = (catId: string, subId: string | null, isoId: string) => {
    const add = (ids: string[]) => (ids.includes(isoId) ? ids : [...ids, isoId]);
    if (subId === null) mutateCat(catId, (c) => ({ ...c, isolateIds: add(c.isolateIds) }));
    else mutateSub(catId, subId, (s) => ({ ...s, isolateIds: add(s.isolateIds) }));
  };

  const removeIsolate = (catId: string, subId: string | null, isoId: string) => {
    const rm = (ids: string[]) => ids.filter((i) => i !== isoId);
    if (subId === null) mutateCat(catId, (c) => ({ ...c, isolateIds: rm(c.isolateIds) }));
    else mutateSub(catId, subId, (s) => ({ ...s, isolateIds: rm(s.isolateIds) }));
  };

  const sameTarget = (a: { catId: string; subId: string | null }, catId: string, subId: string | null) =>
    a.catId === catId && a.subId === subId;

  const handleDrop = (catId: string, subId: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverSub(null);
    let payload: DragData;
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (!payload?.isoId) return;
    if (payload.from && !sameTarget(payload.from, catId, subId)) {
      removeIsolate(payload.from.catId, payload.from.subId, payload.isoId);
    }
    addIsolate(catId, subId, payload.isoId);
  };

  // A drop zone shared by category-level and subcategory-level isolate lists.
  const dropKey = (catId: string, subId: string | null) => subId ?? `cat:${catId}`;
  const renderDrop = (catId: string, subId: string | null, ids: string[], color: string) => {
    const key = dropKey(catId, subId);
    return (
      <div
        className={`csub__drop${overSub === key ? " is-over" : ""}`}
        style={{ ["--sub" as string]: color }}
        onDragOver={
          readOnly
            ? undefined
            : (e) => {
                if (drag) return; // a category/subcategory reorder is in progress
                e.preventDefault();
                if (overSub !== key) setOverSub(key);
              }
        }
        onDragLeave={readOnly ? undefined : () => setOverSub((cur) => (cur === key ? null : cur))}
        onDrop={readOnly ? undefined : handleDrop(catId, subId)}
      >
        {ids.length === 0 && (
          <span className="cboard__empty">{readOnly ? "Empty" : "Drag isolates here"}</span>
        )}
        {ids.map((id) => {
          const s = byId.get(id);
          if (!s) return null;
          return (
            <Chip
              key={id}
              s={s}
              from={{ catId, subId }}
              expandable
              draggable={!readOnly}
              defaultOpen={allOpen}
              onOpen={() => onEdit(s)}
              onRemove={readOnly ? undefined : () => removeIsolate(catId, subId, id)}
            />
          );
        })}
      </div>
    );
  };

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? poolSpecies.filter((s) => binomial(s.genus, s.species).toLowerCase().includes(q))
      : poolSpecies;
    return [...list].sort((a, b) =>
      binomial(a.genus, a.species).localeCompare(binomial(b.genus, b.species)),
    );
  }, [poolSpecies, query]);

  return (
    <div className="cboard">
      <div className="cboard__bar">
        <div>
          <h2 className="cboard__title">Custom board</h2>
          <p className="cboard__sub">
            {readOnly && viewOwner
              ? `Viewing ${ownerLabel ?? "another contributor"}’s board — read-only.`
              : user
                ? "Build your own categories and drag isolates in from the palette."
                : "Sign in to build and save your own board — guest changes won’t be kept."}
          </p>
        </div>
        <div className="cboard__baracts">
          {saveState !== "idle" && (
            <span className={`cboard__save cboard__save--${saveState}`}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Couldn’t save"}
            </span>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setAllOpen((o) => !o)}
            title={allOpen ? "Collapse all isolate details" : "Expand all isolate details"}
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
          {!readOnly && (
            <button type="button" className="btn btn--primary" onClick={addCategory}>
              + Add category
            </button>
          )}
        </div>
      </div>

      {/* palette of all isolates to drag from (hidden when viewing read-only) */}
      {!readOnly && (
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
      )}

      {board.categories.length === 0 ? (
        <div className="empty">
          <p className="empty__head">{readOnly ? "This board is empty." : "No categories yet."}</p>
          {!readOnly && (
            <p className="empty__sub">
              Add a category, then drag isolates from the palette into its subcategories.
            </p>
          )}
        </div>
      ) : (
        <div className="cboard__cats">
          {board.categories.map((cat) => {
            const total =
              cat.isolateIds.length + cat.subs.reduce((n, s) => n + s.isolateIds.length, 0);
            // Show the category's own drop zone when it has no subs, or when it
            // already holds isolates directly.
            const showDirect = cat.subs.length === 0 || cat.isolateIds.length > 0;
            return (
              <section
                key={cat.id}
                className="ccat"
                style={{ ["--cat" as string]: cat.color }}
              >
                <header
                  className={`ccat__head${catDrop === cat.id ? " is-drop" : ""}`}
                  onDragOver={(e) => {
                    if (drag?.kind === "cat" && drag.catId !== cat.id) {
                      e.preventDefault();
                      if (catDrop !== cat.id) setCatDrop(cat.id);
                    }
                  }}
                  onDragLeave={() => setCatDrop((cur) => (cur === cat.id ? null : cur))}
                  onDrop={(e) => {
                    if (drag?.kind === "cat") {
                      e.preventDefault();
                      e.stopPropagation();
                      moveCategory(drag.catId, cat.id);
                    }
                    endReorder();
                  }}
                >
                  {!readOnly && (
                    <span
                      className="grip"
                      draggable
                      title="Drag to reorder"
                      onDragStart={(e) => {
                        setDrag({ kind: "cat", catId: cat.id });
                        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "cat" }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={endReorder}
                    >
                      ⠿
                    </span>
                  )}
                  <button
                    type="button"
                    className={`chev${cat.collapsed ? "" : " is-open"}`}
                    aria-label={cat.collapsed ? "Expand" : "Collapse"}
                    onClick={() => mutateCat(cat.id, (c) => ({ ...c, collapsed: !c.collapsed }))}
                  >
                    ▸
                  </button>
                  <ColorDot
                    color={cat.color}
                    readOnly={readOnly}
                    onPick={(c) => mutateCat(cat.id, (x) => ({ ...x, color: c }))}
                  />
                  <input
                    className="ccat__name"
                    value={cat.name}
                    readOnly={readOnly}
                    onChange={(e) => mutateCat(cat.id, (c) => ({ ...c, name: e.target.value }))}
                    aria-label="Category name"
                  />
                  <span className="ccat__count">{total}</span>
                  {!readOnly && (
                    <>
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
                    </>
                  )}
                </header>

                {!cat.collapsed && (
                  <div className="ccat__body">
                    {showDirect && (
                      <div className="ccat__direct">
                        {renderDrop(cat.id, null, cat.isolateIds, cat.color)}
                      </div>
                    )}
                    {cat.subs.length > 0 && (
                      <div className="ccat__subs">
                        {cat.subs.map((sub) => {
                          const subColor = sub.color ?? cat.color;
                          return (
                            <div key={sub.id} className="csub" style={{ ["--sub" as string]: subColor }}>
                              <header
                                className={`csub__head${subDrop === sub.id ? " is-drop" : ""}`}
                                onDragOver={(e) => {
                                  if (drag?.kind === "sub" && drag.catId === cat.id && drag.subId !== sub.id) {
                                    e.preventDefault();
                                    if (subDrop !== sub.id) setSubDrop(sub.id);
                                  }
                                }}
                                onDragLeave={() => setSubDrop((cur) => (cur === sub.id ? null : cur))}
                                onDrop={(e) => {
                                  if (drag?.kind === "sub" && drag.catId === cat.id) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    moveSub(cat.id, drag.subId, sub.id);
                                  }
                                  endReorder();
                                }}
                              >
                                {!readOnly && (
                                  <span
                                    className="grip"
                                    draggable
                                    title="Drag to reorder"
                                    onDragStart={(e) => {
                                      setDrag({ kind: "sub", catId: cat.id, subId: sub.id });
                                      e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "sub" }));
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={endReorder}
                                  >
                                    ⠿
                                  </span>
                                )}
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
                                  readOnly={readOnly}
                                  onPick={(c) => mutateSub(cat.id, sub.id, (s) => ({ ...s, color: c }))}
                                />
                                <input
                                  className="csub__name"
                                  value={sub.name}
                                  readOnly={readOnly}
                                  onChange={(e) =>
                                    mutateSub(cat.id, sub.id, (s) => ({ ...s, name: e.target.value }))
                                  }
                                  aria-label="Subcategory name"
                                />
                                <span className="csub__count">{sub.isolateIds.length}</span>
                                {!readOnly && (
                                  <button
                                    type="button"
                                    className="ccat__del"
                                    title="Delete subcategory"
                                    onClick={() => removeSub(cat.id, sub.id)}
                                  >
                                    ×
                                  </button>
                                )}
                              </header>
                              {!sub.collapsed && renderDrop(cat.id, sub.id, sub.isolateIds, subColor)}
                            </div>
                          );
                        })}
                      </div>
                    )}
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
  expandable?: boolean;
  defaultOpen?: boolean;
  // Drag is disabled when viewing another contributor's board read-only.
  draggable?: boolean;
}

function Chip({ s, from, onRemove, onOpen, expandable, defaultOpen, draggable = true }: ChipProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  // Sync to the board-wide expand/collapse toggle.
  useEffect(() => setOpen(!!defaultOpen), [defaultOpen]);
  const dragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ isoId: s.id, from }));
    e.dataTransfer.effectAllowed = "move";
  };

  if (!expandable) {
    return (
      <span className="cchip" draggable={draggable} onDragStart={draggable ? dragStart : undefined}>
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

  return (
    <span
      className={`cchip cchip--card${open ? " cchip--open" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? dragStart : undefined}
    >
      <span className="cchip__row">
        <button
          type="button"
          className={`chev${open ? " is-open" : ""}`}
          aria-expanded={open}
          title={open ? "Hide details" : "Show details"}
          onClick={() => setOpen((o) => !o)}
        >
          ▸
        </button>
        <em className="cchip__name" onClick={onOpen} title="Edit isolate">
          {binomial(s.genus, s.species)}
        </em>
        {onRemove && (
          <button type="button" className="cchip__x" title="Remove" onClick={onRemove}>
            ×
          </button>
        )}
      </span>
      {open && (
        <div className="cchip__detail">
          <Readout species={s} emptyText="No test results recorded." />
        </div>
      )}
    </span>
  );
}

function ColorDot({
  color,
  onPick,
  readOnly,
}: {
  color: string;
  onPick: (c: string) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Read-only: show the colour swatch but don't open the picker.
  if (readOnly) {
    return (
      <span className="cdot">
        <span className="cdot__btn" style={{ background: color }} aria-hidden="true" />
      </span>
    );
  }
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
