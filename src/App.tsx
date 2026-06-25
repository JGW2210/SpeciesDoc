import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { fetchLineage } from "./lib/gbif";
import type { Species, SpeciesDraft } from "./types";
import Header from "./components/Header";
import SetupBanner from "./components/SetupBanner";
import SpeciesForm from "./components/SpeciesForm";
import SpeciesList from "./components/SpeciesList";
import TreeView from "./components/TreeView";
import CustomView from "./components/CustomView";

type View = "list" | "tree" | "custom";

export default function App() {
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
      .from("species")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setSpecies((data ?? []) as Species[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Best-effort: fetch GBIF lineage for one isolate and cache it on the row.
  // Silently no-ops if the lineage column is missing or the lookup fails, so it
  // never blocks the core save.
  const enrichOne = useCallback(async (s: Species) => {
    if (!supabase) return;
    const lineage = await fetchLineage(s.genus, s.species, s.old_name);
    if (!lineage) return;
    const { data, error } = await supabase
      .from("species")
      .update({ lineage })
      .eq("id", s.id)
      .select()
      .single();
    if (!error && data) {
      setSpecies((prev) => prev.map((x) => (x.id === s.id ? (data as Species) : x)));
    }
  }, []);

  // Insert a new isolate or update the one being edited.
  const handleSubmit = useCallback(
    async (draft: SpeciesDraft, editingId: string | null) => {
      if (!supabase) throw new Error("Supabase is not configured.");

      if (editingId) {
        const { data, error } = await supabase
          .from("species")
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

      const { data, error } = await supabase.from("species").insert(draft).select().single();
      if (error) throw new Error(error.message);
      const saved = data as Species;
      setSpecies((prev) => [saved, ...prev]);
      setFormOpen(false);
      void enrichOne(saved);
    },
    [enrichOne],
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

  const handleEdit = useCallback((s: Species) => {
    setView("list"); // the form lives in List view
    setEditing(s);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!supabase) return;
      if (editing?.id === id) closeForm();
      const prev = species;
      setSpecies((s) => s.filter((x) => x.id !== id)); // optimistic
      const { error } = await supabase.from("species").delete().eq("id", id);
      if (error) {
        setLoadError(error.message);
        setSpecies(prev); // roll back
      }
    },
    [species, editing, closeForm],
  );

  return (
    <div className="shell">
      <Header count={species.length} />

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

      <main className={`layout${view !== "list" ? " layout--full" : ""}`}>
        {view === "list" && (
          <section className={`layout__form${formOpen ? " is-open" : ""}`}>
            <SpeciesForm
              onSubmit={handleSubmit}
              editing={editing}
              onCancelEdit={closeForm}
              disabled={!isSupabaseConfigured}
            />
          </section>
        )}
        <section className="layout__list">
          {view === "list" ? (
            <SpeciesList
              species={species}
              loading={loading}
              editingId={editing?.id ?? null}
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
            onClick={() => (formOpen ? closeForm() : setFormOpen(true))}
          >
            {formOpen ? "Close" : editing ? "Edit isolate" : "＋  Log an isolate"}
          </button>
        </div>
      )}

      <footer className="foot">
        <span>SpeciesDoc</span>
        <span className="foot__dot">·</span>
        <span>bench log</span>
      </footer>
    </div>
  );
}
