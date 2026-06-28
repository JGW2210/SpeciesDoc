# SpeciesDoc — project summary

A bench tool for logging bacterial isolates and their biochemical test panels,
with a taxonomic tree view and a custom drag-and-drop board. Built with **Vite +
React + TypeScript** and **Supabase**. Deployed to **GitHub Pages** at
**https://jgw2210.github.io/SpeciesDoc**.

Use this file to resume work in a fresh session — it captures the architecture,
data model, conventions, and what's done / outstanding.

---

## Repo & workflow

- **GitHub repo:** `jgw2210/speciesdoc` (default branch `main`).
- **Working branch:** `claude/adoring-lovelace-h07m2w`. Develop here, open a PR
  into `main`, and merge. (This session has been merging each change as its own
  small PR — #1 through #25 so far.)
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

- React 18, Vite 5, TypeScript 5.
- `@supabase/supabase-js` for data.
- `d3-hierarchy`, `d3-shape`, `d3-polygon` for the radial tree.
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
- **`board`** — single row (`id = 'main'`) holding the Board view's layout as
  `data` jsonb. Shape in `src/lib/board.ts`.

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
  bacterial })` — `bacterial: false` (virus/parasite) skips the bacterial name
  corrections + Gram unplaced fallback and uses the raw GBIF lineage. GBIF's
  virus coverage is poor, so the virus config has **`lineageFor`** (→
  `src/lib/virusLineage.ts`, `VIRAL_LINEAGES`): a curated genus→ICTV-lineage map
  that **overrides GBIF** in `enrichOne` (applied on save and via "Fetch
  lineage"; matchType `"CURATED"`) **and at display time** in `TreeView` (so
  rows cached before the map — or via GBIF, which lacks realm — still render the
  curated lineage without a re-fetch). Extend the map as more virus genera are
  logged. The Lineage type carries **`realm`** (viruses); the **detailed
  dendrogram** for non-bacterial domains folds in the full available ICTV chain
  (realm → kingdom → phylum → class → order → family → genus), skipping absent
  ranks — so taxa classified only at realm + family (e.g. Deltavirus →
  Ribozyviria → Kolmioviridae) still place. Lean radial/outline use the best
  available top rank (phylum → kingdom → realm). `genusKeys` is built with the
  same `detailed` flag as its view so collapse keys line up.
- Switching domains remounts the main content (`<main key={domainId}>`) so each
  section's form/board/tree state is fresh; the active table is reloaded.

## App architecture

`src/App.tsx` owns the active **domain**, the specimen list (load/insert/update/
delete on `config.table`), the GBIF lineage enrichment, and the **view toggle**:
`list | tree | custom`. The entry form (`SpeciesForm`) shows only in List view
(left column on desktop; a slide-up bottom-sheet on mobile). Tree and Board are
full-width.

### Key files

- `src/types.ts` — `Species`, `SpeciesDraft` (form fields; excludes
  `id/created_at/lineage`), `TestKey` (test columns; excludes name fields),
  `Lineage`.
- `src/data/categories.ts` — **single source of truth** for the test panel.
  `CATEGORIES` (each: key, label, short, type, options/hint), `CATEGORY_BY_KEY`,
  `CATEGORY_GROUPS` (collapsible form sections: Staining, Microscopy &
  morphology, Key enzymes, Biochemical & metabolism, Culture, Notes),
  `DEFAULT_OPEN_GROUPS`. Field `type`s: `sign` (+/−/variable segmented), `gram`,
  `haemolysis` (α/β/γ), `of` (O/F), `choice` (grouped chips, e.g. motility),
  `text`, `textarea`. Adding a test here makes it flow into the form, the card
  readout, and the ID filter automatically — only the DB column + `types.ts`
  need separate edits.
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
  box, and the shared detail drawer (click a tip → lineage breadcrumb + readout +
  edit). Topology is `buildTaxonomy` (in `lib/taxonomy.ts`) → phylum → (class,
  Proteobacteria only, for α/β/γ) → genus → isolate. The two SVG layouts share
  interaction logic via the `useTreeNav` hook (collapse overrides, focus/re-root,
  pan/zoom), the `useFit` search-fit effect, and the `TreeControls` component
  (breadcrumb + Expand/Collapse all + Reset view/layout).
  - **`RadialTree`** — the original floating radial layout: phylum hulls (convex
    blobs), greek class tags, gentle float animation; click a hull label/greek tag
    to focus.
  - **`Dendrogram`** (in the same file) — a horizontal rectangular cladogram
    (root at left, orthogonal "elbow" branches fanning right, species labels down
    the right edge; rank labels on the left-side internal nodes). Uses the
    **detailed topology** — `buildTaxonomy(species, true)` inserts a class (every
    phylum) + order layer (phylum → class → order → genus → isolate); the radial
    and outline keep the lean default. Order labels are display-only. d3 `cluster`
    projected to cartesian, then each node's horizontal is re-set by **taxonomic
    rank** (shared columns for realm/kingdom/phylum/… ) rather than tree depth, so
    rank-skipping lineages (e.g. Deltavirus realm→family) still align — the elbow
    link spans the gap. **Pan + wheel/pinch zoom** (d3-zoom); **click a
    phylum/class label to focus** (re-root) with a breadcrumb to step back;
    **Expand all / Collapse all / Reset view / Reset layout**; genera
    auto-collapse at ≥3 isolates ("Genus spp.") with a "−" handle; search
    highlights matches, dims the rest, and fits the view to them. Tips are
    keyboard-activatable.
  - **`OutlineTree`** (`components/OutlineTree.tsx`) — an indented, collapsible,
    keyboard/ARIA-friendly tree; search filters to matching branches.
  - An **Unplaced** list (GBIF matchType NONE) sits under the tree. Uses
    `d3-zoom` + `d3-selection`.
- `src/lib/gbif.ts` — `fetchLineage(genus, species, oldName?)`: matches against
  the GBIF backbone (browser-side; GBIF allows CORS). Tries the current name,
  falls back to `old_name` if it can't be placed.
- `src/lib/taxonomy.ts` — `buildTaxonomy`, plus three display-time normalisers
  applied to the **cached** GBIF lineage (so existing rows are corrected without
  a re-fetch or DB change):
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
  Claude-Session: https://claude.ai/code/session_01K6AAGAwXJEHQ4gqynRT3qH
  ```
- PRs end with the standard "Generated with Claude Code" line.
- Each feature ships as its own small PR, merged into `main`.
- When adding a DB column the app writes on insert (a test, `old_name`, etc.),
  ship a migration and tell the user to run it — until then inserts fail.

## Outstanding / possible next steps

- Touch-friendly drag-and-drop on the Board (current DnD is native HTML5, so
  mobile dragging is limited).
- Reorder chips within a zone; move subcategories between categories.
- Tree: zoom/pan for large trees; tune the genus auto-collapse threshold (3).
- A **"force re-fetch lineage"** action for already-placed rows (current backfill
  skips them), to repair stale GBIF caches without editing + re-saving.
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
- The **"Fetch lineage" button only backfills *unplaced* rows** (no lineage or
  `matchType === "NONE"`); it will **not** re-pull an already-placed isolate.
  The only way to refresh a stale/placed lineage today is to edit + re-save the
  isolate (which re-runs the GBIF lookup). A "force re-fetch" is still an open
  possible next step.
- **Staining is one field.** The old separate `afb` column was folded into
  `gram` (values: `Positive / Negative / Variable / Acid-fast`); `afb` was
  dropped via `2026-06-25_merge_afb_into_gram.sql`.
