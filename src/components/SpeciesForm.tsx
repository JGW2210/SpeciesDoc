import { useEffect, useState } from "react";
import { CATEGORIES } from "../data/categories";
import type { Category } from "../data/categories";
import type { Species, SpeciesDraft, TestKey } from "../types";
import { binomial } from "../lib/format";

const EMPTY: SpeciesDraft = {
  genus: "",
  species: "",
  gram: null,
  oxidase: null,
  catalase: null,
  indole: null,
  fermentation: null,
  distinctive_shape: null,
  haemolysis: null,
  coagulase: null,
  aesculin: null,
  pyr_pyz: null,
  spores: null,
  dnase: null,
  tributyrin: null,
  hugh_leifson_of: null,
  atmosphere: null,
  methyl_red: null,
  voges_proskauer: null,
  citrate: null,
  other_notes: null,
};

// Strip the server-managed fields so an existing row can seed the form.
function toDraft(s: Species): SpeciesDraft {
  const { id: _id, created_at: _created, ...rest } = s;
  return rest;
}

interface SpeciesFormProps {
  onSubmit: (draft: SpeciesDraft, editingId: string | null) => Promise<void>;
  editing: Species | null;
  onCancelEdit: () => void;
  disabled?: boolean;
}

export default function SpeciesForm({ onSubmit, editing, onCancelEdit, disabled }: SpeciesFormProps) {
  const [draft, setDraft] = useState<SpeciesDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the selected row into the form when entering edit mode; clear on exit.
  useEffect(() => {
    setDraft(editing ? toDraft(editing) : EMPTY);
    setError(null);
  }, [editing]);

  const isEditing = !!editing;

  const set = (key: keyof SpeciesDraft, value: string | null) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Click a selected chip again to clear it.
  const toggle = (key: TestKey, value: string) =>
    setDraft((d) => ({ ...d, [key]: d[key] === value ? null : value }));

  const canSave = draft.genus.trim() !== "" && draft.species.trim() !== "" && !disabled && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(
        { ...draft, genus: draft.genus.trim(), species: draft.species.trim() },
        editing?.id ?? null,
      );
      if (!isEditing) setDraft(EMPTY); // keep edits visible until parent clears editing
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save. Check the connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const preview = binomial(draft.genus, draft.species);

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form__head">
        <h2 className="form__title">{isEditing ? "Edit isolate" : "Log an isolate"}</h2>
        <p className="form__preview" aria-live="polite">
          {preview ? <em>{preview}</em> : <span className="form__preview--empty">Genus species</span>}
        </p>
      </div>

      {isEditing && (
        <p className="form__editing">
          Editing <em>{binomial(editing.genus, editing.species)}</em> — change anything and update.
        </p>
      )}

      <div className="form__name">
        <label className="field">
          <span className="field__label">Genus</span>
          <input
            className="field__input"
            value={draft.genus}
            onChange={(e) => set("genus", e.target.value)}
            placeholder="Staphylococcus"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Species</span>
          <input
            className="field__input"
            value={draft.species}
            onChange={(e) => set("species", e.target.value)}
            placeholder="aureus"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
      </div>

      <fieldset className="form__panel">
        <legend className="form__panel-legend">Test panel</legend>
        <div className="form__grid">
          {CATEGORIES.map((cat) => (
            <Field
              key={cat.key}
              cat={cat}
              value={draft[cat.key]}
              onSelect={(v) => toggle(cat.key, v)}
              onText={(v) => set(cat.key, v === "" ? null : v)}
            />
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={!canSave}>
          {saving
            ? isEditing
              ? "Updating…"
              : "Saving…"
            : isEditing
              ? "Update isolate"
              : "Save isolate"}
        </button>
        {isEditing ? (
          <button type="button" className="btn btn--ghost" onClick={onCancelEdit} disabled={saving}>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setDraft(EMPTY)}
            disabled={saving}
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}

interface FieldProps {
  cat: Category;
  value: string | null;
  onSelect: (value: string) => void;
  onText: (value: string) => void;
}

function Field({ cat, value, onSelect, onText }: FieldProps) {
  const isText = cat.type === "text" || cat.type === "textarea";
  const wide = cat.type === "textarea";

  return (
    <div className={`tfield${wide ? " tfield--wide" : ""}`}>
      <div className="tfield__label">{cat.label}</div>

      {!isText && cat.options && (
        <div className="seg" role="group" aria-label={cat.label}>
          {cat.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`seg__btn seg__btn--${cat.type}${value === opt.value ? " is-on" : ""}`}
              aria-pressed={value === opt.value}
              title={opt.title ?? opt.value}
              onClick={() => onSelect(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {cat.type === "text" && (
        <>
          <input
            className="tfield__input"
            value={value ?? ""}
            onChange={(e) => onText(e.target.value)}
            placeholder={cat.suggestions?.[0] ?? "—"}
            autoComplete="off"
          />
          {cat.suggestions && (
            <div className="chips">
              {cat.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chips__pick"
                  onClick={() => onText(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {cat.type === "textarea" && (
        <textarea
          className="tfield__textarea"
          value={value ?? ""}
          onChange={(e) => onText(e.target.value)}
          placeholder={cat.hint ?? "Notes…"}
          rows={3}
        />
      )}

      {cat.hint && !isText && <p className="tfield__hint">{cat.hint}</p>}
    </div>
  );
}
