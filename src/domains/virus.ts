import type { Category, CategoryGroup } from "../data/categories";
import { tv, type Specimen } from "../types";
import type { Band, DomainConfig } from "./index";

// Identification panel for viruses. Same field mechanics as the bacterial panel,
// biologically-appropriate fields.
const CATEGORIES: Category[] = [
  {
    key: "genome_type",
    label: "Genome type",
    short: "Genome",
    type: "choice",
    hint: "Baltimore classification of the genome.",
    options: [
      { value: "dsDNA", label: "dsDNA", group: "DNA", title: "Double-stranded DNA (I)" },
      { value: "ssDNA", label: "ssDNA", group: "DNA", title: "Single-stranded DNA (II)" },
      { value: "dsRNA", label: "dsRNA", group: "RNA", title: "Double-stranded RNA (III)" },
      { value: "ssRNA(+)", label: "ssRNA(+)", group: "RNA", title: "Positive-sense ssRNA (IV)" },
      { value: "ssRNA(−)", label: "ssRNA(−)", group: "RNA", title: "Negative-sense ssRNA (V)" },
      { value: "ssRNA-RT", label: "ssRNA-RT", group: "Reverse-transcribing", title: "ssRNA with reverse transcriptase (VI)" },
      { value: "dsDNA-RT", label: "dsDNA-RT", group: "Reverse-transcribing", title: "dsDNA with reverse transcriptase (VII)" },
    ],
  },
  {
    key: "envelope",
    label: "Envelope",
    short: "Env",
    type: "sign",
    options: [
      { value: "Enveloped", label: "Enveloped", title: "Lipid envelope present" },
      { value: "Non-enveloped", label: "Naked", title: "Non-enveloped / naked capsid" },
    ],
  },
  {
    key: "capsid",
    label: "Capsid symmetry",
    short: "Capsid",
    type: "text",
    suggestions: ["Icosahedral", "Helical", "Complex", "Prolate"],
  },
  {
    key: "morphology",
    label: "Morphology",
    short: "Morph",
    type: "text",
    suggestions: ["Spherical", "Filamentous", "Bullet-shaped", "Brick-shaped", "Rod", "Head-tail"],
  },
  {
    key: "host",
    label: "Host",
    short: "Host",
    type: "text",
    suggestions: ["Human", "Mammal", "Bird", "Plant", "Bacterium (phage)", "Insect"],
  },
  {
    key: "transmission",
    label: "Transmission",
    short: "Tx",
    type: "text",
    suggestions: ["Respiratory", "Faecal-oral", "Bloodborne", "Sexual", "Vector-borne", "Vertical", "Contact"],
  },
  {
    key: "tropism",
    label: "Tropism / disease",
    short: "Tropism",
    type: "text",
    hint: "Target tissue or associated disease.",
  },
  {
    key: "other_notes",
    label: "Other notes",
    short: "Notes",
    type: "textarea",
    hint: "Family, strain, source, anything else worth remembering.",
  },
];

const GROUPS: CategoryGroup[] = [
  { name: "Genome & structure", defaultOpen: true, keys: ["genome_type", "envelope", "capsid"] },
  { name: "Morphology", defaultOpen: true, keys: ["morphology"] },
  { name: "Epidemiology", defaultOpen: true, keys: ["host", "transmission", "tropism"] },
  { name: "Notes", keys: ["other_notes"] },
];

// List bands by nucleic-acid class, derived from the genome type.
const BANDS: Band[] = [
  { id: "dna", title: "DNA viruses", blurb: "DNA genome" },
  { id: "rna", title: "RNA viruses", blurb: "RNA genome" },
  { id: "retro", title: "Reverse-transcribing", blurb: "Uses reverse transcriptase" },
  { id: "other", title: "Unclassified", blurb: "Genome type not set" },
];

function bandOf(s: Specimen): string {
  const g = tv(s, "genome_type");
  if (g.includes("RT")) return "retro";
  if (g.includes("RNA")) return "rna";
  if (g.includes("DNA")) return "dna";
  return "other";
}

export const VIRUS: DomainConfig = {
  id: "virus",
  label: "Viruses",
  table: "viruses",
  boardId: "virus",
  noun: "virus",
  nounPlural: "viruses",
  tagline: "Bench log for viruses & their characteristics",
  genusPlaceholder: "Orthohepevirus",
  speciesPlaceholder: "A",
  categories: CATEGORIES,
  groups: GROUPS,
  defaultOpenGroups: GROUPS.filter((g) => g.defaultOpen).map((g) => g.name),
  bands: BANDS,
  bandOf,
  bacterial: false,
};
