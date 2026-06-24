import type { TestKey } from "../types";

// How a single test is entered and displayed.
//   sign       — classic +/- biochemical result (plus a "variable" middle state)
//   gram       — Gram stain reaction, drives the whole grouping
//   haemolysis — alpha / beta / gamma blood-agar reaction
//   of         — Hugh & Leifson oxidation/fermentation
//   choice     — single pick from many grouped options (e.g. motility type)
//   text       — short free text (with optional quick-pick suggestions)
//   textarea   — longer free text
export type FieldType = "sign" | "gram" | "haemolysis" | "of" | "choice" | "text" | "textarea";

export interface QuickOption {
  value: string; // value stored in the database
  label: string; // glyph / short label shown on the chip
  title?: string; // full name for tooltips + screen readers
  group?: string; // optional subsection heading (used by "choice" fields)
}

export interface Category {
  key: TestKey;
  label: string;
  short: string; // compact label used on result chips
  type: FieldType;
  options?: QuickOption[];
  suggestions?: string[]; // quick fills for text fields
  hint?: string;
}

const SIGN: QuickOption[] = [
  { value: "Positive", label: "+", title: "Positive" },
  { value: "Negative", label: "−", title: "Negative" },
  { value: "Variable", label: "v", title: "Variable / weak" },
];

export const CATEGORIES: Category[] = [
  {
    key: "gram",
    label: "Gram",
    short: "Gram",
    type: "gram",
    options: [
      { value: "Positive", label: "Gram +", title: "Gram positive" },
      { value: "Negative", label: "Gram −", title: "Gram negative" },
      { value: "Variable", label: "Variable", title: "Gram variable" },
    ],
    hint: "Crystal violet retained = positive.",
  },
  { key: "oxidase", label: "Oxidase", short: "Ox", type: "sign", options: SIGN },
  { key: "catalase", label: "Catalase", short: "Cat", type: "sign", options: SIGN },
  { key: "indole", label: "Indole", short: "Ind", type: "sign", options: SIGN },
  {
    key: "fermentation",
    label: "Fermentation",
    short: "Ferm",
    type: "text",
    suggestions: ["Glucose", "Lactose", "Maltose", "Sucrose", "Mannitol", "None"],
    hint: "Which sugars are fermented.",
  },
  {
    key: "distinctive_shape",
    label: "Distinctive shape",
    short: "Shape",
    type: "text",
    suggestions: ["Cocci", "Bacilli", "Diplococci", "Chains", "Clusters", "Coccobacilli", "Spiral"],
  },
  {
    key: "motility",
    label: "Motility",
    short: "Mot",
    type: "choice",
    hint: "Mechanism or pattern of movement.",
    options: [
      // Appendage-dependent
      { value: "Swimming", label: "Swimming", group: "Appendage-dependent", title: "Flagellar swimming in liquid (e.g. E. coli, Vibrio cholerae)" },
      { value: "Swarming", label: "Swarming", group: "Appendage-dependent", title: "Coordinated flagellar movement over surfaces (e.g. Proteus)" },
      { value: "Twitching", label: "Twitching", group: "Appendage-dependent", title: "Type IV pili extension/retraction over solid surfaces" },
      // Appendage-independent
      { value: "Gliding", label: "Gliding", group: "Appendage-independent", title: "Smooth surface movement without flagella or pili (e.g. Myxococcus, Mycoplasma)" },
      { value: "Sliding", label: "Sliding", group: "Appendage-independent", title: "Passive spread via surfactants / colony expansion" },
      // Specific patterns
      { value: "Corkscrew", label: "Corkscrew", group: "Pattern", title: "Spirochaete axial-filament motility (e.g. Treponema)" },
      { value: "Tumbling", label: "Tumbling", group: "Pattern", title: "Tumbling motility (e.g. Listeria)" },
      { value: "Darting", label: "Darting", group: "Pattern", title: "Darting motility (e.g. Vibrio)" },
      // Temperature-dependent (variable)
      { value: "Motile at 25 °C", label: "Motile @ 25 °C", group: "Variable — temperature-dependent", title: "Motile at ~25 °C, non-motile at 37 °C (e.g. Listeria, Yersinia)" },
      { value: "Motile at 30 °C", label: "Motile @ 30 °C", group: "Variable — temperature-dependent", title: "Motile at ~30 °C" },
      { value: "Temperature-variable", label: "Temp-variable", group: "Variable — temperature-dependent", title: "Motility varies with incubation temperature" },
      // Result
      { value: "Non-motile", label: "Non-motile", group: "Result", title: "No motility observed" },
      { value: "Motile (type n/d)", label: "Motile · type n/d", group: "Result", title: "Motile, mechanism not determined" },
    ],
  },
  {
    key: "haemolysis",
    label: "Haemolysis",
    short: "Haem",
    type: "haemolysis",
    options: [
      { value: "Alpha", label: "α", title: "Alpha — partial / greening" },
      { value: "Beta", label: "β", title: "Beta — complete clearing" },
      { value: "Gamma", label: "γ", title: "Gamma — none" },
    ],
  },
  { key: "coagulase", label: "Coagulase", short: "Coag", type: "sign", options: SIGN },
  { key: "aesculin", label: "Aesculin", short: "Aes", type: "sign", options: SIGN },
  { key: "pyr_pyz", label: "PYR / PYZ", short: "PYR", type: "sign", options: SIGN },
  {
    key: "spores",
    label: "Spores",
    short: "Spore",
    type: "sign",
    options: [
      { value: "Positive", label: "+", title: "Spore-forming" },
      { value: "Negative", label: "−", title: "Non-sporing" },
      { value: "Variable", label: "v", title: "Variable" },
    ],
  },
  { key: "dnase", label: "DNase", short: "DNase", type: "sign", options: SIGN },
  { key: "tributyrin", label: "Tributyrin", short: "Trib", type: "sign", options: SIGN },
  {
    key: "hugh_leifson_of",
    label: "Hugh & Leifson O/F",
    short: "O/F",
    type: "of",
    options: [
      { value: "Oxidative", label: "O", title: "Oxidative" },
      { value: "Fermentative", label: "F", title: "Fermentative" },
      { value: "Non-reactive", label: "—", title: "Non-reactive / asaccharolytic" },
    ],
  },
  {
    key: "atmosphere",
    label: "Atmosphere",
    short: "Atm",
    type: "text",
    suggestions: ["Aerobe", "Anaerobe", "Facultative", "Microaerophilic", "Capnophilic"],
    hint: "Oxygen requirement for growth.",
  },
  { key: "methyl_red", label: "Methyl red", short: "MR", type: "sign", options: SIGN },
  { key: "voges_proskauer", label: "Voges-Proskauer", short: "VP", type: "sign", options: SIGN },
  { key: "citrate", label: "Citrate", short: "Cit", type: "sign", options: SIGN },
  {
    key: "other_notes",
    label: "Other notes",
    short: "Notes",
    type: "textarea",
    hint: "Source, media, colony colour, anything else worth remembering.",
  },
];

// Quick lookup by column key.
export const CATEGORY_BY_KEY: Record<TestKey, Category> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c;
    return acc;
  },
  {} as Record<TestKey, Category>,
);
