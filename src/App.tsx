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

  const handleSubmit = useCallback(async (draft: SpeciesDraft) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.from("species").insert(draft).select().single();
    if (error) throw new Error(error.message);
    setSpecies((prev) => [data as Species, ...prev]);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!supabase) return;
    const prev = species;
    setSpecies((s) => s.filter((x) => x.id !== id)); // optimistic
    const { error } = await supabase.from("species").delete().eq("id", id);
    if (error) {
      setLoadError(error.message);
      setSpecies(prev); // roll back
    }
  }, [species]);

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
        <section className="layout__form">
          <SpeciesForm onSubmit={handleSubmit} disabled={!isSupabaseConfigured} />
        </section>
        <section className="layout__list">
          <SpeciesList species={species} loading={loading} onDelete={handleDelete} />
        </section>
      </main>

      <footer className="foot">
        <span>SpeciesDoc</span>
        <span className="foot__dot">·</span>
        <span>bench log</span>
      </footer>
    </div>
  );
}
