import type { Category, CategoryGroup } from "../data/categories";
import { tv, type Specimen } from "../types";
import type { Band, DomainConfig } from "./index";

// Identification panel for parasites (protozoa, helminths, ectoparasites).
const CATEGORIES: Category[] = [
  {
    key: "parasite_group",
    label: "Group",
    short: "Group",
    type: "choice",
    hint: "Broad parasite class.",
    options: [
      { value: "Protozoa", label: "Protozoa", group: "Protozoa", title: "Single-celled eukaryote" },
      { value: "Nematode", label: "Nematode", group: "Helminth", title: "Roundworm" },
      { value: "Cestode", label: "Cestode", group: "Helminth", title: "Tapeworm" },
      { value: "Trematode", label: "Trematode", group: "Helminth", title: "Fluke" },
      { value: "Arthropod", label: "Arthropod", group: "Ectoparasite", title: "Ectoparasite / arthropod" },
    ],
  },
  {
    key: "stage",
    label: "Diagnostic stage",
    short: "Stage",
    type: "text",
    suggestions: ["Trophozoite", "Cyst", "Oocyst", "Egg", "Larva", "Adult", "Schizont", "Gametocyte"],
  },
  {
    key: "motility",
    label: "Motility",
    short: "Mot",
    type: "text",
    suggestions: ["Pseudopodia", "Flagella", "Cilia", "Gliding", "Non-motile"],
  },
  {
    key: "host",
    label: "Host",
    short: "Host",
    type: "text",
    suggestions: ["Human (definitive)", "Human (intermediate)", "Mammal", "Mollusc", "Arthropod vector"],
  },
  {
    key: "transmission",
    label: "Transmission",
    short: "Tx",
    type: "text",
    suggestions: ["Faecal-oral", "Vector-borne", "Soil-transmitted", "Waterborne", "Ingestion", "Vertical", "Skin penetration"],
  },
  {
    key: "site",
    label: "Site of infection",
    short: "Site",
    type: "text",
    suggestions: ["Blood", "GI tract", "Liver", "CNS", "Skin", "Urogenital", "Lung", "Muscle"],
  },
  {
    key: "diagnostic",
    label: "Diagnostic feature",
    short: "Dx",
    type: "text",
    hint: "Key morphological clue (e.g. kinetoplast, four nuclei, scolex hooks).",
  },
  {
    key: "other_notes",
    label: "Other notes",
    short: "Notes",
    type: "textarea",
    hint: "Source, stain, anything else worth remembering.",
  },
];

const GROUPS: CategoryGroup[] = [
  { name: "Classification", defaultOpen: true, keys: ["parasite_group"] },
  { name: "Morphology", defaultOpen: true, keys: ["stage", "motility", "diagnostic"] },
  { name: "Epidemiology", defaultOpen: true, keys: ["host", "transmission", "site"] },
  { name: "Notes", keys: ["other_notes"] },
];

const BANDS: Band[] = [
  { id: "protozoa", title: "Protozoa", blurb: "Single-celled eukaryotes" },
  { id: "helminth", title: "Helminths", blurb: "Nematodes, cestodes, trematodes" },
  { id: "arthropod", title: "Ectoparasites", blurb: "Arthropods" },
  { id: "other", title: "Unclassified", blurb: "Group not set" },
];

function bandOf(s: Specimen): string {
  const g = tv(s, "parasite_group");
  if (g === "Protozoa") return "protozoa";
  if (g === "Nematode" || g === "Cestode" || g === "Trematode") return "helminth";
  if (g === "Arthropod") return "arthropod";
  return "other";
}

export const PARASITE: DomainConfig = {
  id: "parasite",
  label: "Parasites",
  table: "parasites",
  boardId: "parasite",
  noun: "specimen",
  nounPlural: "specimens",
  tagline: "Bench log for parasites & their characteristics",
  genusPlaceholder: "Plasmodium",
  speciesPlaceholder: "falciparum",
  categories: CATEGORIES,
  groups: GROUPS,
  defaultOpenGroups: GROUPS.filter((g) => g.defaultOpen).map((g) => g.name),
  bands: BANDS,
  bandOf,
  bacterial: false,
};
