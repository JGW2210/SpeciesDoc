// User-defined arrangement of isolates: categories → subcategories → isolate
// references. Stored as a single jsonb document in the `board` table.

export interface BoardSub {
  id: string;
  name: string;
  color: string | null; // null = inherit the category colour
  collapsed: boolean;
  isolateIds: string[];
}

export interface BoardCat {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
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
  return { id: uid("sub"), name: `Subcategory ${index}`, color: null, collapsed: false, isolateIds: [] };
}

export function newCat(index: number): BoardCat {
  return {
    id: uid("cat"),
    name: `Category ${index}`,
    color: PRESET_COLORS[(index - 1) % PRESET_COLORS.length],
    collapsed: false,
    subs: [newSub(1)],
  };
}
