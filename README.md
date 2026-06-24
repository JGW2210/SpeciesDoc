# SpeciesDoc

A bench log for recording bacterial isolates and their biochemical test panels.
Enter a genus and species, mark off the standard identification tests (Gram,
oxidase, catalase, indole, and the rest), and browse everything you've logged —
grouped by Gram reaction the way you'd actually sort a bench.

Built with **Vite + React + TypeScript** and **Supabase** for storage.

## Features

- Log an isolate by **genus + species**, shown in correct binomial form.
- Full identification panel: Gram, Oxidase, Catalase, Indole, Fermentation,
  Distinctive shape, Haemolysis, Coagulase, Aesculin, PYR / PYZ, Spores, DNase,
  Tributyrin, Hugh & Leifson O/F, Atmosphere, Methyl red, Voges-Proskauer,
  Citrate, and free-text Other notes.
- Quick `+ / − / variable` toggles for biochemical tests, α/β/γ for haemolysis,
  and suggestion chips for the descriptive fields.
- Main view groups saved isolates into **Gram-positive / Gram-negative /
  variable & untyped** bands, with a per-isolate test readout and expandable
  notes. Filter by name.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project and table

1. Make a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the
   `species` table and an open Row Level Security policy suitable for a personal,
   single-user log.

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

The schema ships with an **open** RLS policy: anyone with the public anon key
(i.e. anyone who can load the app) can read and write rows. That's intentional
for a personal bench log. If you deploy this somewhere public or want
per-user data, add [Supabase Auth](https://supabase.com/docs/guides/auth) and
replace the policy in `supabase/schema.sql` with one scoped to `auth.uid()`.

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
