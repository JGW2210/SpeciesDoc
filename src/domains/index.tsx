import { createContext, useContext, type ReactNode } from "react";
import type { Category, CategoryGroup } from "../data/categories";
import { CATEGORIES, CATEGORY_GROUPS, DEFAULT_OPEN_GROUPS } from "../data/categories";
import { GRAM_GROUPS, gramGroupOf } from "../lib/format";
import type { Lineage, Specimen } from "../types";
import { VIRUS } from "./virus";
import { PARASITE } from "./parasite";

// A band groups the List into coloured sections (Gram reaction for bacteria,
// genome type for viruses, etc.). `id` drives the `band--<id>` CSS class.
export interface Band {
  id: string;
  title: string;
  blurb: string;
}

export type DomainId = "bacteria" | "virus" | "parasite";

// Everything that differs between the three sections. The List / Tree / Board /
// form components are otherwise identical and read what they need from here.
export interface DomainConfig {
  id: DomainId;
  label: string; // toggle + masthead
  table: string; // supabase table
  boardId: string; // board row id
  noun: string; // singular entity noun, e.g. "isolate"
  nounPlural: string;
  tagline: string; // masthead subtitle
  genusPlaceholder: string;
  speciesPlaceholder: string;
  categories: Category[];
  groups: CategoryGroup[];
  defaultOpenGroups: string[];
  bands: Band[];
  bandOf: (s: Specimen) => string;
  bacterial: boolean; // taxonomy: apply bacterial corrections + Gram fallback
  // Optional curated lineage (overrides GBIF) for genera the backbone misses or
  // misplaces — used by viruses (sparse coverage) and parasites (inconsistent
  // protist taxonomy). Returns null to fall back to GBIF.
  lineageFor?: (genus: string, species: string) => Lineage | null;
  // Optional reclassifier applied to a GBIF-matched lineage at display time (when
  // no curated override matched) — parasites use it to lift GBIF's deprecated
  // Chromista/Protozoa kingdoms onto the modern eukaryote supergroups.
  reclassify?: (lin: Lineage) => Lineage;
}

export const BACTERIA: DomainConfig = {
  id: "bacteria",
  label: "Bacteria",
  table: "species",
  boardId: "main",
  noun: "isolate",
  nounPlural: "isolates",
  tagline: "Bench log for bacterial isolates & their test panels",
  genusPlaceholder: "Staphylococcus",
  speciesPlaceholder: "aureus",
  categories: CATEGORIES,
  groups: CATEGORY_GROUPS,
  defaultOpenGroups: DEFAULT_OPEN_GROUPS,
  bands: GRAM_GROUPS,
  bandOf: gramGroupOf,
  bacterial: true,
};

export const DOMAINS: DomainConfig[] = [BACTERIA, VIRUS, PARASITE];

const DomainContext = createContext<DomainConfig>(BACTERIA);

export const useDomain = () => useContext(DomainContext);

export function DomainProvider({
  config,
  children,
}: {
  config: DomainConfig;
  children: ReactNode;
}) {
  return <DomainContext.Provider value={config}>{children}</DomainContext.Provider>;
}
