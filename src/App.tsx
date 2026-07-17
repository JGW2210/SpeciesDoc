import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { useAuth } from "./lib/auth";
import { fetchLineage } from "./lib/gbif";
import { DomainProvider, DOMAINS, BACTERIA, type DomainId } from "./domains";
import type { Species, SpeciesDraft } from "./types";
import Header from "./components/Header";
import AuthPanel from "./components/AuthPanel";
import SetupBanner from "./components/SetupBanner";
import SpeciesForm from "./components/SpeciesForm";
import SpeciesList from "./components/SpeciesList";
import TreeView from "./components/TreeView";
import CustomView from "./components/CustomView";

type View = "list" | "tree" | "custom";

// Public label for an owner id, drawn from the public `profiles` table.
export type OwnerNames = Record<string, string>;

// Contributor-filter sentinels: "" = everyone, this = rows with no owner.
const ALL_OWNERS = "";
const UNATTRIBUTED = "__none__";

// Filter a list of organisms by an owner sentinel/id.
function filterByOwner(list: Species[], owner: string): Species[] {
  if (owner === ALL_OWNERS) return list;
  if (owner === UNATTRIBUTED) return list.filter((s) => !s.owner);
  return list.filter((s) => s.owner === owner);
}

export default function App() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  // Editing is gated on being signed in (writes are also enforced by RLS).
  const canEdit = !!user && isSupabaseConfigured;
  const [ownerNames, setOwnerNames] = useState<OwnerNames>({});
  const [domainId, setDomainId] = useState<DomainId>("bacteria");
  const config = DOMAINS.find((d) => d.id === domainId) ?? BACTERIA;
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Species | null>(null);
  // Controls the slide-up form sheet on mobile. Ignored on desktop, where the
  // form is always visible in the left column.
  const [formOpen, setFormOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [enriching, setEnriching] = useState(false);
  // Which contributor's entries to show. null = use the default, which is the
  // signed-in user's own list (or everyone, for a signed-out guest). A non-null
  // value is an explicit pick from the dropdown.
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  // Board view has two independent pickers: which board to display, and which
  // contributor's organisms fill the draggable palette. null = use the default.
  const [boardOwnerFilter, setBoardOwnerFilter] = useState<string | null>(null);
  const [poolOwnerFilter, setPoolOwnerFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setSpecies((data ?? []) as Species[]);
    }
    setLoading(false);
  }, [config.table]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load the public owner labels once so cards can show who logged each row.
  // display_name wins; otherwise fall back to the part of the email before "@".
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, email, display_name");
      if (!active || !data) return;
      const map: OwnerNames = {};
      for (const p of data as { id: string; email: string | null; display_name: string | null }[]) {
        map[p.id] = p.display_name?.trim() || p.email?.split("@")[0] || "someone";
      }
      setOwnerNames(map);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Contributor options for the dropdowns: "My entries" when signed in, then
  // every other contributor that has rows in this list. (No "All contributors" —
  // each view shows exactly one contributor's data to avoid noisy overlap.)
  const ownerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of species) {
      const key = s.owner ?? UNATTRIBUTED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const opts: { value: string; label: string; count: number }[] = [];
    if (currentUserId) {
      opts.push({ value: currentUserId, label: "My entries", count: counts.get(currentUserId) ?? 0 });
    }
    for (const [key, n] of counts) {
      if (key === currentUserId) continue; // already shown as "My entries"
      opts.push({
        value: key,
        label: key === UNATTRIBUTED ? "Unattributed" : ownerNames[key] ?? "Unknown user",
        count: n,
      });
    }
    return opts;
  }, [species, ownerNames, currentUserId]);

  // Selectable boards for the Board dropdown: your own first, then every other
  // contributor that has organisms (a proxy for "users who may have a board").
  const boardOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (currentUserId) opts.push({ value: currentUserId, label: "My board" });
    for (const o of ownerOptions) {
      if (o.value === UNATTRIBUTED || o.value === currentUserId) continue;
      opts.push({ value: o.value, label: o.label });
    }
    return opts;
  }, [ownerOptions, currentUserId]);

  // Default contributor when nothing is explicitly picked: your own data when
  // signed in, otherwise the first available contributor (guests have no "own").
  const fallbackOwner = currentUserId ?? ownerOptions[0]?.value ?? ALL_OWNERS;
  const effectiveOwner = ownerFilter ?? fallbackOwner;
  const poolViewOwner = poolOwnerFilter ?? fallbackOwner;
  const boardViewOwner =
    boardOwnerFilter !== null ? boardOwnerFilter : currentUserId ?? boardOptions[0]?.value ?? null;

  // The rows shown in the List and Tree, after the "Viewing" contributor filter.
  const visibleSpecies = useMemo(
    () => filterByOwner(species, effectiveOwner),
    [species, effectiveOwner],
  );

  // The organisms shown in the Board palette, after the "Organisms" filter.
  const boardPoolSpecies = useMemo(
    () => filterByOwner(species, poolViewOwner),
    [species, poolViewOwner],
  );

  // The signed-in user's own rows — used for duplicate detection in the form, so
  // logging a name only clashes with your own list, not other people's.
  const mySpecies = useMemo(
    () => (currentUserId ? species.filter((s) => s.owner === currentUserId) : []),
    [species, currentUserId],
  );

  // Best-effort: fetch GBIF lineage for one isolate and cache it on the row.
  // Silently no-ops if the lineage column is missing or the lookup fails, so it
  // never blocks the core save.
  const enrichOne = useCallback(async (s: Species) => {
    if (!supabase) return;
    // A curated lineage (e.g. for viruses GBIF can't place) takes priority and
    // skips the network lookup; otherwise fall back to GBIF.
    const override = config.lineageFor?.(s.genus, s.species) ?? null;
    const lineage = override ?? (await fetchLineage(s.genus, s.species, s.old_name));
    if (!lineage) return;
    const { data, error } = await supabase
      .from(config.table)
      .update({ lineage })
      .eq("id", s.id)
      .select()
      .single();
    if (!error && data) {
      setSpecies((prev) => prev.map((x) => (x.id === s.id ? (data as Species) : x)));
    }
  }, [config.table]);

  // Insert a new isolate or update the one being edited.
  const handleSubmit = useCallback(
    async (draft: SpeciesDraft, editingId: string | null) => {
      if (!supabase) throw new Error("Supabase is not configured.");

      if (editingId) {
        const { data, error } = await supabase
          .from(config.table)
          .update(draft)
          .eq("id", editingId)
          .select()
          .single();
        if (error) throw new Error(error.message);
        const saved = data as Species;
        setSpecies((prev) => prev.map((s) => (s.id === editingId ? saved : s)));
        setEditing(null);
        setFormOpen(false);
        void enrichOne(saved); // refresh lineage in case the name changed
        return;
      }

      const { data, error } = await supabase.from(config.table).insert(draft).select().single();
      if (error) throw new Error(error.message);
      const saved = data as Species;
      setSpecies((prev) => [saved, ...prev]);
      setFormOpen(false);
      void enrichOne(saved);
    },
    [enrichOne, config.table],
  );

  // Backfill lineage for every isolate that doesn't have a match yet.
  const refreshLineage = useCallback(async () => {
    setEnriching(true);
    try {
      // Re-fetch anything without a usable placement: no lineage, an explicit
      // NONE, or a match GBIF returned without a phylum. The last case lets a
      // curated override (lineageFor) reach rows GBIF placed only to a higher
      // rank, which a NONE-only filter would skip.
      const targets = species.filter(
        (s) => !s.lineage || s.lineage.matchType === "NONE" || !s.lineage.phylum,
      );
      for (const s of targets) {
        await enrichOne(s);
      }
    } finally {
      setEnriching(false);
    }
  }, [species, enrichOne]);

  const handleEdit = useCallback(
    (s: Species) => {
      // You can only edit your own organisms. Clicking another person's row
      // (e.g. from the Board or Tree) is a no-op rather than opening a form that
      // the database would reject on save.
      if (!currentUserId || s.owner !== currentUserId) return;
      setView("list"); // the form lives in List view
      setEditing(s);
      setFormOpen(true);
    },
    [currentUserId],
  );

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!supabase || !currentUserId) return;
      // Only owned rows can be deleted (also enforced by RLS).
      if (species.find((x) => x.id === id)?.owner !== currentUserId) return;
      if (editing?.id === id) closeForm();
      const prev = species;
      setSpecies((s) => s.filter((x) => x.id !== id)); // optimistic
      const { error } = await supabase.from(config.table).delete().eq("id", id);
      if (error) {
        setLoadError(error.message);
        setSpecies(prev); // roll back
      }
    },
    [species, editing, closeForm, config.table, currentUserId],
  );

  // Switch section: clear current state and let the load effect refill.
  const switchDomain = useCallback((id: DomainId) => {
    setDomainId(id);
    setEditing(null);
    setView("list");
    setFormOpen(false);
    setSpecies([]);
    setOwnerFilter(null); // back to the default (your own list) for the new section
    setBoardOwnerFilter(null);
    setPoolOwnerFilter(null);
    setLoading(isSupabaseConfigured);
  }, []);

  return (
    <DomainProvider config={config}>
    <div className="shell">
      <Header
        count={view === "custom" ? boardPoolSpecies.length : visibleSpecies.length}
        config={config}
      />

      <AuthPanel />

      <div className="domainbar" role="tablist" aria-label="Section">
        {DOMAINS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={domainId === d.id}
            className={`domainbar__btn${domainId === d.id ? " is-on" : ""}`}
            onClick={() => switchDomain(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {view === "custom"
        ? (boardOptions.length > 0 || ownerOptions.length > 1) && (
            <div className="ownerbar">
              {boardOptions.length > 0 && (
                <>
                  <label className="ownerbar__label" htmlFor="board-filter">
                    Board
                  </label>
                  <select
                    id="board-filter"
                    className="ownerbar__select"
                    value={boardViewOwner ?? ""}
                    onChange={(e) => setBoardOwnerFilter(e.target.value)}
                  >
                    {boardOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {/* The organisms picker only matters when editing your own board. */}
              {boardViewOwner && boardViewOwner === currentUserId && ownerOptions.length > 1 && (
                <>
                  <label className="ownerbar__label" htmlFor="pool-filter">
                    Organisms
                  </label>
                  <select
                    id="pool-filter"
                    className="ownerbar__select"
                    value={poolViewOwner}
                    onChange={(e) => setPoolOwnerFilter(e.target.value)}
                  >
                    {ownerOptions.map((o) => (
                      <option key={o.value || "all"} value={o.value}>
                        {o.label} ({o.count})
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )
        : ownerOptions.length > 1 && (
            <div className="ownerbar">
              <label className="ownerbar__label" htmlFor="owner-filter">
                Viewing
              </label>
              <select
                id="owner-filter"
                className="ownerbar__select"
                value={effectiveOwner}
                onChange={(e) => setOwnerFilter(e.target.value)}
              >
                {ownerOptions.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
            </div>
          )}

      {!isSupabaseConfigured && <SetupBanner />}

      {loadError && (
        <p className="form__error" role="alert">
          Couldn’t reach the database: {loadError}
        </p>
      )}

      <div className="viewbar" role="tablist" aria-label="View">
        <button
          type="button"
          role="tab"
          aria-selected={view === "list"}
          className={`viewbar__btn${view === "list" ? " is-on" : ""}`}
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "tree"}
          className={`viewbar__btn${view === "tree" ? " is-on" : ""}`}
          onClick={() => setView("tree")}
        >
          Tree
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "custom"}
          className={`viewbar__btn${view === "custom" ? " is-on" : ""}`}
          onClick={() => setView("custom")}
        >
          Board
        </button>
      </div>

      <main key={domainId} className={`layout${view !== "list" ? " layout--full" : ""}`}>
        {view === "list" && (
          <section className={`layout__form${formOpen ? " is-open" : ""}`}>
            <SpeciesForm
              onSubmit={handleSubmit}
              editing={editing}
              species={mySpecies}
              onEditExisting={handleEdit}
              onCancelEdit={closeForm}
              disabled={!canEdit}
              signedOut={!user}
            />
          </section>
        )}
        <section className="layout__list">
          {view === "list" ? (
            <SpeciesList
              species={visibleSpecies}
              loading={loading}
              editingId={editing?.id ?? null}
              currentUserId={currentUserId}
              ownerNames={ownerNames}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : view === "tree" ? (
            <TreeView
              species={visibleSpecies}
              enriching={enriching}
              onRefreshLineage={refreshLineage}
              onEdit={handleEdit}
            />
          ) : (
            <CustomView
              species={species}
              poolSpecies={boardPoolSpecies}
              viewOwner={boardViewOwner}
              ownerLabel={boardViewOwner ? ownerNames[boardViewOwner] ?? null : null}
              onEdit={handleEdit}
            />
          )}
        </section>
      </main>

      {/* Mobile-only: dim the list behind the open sheet (List view only). */}
      {view === "list" && (
        <div
          className={`backdrop${formOpen ? " is-shown" : ""}`}
          onClick={closeForm}
          aria-hidden="true"
        />
      )}

      {/* Mobile-only: bottom bar to toggle the entry form (List view only). */}
      {view === "list" && (
        <div className="mobilebar">
          <button
            type="button"
            className="mobilebar__btn"
            aria-expanded={formOpen}
            disabled={!canEdit}
            onClick={() => (formOpen ? closeForm() : setFormOpen(true))}
          >
            {!canEdit
              ? "Sign in to add"
              : formOpen
                ? "Close"
                : editing
                  ? `Edit ${config.noun}`
                  : `＋  Add ${config.noun}`}
          </button>
        </div>
      )}

      <footer className="foot">
        <span>SpeciesDoc</span>
        <span className="foot__dot">·</span>
        <span>bench log</span>
      </footer>
    </div>
    </DomainProvider>
  );
}
