// User-defined arrangement of isolates: categories → nested subcategories →
// isolate references. Stored as a single jsonb document in the `board` table.

// The maximum nesting depth, counting the category as layer 1. So a category
// may hold subcategories up to 3 levels deep (layers 2–4).
export const MAX_DEPTH = 4;

export interface BoardSub {
  id: string;
  name: string;
  color: string | null; // null = inherit the parent colour
  collapsed: boolean;
  isolateIds: string[];
  subs: BoardSub[]; // nested subcategories (empty at the deepest layer)
}

export interface BoardCat {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  isolateIds: string[]; // isolates held directly on the category (no subcategory)
  subs: BoardSub[];
}

export interface Board {
  categories: BoardCat[];
}

export const EMPTY_BOARD: Board = { categories: [] };

export const PRESET_COLORS = [
  "#6a2c91",
  "#c12968",
  "#0e7c86",
  "#9a6a16",
  "#2f6f4f",
  "#3a567a",
  "#b2563a",
  "#8a4b9c",
  "#4d6b8a",
  "#557083",
];

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newSub(index: number): BoardSub {
  return {
    id: uid("sub"),
    name: `Subcategory ${index}`,
    color: null,
    collapsed: false,
    isolateIds: [],
    subs: [],
  };
}

export function newCat(index: number): BoardCat {
  return {
    id: uid("cat"),
    name: `Category ${index}`,
    color: PRESET_COLORS[(index - 1) % PRESET_COLORS.length],
    collapsed: false,
    isolateIds: [],
    subs: [], // starts droppable directly; add subcategories for nesting
  };
}

// Recursively backfill fields older saved boards may lack (category/sub-level
// isolateIds, and the nested `subs` array introduced with deep nesting).
function normalizeSub(s: BoardSub): BoardSub {
  return {
    ...s,
    isolateIds: s.isolateIds ?? [],
    subs: (s.subs ?? []).map(normalizeSub),
  };
}

export function normalizeBoard(b: Board | null | undefined): Board {
  return {
    categories: (b?.categories ?? []).map((c) => ({
      ...c,
      isolateIds: c.isolateIds ?? [],
      subs: (c.subs ?? []).map(normalizeSub),
    })),
  };
}
