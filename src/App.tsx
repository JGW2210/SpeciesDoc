import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import type { Species, SpeciesDraft } from "./types";
import Header from "./components/Header";
import SetupBanner from "./components/SetupBanner";
import SpeciesForm from "./components/SpeciesForm";
import SpeciesList from "./components/SpeciesList";

export default function App() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Species | null>(null);
  // Controls the slide-up form sheet on mobile. Ignored on desktop, where the
  // form is always visible in the left column.
  const [formOpen, setFormOpen] = useState(false);

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

  // Insert a new isolate or update the one being edited.
  const handleSubmit = useCallback(async (draft: SpeciesDraft, editingId: string | null) => {
    if (!supabase) throw new Error("Supabase is not configured.");

    if (editingId) {
      const { data, error } = await supabase
        .from("species")
        .update(draft)
        .eq("id", editingId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      setSpecies((prev) => prev.map((s) => (s.id === editingId ? (data as Species) : s)));
      setEditing(null);
      setFormOpen(false);
      return;
    }

    const { data, error } = await supabase.from("species").insert(draft).select().single();
    if (error) throw new Error(error.message);
    setSpecies((prev) => [data as Species, ...prev]);
    setFormOpen(false);
  }, []);

  const handleEdit = useCallback((s: Species) => {
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

      <main className="layout">
        <section className={`layout__form${formOpen ? " is-open" : ""}`}>
          <SpeciesForm
            onSubmit={handleSubmit}
            editing={editing}
            onCancelEdit={closeForm}
            disabled={!isSupabaseConfigured}
          />
        </section>
        <section className="layout__list">
          <SpeciesList
            species={species}
            loading={loading}
            editingId={editing?.id ?? null}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </section>
      </main>

      {/* Mobile-only: dim the list behind the open sheet. */}
      <div
        className={`backdrop${formOpen ? " is-shown" : ""}`}
        onClick={closeForm}
        aria-hidden="true"
      />

      {/* Mobile-only: bottom bar to toggle the entry form. */}
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

      <footer className="foot">
        <span>SpeciesDoc</span>
        <span className="foot__dot">·</span>
        <span>bench log</span>
      </footer>
    </div>
  );
}
