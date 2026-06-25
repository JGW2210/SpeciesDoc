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
  `gram, afb, oxidase, catalase, indole, fermentation, distinctive_shape,
  motility, haemolysis, coagulase, aesculin, pyr_pyz, spores, dnase, tributyrin,
  hugh_leifson_of, atmosphere, methyl_red, voges_proskauer, citrate,
  other_notes`.
- **`board`** — single row (`id = 'main'`) holding the Board view's layout as
  `data` jsonb. Shape in `src/lib/board.ts`.

## App architecture

`src/App.tsx` owns the species list (load/insert/update/delete), the GBIF
lineage enrichment, and the **view toggle**: `list | tree | custom`. The entry
form (`SpeciesForm`) shows only in List view (left column on desktop; a slide-up
bottom-sheet on mobile). Tree and Board are full-width.

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
- `src/components/SpeciesList.tsx` — grouped by Gram band (positive / negative /
  variable & untyped). Name search, **ID filter** (date-added presets + custom
  range, plus per-test value filters), **Collapse all / Expand all** (name-only
  cards), **Sort: Newest / A–Z**.
- `src/components/SpeciesCard.tsx` — one isolate; collapsible to name-only via a
  chevron; date sits at the card's bottom-right; Edit/Delete (inline confirm).
- `src/components/Readout.tsx` — shared test-chip readout (used by the card and
  the board chips).
- `src/components/TreeView.tsx` — D3 radial taxonomy. `buildTaxonomy` (in
  `lib/taxonomy.ts`) → phylum → (class, Proteobacteria only, for α/β/γ/ε) →
  genus → isolate. Phylum hulls (convex blobs) with labels, gentle float
  animation, click a tip → detail drawer (lineage breadcrumb + readout + edit).
  Collapsible: genus auto-collapses at ≥3 isolates ("Genus spp. (n)"); phyla
  (click hull label) and classes (click greek tag) collapse too; "−" handle on
  genera; counts stay upright; "Reset layout". An **Unplaced** list (GBIF
  matchType NONE) sits under the tree.
- `src/lib/gbif.ts` — `fetchLineage(genus, species, oldName?)`: matches against
  the GBIF backbone (browser-side; GBIF allows CORS). Tries the current name,
  falls back to `old_name` if it can't be placed.
- `src/lib/taxonomy.ts` — `buildTaxonomy`, and `modernPhylum()` which maps GBIF's
  pre-2021 phylum names to current ICNP names (Firmicutes→Bacillota,
  Proteobacteria→Pseudomonadota, Actinobacteriota→Actinomycetota, etc.) and
  strips GTDB suffixes (`Firmicutes_A` → Bacillota).
- `src/components/CustomView.tsx` — the **Board**. User-defined categories →
  subcategories (`src/lib/board.ts` types). Add/rename/delete categories &
  subs, custom colours (swatch picker), collapsible. Drag isolates from a
  searchable palette into category-level or subcategory drop zones; move/remove
  them; categorised chips expand to show the readout (capped width, wraps in
  rows); board-wide Expand/Collapse all. **Drag handles (⠿)** reorder categories
  and reorder subcategories within a category. Deleting a category asks for
  confirmation. Persists to the `board` table (debounced + flush on unmount;
  shows Saving…/Saved/Couldn't-save).
- `src/lib/format.ts` — `binomial()`, Gram grouping, `polarityOf()`.

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
- Optional: confirm on subcategory delete; CSV export of a filtered view.
- Auth / per-user data if it ever stops being a personal single-user log.

## Important caveats to remember

- The tree is a **taxonomy** (rank-based topology), not a molecular phylogeny —
  no branch lengths or bootstrap values (that data doesn't exist here).
- Modern names are primary and shown everywhere; the old/synonym name appears
  only on the tree detail card and is used for the GBIF fallback lookup.
