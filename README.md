# SpeciesDoc

A bench log for recording bacterial isolates and their biochemical test panels.
Enter a genus and species, mark off the standard identification tests (Gram,
oxidase, catalase, indole, and the rest), and browse everything you've logged —
grouped by Gram reaction the way you'd actually sort a bench.

Built with **Vite + React + TypeScript** and **Supabase** for storage.

## Features

- Log an isolate by **genus + species**, shown in correct binomial form.
- Full identification panel: Gram, Oxidase, Catalase, Indole, Fermentation,
  Distinctive shape, Motility, Haemolysis, Coagulase, Aesculin, PYR / PYZ,
  Spores, DNase, Tributyrin, Hugh & Leifson O/F, Atmosphere, Methyl red,
  Voges-Proskauer, Citrate, and free-text Other notes.
- Quick `+ / − / variable` toggles for biochemical tests, α/β/γ for haemolysis,
  and suggestion chips for the descriptive fields.
- Main view groups saved isolates into **Gram-positive / Gram-negative /
  variable & untyped** bands, with a per-isolate test readout and expandable
  notes. Filter by name, ID characteristics, and date added.
- **Tree view** (toggle next to List): a floating radial **taxonomic tree** of
  your isolates with shaded phylum hulls (α/β/γ/ε for Proteobacteria) and
  clickable tips. Lineage is fetched from the free **GBIF** backbone taxonomy on
  save and cached; a "Fetch lineage" button backfills existing rows. Branches
  encode taxonomic rank, not evolutionary distance.
- **Board view** (toggle next to List/Tree): build your own collapsible
  categories and subcategories with custom names and colours, then drag isolates
  in from the palette to arrange them however you like. Saved to a `board` table.
- **Accounts**: anyone can browse every logged organism without signing in, but
  adding and editing requires an account (email + password via Supabase Auth).
  Each organism is owned by whoever logged it — you can only edit or delete your
  own, enforced at the database level by Row Level Security. The Board layout is
  private per account.
- Modern names are primary and shown on the tree; phylum names are modernised
  for display (e.g. Actinobacteriota → Actinomycetota). An optional **old name /
  synonym** can be recorded per isolate — it's used as a fallback for the GBIF
  lookup (whose backbone often only knows the former name) and shown on the
  tree's detail card.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project and table

1. Make a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the
   `species`, `viruses`, `parasites`, `board`, and `profiles` tables with
   **public-read / owner-only-write** Row Level Security, plus a trigger that
   creates a profile row on signup.

   > Upgrading an existing project that used the old open-access schema? Run
   > [`supabase/migrations/2026-06-29_add_auth_ownership.sql`](./supabase/migrations/2026-06-29_add_auth_ownership.sql)
   > instead — it adds ownership and the new policies without dropping your data.
3. **Enable email auth**: in the dashboard, **Authentication → Providers →
   Email** is on by default. For a quick start you can turn off "Confirm email"
   under **Authentication → Sign In / Providers** so accounts work immediately;
   leave it on for production so addresses are verified.

### 3. Add your credentials

```bash
cp .env.example .env
```

Then edit `.env` and fill in the two values from your Supabase dashboard
(**Project Settings → API**):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

The anon key is designed to be used in browser apps — access is governed by the
RLS policy. `.env` is gitignored so nothing secret is committed. Until these are
set, the app runs but shows a setup banner and saving is disabled.

### 4. Run it

```bash
npm run dev      # start the dev server
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

## A note on security

The Supabase **URL** and **publishable/anon key** in `src/config.ts` are *not*
secrets — they are designed to ship in the browser bundle, and access is gated
by Row Level Security on the database. Never put the `service_role` /
`sb_secret_...` key in client code or the repo.

Security is enforced by RLS, not by hiding the anon key:

- **Reads are public.** Anyone, signed in or not, can view every list and
  organism.
- **Writes are owner-only.** Inserting, editing, or deleting a row requires
  being signed in, and the row's `owner` must equal `auth.uid()`. The browser
  cannot mutate another user's data even though it holds the public key.

To claim organisms logged before auth was added, see the note at the bottom of
[`supabase/migrations/2026-06-29_add_auth_ownership.sql`](./supabase/migrations/2026-06-29_add_auth_ownership.sql).

## Deploying to GitHub Pages

The repo includes a workflow (`.github/workflows/deploy.yml`) that builds the app
and publishes it on every push to `main`. Vite is configured to serve from the
`/SpeciesDoc/` subpath in production, so the site lives at
**https://jgw2210.github.io/SpeciesDoc**.

One-time setup: in the GitHub repo, go to **Settings → Pages** and set
**Source** to **GitHub Actions**. After the next push to `main` (or a manual run
of the "Deploy to GitHub Pages" workflow), the site goes live. The deployed app
uses the committed Supabase values in `src/config.ts`, so no extra secrets are
needed.

## Project layout

```
src/
  data/categories.ts   the test panel, defined once and driving form + cards
  lib/supabase.ts      Supabase client (null until configured)
  lib/format.ts        Gram grouping, result polarity, binomial casing
  components/          Header, SpeciesForm, SpeciesList, SpeciesCard, …
  App.tsx              load / insert / delete wiring
supabase/schema.sql    the database table + RLS policy
```
