# SpeciesDoc — project summary

A bench tool for logging microbial specimens and their ID test panels, across
**three sections — Bacteria, Viruses, Parasites** (top-level toggle) — each with
a List view, a taxonomic tree view (Radial / Dendrogram / Outline), and a custom
drag-and-drop board. Built with **Vite + React + TypeScript** and **Supabase**.
Deployed to **GitHub Pages** at **https://jgw2210.github.io/SpeciesDoc**.

Use this file to resume work in a fresh session — it captures the architecture,
data model, conventions, and what's done / outstanding.

---

## Repo & workflow

- **GitHub repo:** `jgw2210/speciesdoc` (default branch `main`).
- **Working branch:** the active feature branch (most recently
  `claude/optimistic-faraday-e7lhlq`). Develop there, open a PR into `main`, and
  merge. Each change ships as its own small PR (the project is past #54).
- **Deploy:** `.github/workflows/deploy.yml` builds and publishes to GitHub
  Pages on every push to `main`. Pages **Source** must be set to **GitHub
  Actions** (Settings → Pages — already done). Occasionally a deploy sticks in
  `deployment_queued`; re-running the failed job clears it.
- **Vite base:** `vite.config.ts` sets `base: "/SpeciesDoc/"` for production so
  assets resolve on the project-site subpath. Dev server stays at root.
- **Build/verify:** `npm run build` (tsc + vite). The build environment **can't
  reach Supabase or GBIF** (host allowlist) and **has no browser** (Playwright
  Chromium download is blocked), so changes are verified by `npm run build` plus
  checking modules transform via the dev server; live behaviour is tested by the
  user in the browser.

## Tech stack / dependencies

- React 18, Vite 5, TypeScript 5 (strict; `noUnusedLocals`/`noUnusedParameters`).
- `@supabase/supabase-js` for data.
- `d3-hierarchy` + `d3-polygon` (tree layout / radial hulls) and `d3-zoom` +
  `d3-selection` (pan/zoom). `d3-shape` is a leftover dep, no longer imported.
- No CSS framework — all styling is hand-written in `src/index.css` using CSS
  custom properties. Design language = the Gram stain (crystal violet / safranin
  reagent colours), fonts Space Grotesk (display) / Inter (body) / JetBrains
  Mono (data).

## Supabase

- Connection values are committed (browser-safe) in `src/config.ts`; env vars
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` override them. The key is the
  **publishable/anon** key (RLS-gated), not the secret key.
- **Open RLS** on all tables (anon can read/write) — intentional for a personal,
  single-user log. If this ever goes public, add Supabase Auth and scope
  policies to `auth.uid()`.
- Full schema in `supabase/schema.sql`; incremental migrations in
  `supabase/migrations/` (run each once in the SQL editor for an existing DB).

### Tables

- **`species`** — one row per isolate. Columns: `id` (uuid), `created_at`,
  `genus`, `species`, `old_name` (synonym/former name, optional), `lineage`
  (jsonb, cached GBIF taxonomy), and one nullable text column per test:
  `gram, oxidase, catalase, indole, fermentation, distinctive_shape,
  motility, haemolysis, coagulase, aesculin, pyr_pyz, spores, dnase, tributyrin,
  hugh_leifson_of, atmosphere, methyl_red, voges_proskauer, citrate,
  other_notes`. `gram` is the unified **Staining** field — values
  `Positive / Negative / Variable / Acid-fast` (the old separate `afb` column
  was folded into it and dropped; see migration `2026-06-25_merge_afb_into_gram.sql`).
- **`viruses`** — one row per virus. Same base columns + a virus panel:
  `genome_type, envelope, capsid, morphology, host, transmission, tropism,
  other_notes`.
- **`parasites`** — one row per parasite. Same base + a parasite panel:
  `parasite_group, stage, motility, host, transmission, site, diagnostic,
  other_notes`.
- **`board`** — one row **per domain** (`id` = `main` / `virus` / `parasite`),
  each holding that section's Board layout as `data` jsonb. Shape in
  `src/lib/board.ts`. (Viruses + parasites tables added by migration
  `2026-06-27_add_virus_parasite.sql`.)

## Domains (Bacteria / Viruses / Parasites)

The app has **three sections**, chosen by a top-level `domainbar` toggle in
`App.tsx`. They share the entire List/Tree/Board/form stack — only the data
differs. Each section is a **`DomainConfig`** in `src/domains/` (`bacteria.ts`
is inlined in `index.tsx`; `virus.ts`, `parasite.ts`) carrying: `table`,
`boardId`, panel `categories`/`groups`, list `bands` + `bandOf`, taxonomy
`bacterial` flag, noun/tagline/placeholders. `DomainProvider`/`useDomain`
(React context) deliver the active config; components read panel/bands/board
from there instead of importing the bacterial constants. Rows are the generic
`Specimen` type (typed base + per-test index signature); read test values with
`tv(row, key)`.

- **Separate tables**: `species` / `viruses` / `parasites`, each with its own
  test columns. The `board` table is shared, keyed per domain (`main` / `virus`
  / `parasite`). Migration: `2026-06-27_add_virus_parasite.sql`.
- **Taxonomy**: GBIF for all three. `buildTaxonomy(species, { detailed,
  bacterial })`. Each domain corrects/curates GBIF differently via two
  **`DomainConfig` hooks** (both display-time, so cached rows fix without a
  re-fetch or DB write):
  - **`lineageFor(genus, species)`** — a curated genus→lineage map that
    **replaces** GBIF for genera the backbone misses/misplaces. Viruses:
    `src/lib/virusLineage.ts` (`VIRAL_LINEAGES`, ICTV). Parasites:
    `src/lib/parasiteLineage.ts` (`PARASITE_LINEAGES`, modern eukaryote scheme).
    Applied in `enrichOne` (on save + "Fetch lineage"; matchType `"CURATED"`)
    **and** in `TreeView`. Returns null → fall through to GBIF.
  - **`reclassify(lin)`** — transforms a *GBIF-matched* lineage (applied in
    `TreeView` only, when no curated override matched). Parasites set it to
    `modernEukaryote` (`src/lib/parasiteTaxonomy.ts`), which lifts GBIF's
    deprecated **Chromista/Protozoa** kingdoms onto the modern eukaryote
    **supergroups** in the `realm` slot — **SAR** (Alveolata/Stramenopiles/
    Rhizaria; e.g. Myzozoa → SAR · Alveolata · Apicomplexa), **Amoebozoa**,
    **Metamonada**, **Discoba**, **Opisthokonta** (Animalia + Fungi) — keeping
    GBIF's class/order/family beneath. Curated map wins over it.
- **Per-domain topology** (`buildTaxonomy`):
  - **Bacteria** (`bacterial: true`): `Bacteria` root (= kingdom) → phylum →
    class → order → **family** → genus, the same for every view, with the
    bacterial name corrections (below). Radial keeps **phylum** as its top
    (hull) level and surfaces class/order/family as ring labels.
  - **Viruses / parasites** (`bacterial: false`): walk the chain realm → kingdom
    → phylum (→ class → order → family for the **detailed** dendrogram; the lean
    radial/outline stop at phylum). Absent ranks are skipped, then **back-filled**
    from `ancestryMap` (below) so a partial GBIF lineage lands under the same
    ancestors as a complete one (no forked duplicate subtree). `genusKeys` uses
    the same `detailed` flag as its view so collapse keys line up.
- `Lineage` carries **`realm`** (top slot) — viral ICTV realm or parasite
  eukaryote supergroup; null for bacteria.
- Switching domains remounts the main content (`<main key={domainId}>`) so each
  section's form/board/tree state is fresh; the active table is reloaded.

## App architecture

`src/App.tsx` owns the active **domain**, the specimen list (load/insert/update/
delete on `config.table`), the GBIF lineage enrichment, and the **view toggle**:
`list | tree | custom`. The entry form (`SpeciesForm`) shows only in List view
(left column on desktop; a slide-up bottom-sheet on mobile). Tree and Board are
full-width.

### Key files

- `src/types.ts` — **`Specimen`** is the generic row: a typed base
  (`id, created_at, genus, species, old_name, lineage`) **plus a per-test index
  signature** so each domain's panel columns are addressed by key. **`tv(row,
  key)`** reads a test value as a string (`""` when unset/non-string) — use it
  everywhere instead of `row[key]`, since the index type is `string | null |
  Lineage`. `SpecimenDraft` is declared explicitly (not `Omit`, which collapses
  the base types under the index signature). `Species`/`SpeciesDraft`/`TestKey`
  are kept as aliases. `Lineage` carries `realm?` (viruses) above `kingdom`.
- `src/data/categories.ts` — the **bacterial** test panel (the other two domains
  define their own in `src/domains/virus.ts` / `parasite.ts`). `CATEGORIES`
  (each: key, label, short, type, options?, suggestions?, hint?),
  `CATEGORY_BY_KEY`, `CATEGORY_GROUPS` (collapsible form sections: Staining,
  Microscopy & morphology, Key enzymes, Biochemical & metabolism, Culture,
  Notes), `DEFAULT_OPEN_GROUPS`. Field `type`s: `sign` (+/−/variable segmented),
  `gram`, `haemolysis` (α/β/γ), `of` (O/F), `choice` (grouped chips, e.g.
  motility), `text`, `textarea`. Adding a test here flows it into the form, card
  readout, and ID filter automatically — only the DB column + (for back-compat)
  `types.ts` need separate edits. (`Category.key` is now a plain `string`.)
- `src/components/SpeciesForm.tsx` — entry/edit form. Collapsible test sections;
  the `choice` (motility) field is itself collapsible (closed by default).
- `src/components/SpeciesList.tsx` — grouped by staining band (Gram-positive /
  Gram-negative / **Acid-fast** / variable & untyped; non-bacterial domains use
  their own bands). Name search, **ID filter** (date-added presets + custom
  range, plus per-test value filters), **Collapse all / Expand all** (name-only
  cards), **Sort: Newest / A–Z**. The ID filter covers fixed-option tests **and
  free-text tests with suggestions** — each suggestion is a chip plus an **Other**
  bucket (any entered value that isn't a default; `OTHER` sentinel in the
  component).
- `src/components/SpeciesCard.tsx` — one isolate; collapsible to name-only via a
  chevron; date sits at the card's bottom-right; Edit/Delete (inline confirm).
- `src/components/Readout.tsx` — shared test-chip readout (used by the card and
  the board chips).
- `src/components/TreeView.tsx` — the tree view. A `TreeView` container owns a
  three-way **Radial / Dendrogram / Outline** layout toggle, a shared **search**
  box, and the shared **detail panel** (click a tip → lineage breadcrumb +
  readout + edit) — docked centre-bottom of the viewport (`.treedetail`,
  `position: fixed`). The container's `items` memo fixes each row's lineage
  before building: a **`lineageFor`** curated override wins, else **`reclassify`**
  is applied to the GBIF lineage (so all three views + the detail breadcrumb see
  the corrected lineage). The two SVG layouts share interaction logic via the
  `useTreeNav` hook (collapse overrides, focus/re-root, pan/zoom), the `useFit`
  search-fit effect, and the `TreeControls` component (breadcrumb +
  Expand/Collapse all + Reset view/layout).
  - **Focus / re-root** is a **rank-path** (`FocusStep[]` = the chain of
    `{rank,name}` from root to the focused node), not a single key. `findByPath`
    re-roots, `pathOf(node, focus)` builds a clicked node's absolute path,
    `focusCrumb` rebuilds the breadcrumb. So **any** internal rank node (realm …
    family) is a focus target. (Genus is a collapse toggle, not a focus target.)
    Collapse keys (`keyOf` → `p:`/`c:`/`g:`) are a separate, still phylum-anchored
    scheme.
  - **`RadialTree`** — floating radial layout with convex-hull blobs. The hull
    encircles each **top-level (depth-1) branch under the current root** — the
    broadest rank in view: **realm** (supergroup) for parasites, **realm** for
    viruses, **phylum** for bacteria. Self-adapts on focus (focus a realm → hulls
    per kingdom). The ranks *below* the hull get small clickable **ring labels**
    (`.tree__ringlabel`): kingdom+phylum for viruses/parasites, class+order+family
    for bacteria (Proteobacteria classes still render as α/β/γ greek tags and are
    excluded from ring labels). Leaves colour by their depth-1 (hull) ancestor.
  - **`Dendrogram`** (same file) — horizontal rectangular cladogram (root left,
    orthogonal "elbow" branches fanning right, species labels down the right edge).
    Uses the **detailed topology** (full chain to family). d3 `cluster` projected
    to cartesian, then each node's horizontal is re-set by **taxonomic rank**
    (shared columns for realm/kingdom/phylum/…) rather than tree depth, so
    rank-skipping lineages (e.g. Deltavirus realm→family) still align — the elbow
    link spans the gap. **Every rank label (realm … family) is click-to-focus**;
    pan + wheel/pinch zoom; Expand/Collapse all + Reset view/layout; genera
    auto-collapse at ≥3 isolates ("Genus spp.") with a "−" handle; search
    highlights + fits. Tips keyboard-activatable.
  - **`OutlineTree`** (`components/OutlineTree.tsx`) — an indented, collapsible,
    keyboard/ARIA-friendly tree; inherits whatever depth the lean topology has;
    search filters to matching branches.
  - An **Unplaced** list (GBIF matchType NONE) sits under the tree. Uses
    `d3-zoom` + `d3-selection`.
- `src/lib/gbif.ts` — `fetchLineage(genus, species, oldName?)`: matches against
  the GBIF backbone (browser-side; GBIF allows CORS). Tries the current name,
  falls back to `old_name` if it can't be placed. A **placeholder species**
  (`sp.` / `spp.` / blank) is looked up as the **genus alone** (GBIF returns NONE
  for "Genus spp.").
- `src/lib/taxonomy.ts` — `buildTaxonomy` + helpers. **Non-bacterial back-fill:**
  `NB_RANKS` (realm…family) / `NB_RADIAL_RANKS` (realm,kingdom,phylum) are the
  rank chains; `linRank(lin, rank)` reads a rank but treats GBIF's placeholder
  kingdom **`"Viruses"`** as absent; `ancestryMap(species)` records, across all
  rows, the fullest higher-rank ancestors seen for each `(rank, name)`, and the
  build fills any gaps from it (so a partial lineage slots under the same
  ancestors as a complete one — the original Peploviricota/Plasmodium fork fix).
  Plus the **bacterial** display-time normalisers applied to the **cached** GBIF
  lineage (so existing rows are corrected without a re-fetch or DB change):
  - `modernPhylum()` maps GBIF's pre-2021 phylum names to current ICNP names
    (Firmicutes→Bacillota, Proteobacteria→Pseudomonadota,
    Actinobacteriota→Actinomycetota, etc.) and strips GTDB suffixes
    (`Firmicutes_A` → Bacillota).
  - `resolveClass(genus, gbifClass)` — curated **genus→class override**
    (`CLASS_BY_GENUS`). GBIF/GTDB mislabels the classic Proteobacteria classes
    (it folds Betaproteobacteria into Gamma), so e.g. Neisseria, Bordetella,
    Burkholderia, Delftia, Achromobacter, Alcaligenes are pinned to
    Betaproteobacteria; Brucella/Agrobacterium/Ochrobactrum to Alpha. Falls
    through to GBIF's class when no override. Only Proteobacteria classes draw an
    α/β/γ tag (the `GREEK` map).
  - `resolvePhylum(genus, gbifPhylum)` — curated **genus→phylum override**
    (`PHYLUM_BY_GENUS`). Pins the wall-less Mollicutes (Mycoplasma, Ureaplasma,
    Mycoplasmoides, …) to their own ICNP phylum **Mycoplasmatota** instead of the
    Bacillota nesting GBIF/GTDB returns. Falls through to `modernPhylum()`.
  - `modernOrder(name)` — renames superseded **order** names (Rhizobiales →
    Hyphomicrobiales, Enterobacteriales → Enterobacterales, Corynebacteriales →
    Mycobacteriales) and strips GTDB `_A`/`_B` suffixes; applied where the
    **detailed dendrogram** inserts order nodes. Extend `MODERN_ORDER` as more
    old names surface.
  - Both genus override maps are keyed by **lowercase entered genus** and are
    easy to extend as more discrepancies surface — a typo in the entered genus
    makes a row miss its override, so name spelling matters.
- `src/lib/virusLineage.ts` — `VIRAL_LINEAGES` (curated ICTV genus→lineage map)
  + `viralLineage()`. Wired as the virus domain's `lineageFor`.
- `src/lib/parasiteLineage.ts` — `PARASITE_LINEAGES` (curated genus→lineage in
  the modern supergroup scheme) + `parasiteLineage()`. The virus domain's
  `lineageFor`'s parasite counterpart; covers genera GBIF mis-kingdoms (Plasmodium,
  Trichomonas) or can't match (Cryptosporidium, Dientamoeba).
- `src/lib/parasiteTaxonomy.ts` — `modernEukaryote(lin)`, the parasite
  `reclassify` hook: GBIF kingdom/phylum → modern supergroup (`BY_PHYLUM`, then
  `BY_KINGDOM` fallback). Extend the lookup if a new GBIF phylum appears unmapped.
- `src/components/CustomView.tsx` — the **Board**. User-defined categories →
  subcategories (`src/lib/board.ts` types). Add/rename/delete categories &
  subs, custom colours (swatch picker), collapsible. Drag isolates from a
  searchable palette into category-level or subcategory drop zones; move/remove
  them; categorised chips expand to show the readout (capped width, wraps in
  rows); board-wide Expand/Collapse all. **Drag handles (⠿)** reorder categories
  and reorder subcategories within a category. Deleting a category asks for
  confirmation. Persists to the `board` table (debounced + flush on unmount;
  shows Saving…/Saved/Couldn't-save).
- `src/lib/format.ts` — `binomial()`, `polarityOf()`, and the staining bands:
  `GRAM_GROUPS` + `gramGroupOf()` route each isolate to one of four list bands —
  **Gram-positive / Gram-negative / Acid-fast / Variable & untyped** — off the
  unified `gram` (Staining) value.

## Conventions

- Commit trailers used in this repo:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: <current session URL>
  ```
- PRs end with the standard "Generated with Claude Code" line.
- Each feature ships as its own small PR, merged into `main`.
- When adding a DB column the app writes on insert (a test, `old_name`, etc.),
  ship a migration and tell the user to run it — until then inserts fail.

## Outstanding / possible next steps

- A **"force re-fetch lineage"** action for already-placed rows (current backfill
  skips `NONE`/empty only), to repair stale GBIF caches without editing +
  re-saving. (Worked around for curated data by the display-time override, but a
  real refresh is still wanted — this limitation has bitten class/order/realm.)
- **Virus/parasite panels** are a first draft — tune fields per the user's needs.
  Likewise the new domains' List bands are neutral grey (vs the Gram colours);
  could be domain-tinted. Masthead mark is still the bacterial streak-plate.
- Extend the curated maps / lookups as data grows: `VIRAL_LINEAGES`,
  `PARASITE_LINEAGES`, `parasiteTaxonomy` `BY_PHYLUM`/`BY_KINGDOM` (parasites),
  `CLASS_BY_GENUS` / `PHYLUM_BY_GENUS` / `MODERN_ORDER` (bacteria).
- **Parasite deep ranks are coarse** — GBIF's classes (e.g. Amoebozoa "Lobosa")
  are outdated/uninformative; `modernEukaryote` only fixes supergroup→phylum and
  keeps GBIF below. Could curate amoebae/flagellate class/order in
  `PARASITE_LINEAGES` if finer resolution is wanted.
- Touch-friendly drag-and-drop on the Board (current DnD is native HTML5).
- Reorder chips within a zone; move subcategories between categories.
- Tune the genus auto-collapse threshold (3); tighten dendrogram `COL_W` (156)
  now that columns are rank-fixed. The bacterial radial is now deep
  (phylum→class→order→family→genus) — order/family ring labels can crowd; could
  scope them to the focused branch if it feels busy.
- Optional: confirm on subcategory delete; CSV export of a filtered view.
- Auth / per-user data if it ever stops being a personal single-user log.

## Important caveats to remember

- The tree is a **taxonomy** (rank-based topology), not a molecular phylogeny —
  no branch lengths or bootstrap values (that data doesn't exist here).
- Modern names are primary and shown everywhere; the old/synonym name appears
  only on the tree detail card and is used for the GBIF fallback lookup.
- **GBIF's bacterial backbone is GTDB-flavoured and unreliable at class/phylum
  level** (it folds Betaproteobacteria into Gamma and nests Mollicutes in
  Bacillota). Corrections live in the `CLASS_BY_GENUS` / `PHYLUM_BY_GENUS`
  override maps in `taxonomy.ts` — extend them, don't trust GBIF's class/phylum
  blindly. These apply at display time, so they fix already-cached rows.
- **GBIF's parasite/protist taxonomy is also unreliable**: it uses the deprecated
  kingdoms Chromista/Protozoa, scatters/forks taxa across kingdoms (e.g.
  *Plasmodium falciparum* → Chromista but *P. malariae* → Animalia), and fuzzy-
  matches misspellings to the wrong organism (*Balantoides coli* → an ostracod
  arthropod). The supergroup translation (`parasiteTaxonomy.ts`) + curated
  `PARASITE_LINEAGES` fix this at display time. **Curated/override maps are keyed
  by the entered genus**, so a genus typo misses them — name spelling matters
  (the data still needs the genus corrected, e.g. Balantoides→Balantidium).
- The **"Fetch lineage" button only backfills *unplaced* rows** (no lineage or
  `matchType === "NONE"`); it will **not** re-pull an already-placed isolate.
  The only way to refresh a stale/placed lineage today is to edit + re-save the
  isolate (which re-runs the GBIF lookup). A "force re-fetch" is still an open
  possible next step.
- **Staining is one field.** The old separate `afb` column was folded into
  `gram` (values: `Positive / Negative / Variable / Acid-fast`); `afb` was
  dropped via `2026-06-25_merge_afb_into_gram.sql`.
