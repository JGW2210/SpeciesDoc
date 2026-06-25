import type { Species } from "../types";

export type GramGroupId = "positive" | "negative" | "acidfast" | "other";

export interface GramGroup {
  id: GramGroupId;
  title: string;
  blurb: string;
}

// The bands the main list is organised into, in display order.
export const GRAM_GROUPS: GramGroup[] = [
  { id: "positive", title: "Gram-positive", blurb: "Crystal violet retained" },
  { id: "negative", title: "Gram-negative", blurb: "Counterstained with safranin" },
  { id: "acidfast", title: "Acid-fast", blurb: "Needs auramine / Ziehl-Neelsen; doesn't Gram-stain" },
  { id: "other", title: "Variable & untyped", blurb: "Gram-variable or not yet stained" },
];

export function gramGroupOf(s: Species): GramGroupId {
  const g = (s.gram ?? "").trim().toLowerCase();
  if (g.startsWith("acid") || g === "afb") return "acidfast";
  if (g.startsWith("pos") || g === "+") return "positive";
  if (g.startsWith("neg") || g === "−" || g === "-") return "negative";
  return "other";
}

// Map a free-text result onto a coarse polarity so chips can be coloured
// consistently regardless of whether the user typed "+", "Positive", etc.
export type Polarity = "pos" | "neg" | "var" | "neutral";

export function polarityOf(value: string): Polarity {
  const v = value.trim().toLowerCase();
  if (["positive", "+", "pos", "oxidative", "beta", "fermentative"].includes(v)) return "pos";
  if (["negative", "−", "-", "neg", "gamma", "none", "non-reactive"].includes(v)) return "neg";
  if (["variable", "v", "weak", "alpha", "±"].includes(v)) return "var";
  return "neutral";
}

// "Escherichia" + "coli" -> "Escherichia coli", normalised to binomial casing.
export function binomial(genus: string, species: string): string {
  const g = genus.trim();
  const s = species.trim();
  const gg = g ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() : "";
  const ss = s.toLowerCase();
  return [gg, ss].filter(Boolean).join(" ");
}
