import { useCallback, useEffect, useState } from "react";
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
      const targets = species.filter((s) => !s.lineage || s.lineage.matchType === "NONE");
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
    setLoading(isSupabaseConfigured);
  }, []);

  return (
    <DomainProvider config={config}>
    <div className="shell">
      <Header count={species.length} config={config} />

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
              species={species}
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
              species={species}
              loading={loading}
              editingId={editing?.id ?? null}
              currentUserId={currentUserId}
              ownerNames={ownerNames}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : view === "tree" ? (
            <TreeView
              species={species}
              enriching={enriching}
              onRefreshLineage={refreshLineage}
              onEdit={handleEdit}
            />
          ) : (
            <CustomView species={species} onEdit={handleEdit} />
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
