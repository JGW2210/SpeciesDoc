import { useEffect, useState } from "react";
import { CATEGORY_BY_KEY, CATEGORY_GROUPS, DEFAULT_OPEN_GROUPS } from "../data/categories";
import type { Category, QuickOption } from "../data/categories";
import type { Species, SpeciesDraft, TestKey } from "../types";
import { binomial } from "../lib/format";

const hasValue = (v: string | null | undefined) => v != null && String(v).trim() !== "";

// Bucket options by their `group`, preserving first-seen order of both groups
// and options. Options without a group fall under "".
function groupOptions(options: QuickOption[]): [string, QuickOption[]][] {
  const order: string[] = [];
  const map = new Map<string, QuickOption[]>();
  for (const opt of options) {
    const g = opt.group ?? "";
    if (!map.has(g)) {
      map.set(g, []);
      order.push(g);
    }
    map.get(g)!.push(opt);
  }
  return order.map((g) => [g, map.get(g)!]);
}

const EMPTY: SpeciesDraft = {
  genus: "",
  species: "",
  gram: null,
  oxidase: null,
  catalase: null,
  indole: null,
  fermentation: null,
  distinctive_shape: null,
  motility: null,
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
  const { id: _id, created_at: _created, lineage: _lineage, ...rest } = s;
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
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(DEFAULT_OPEN_GROUPS));

  // Load the selected row into the form when entering edit mode; clear on exit.
  // When editing, also open any group that already holds data so it's visible.
  useEffect(() => {
    const next = editing ? toDraft(editing) : EMPTY;
    setDraft(next);
    setError(null);
    const open = new Set(DEFAULT_OPEN_GROUPS);
    if (editing) {
      for (const g of CATEGORY_GROUPS) {
        if (g.keys.some((k) => hasValue(next[k]))) open.add(g.name);
      }
    }
    setOpenGroups(open);
  }, [editing]);

  const isEditing = !!editing;

  const set = (key: keyof SpeciesDraft, value: string | null) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Click a selected chip again to clear it.
  const toggle = (key: TestKey, value: string) =>
    setDraft((d) => ({ ...d, [key]: d[key] === value ? null : value }));

  const toggleGroup = (name: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allOpen = openGroups.size === CATEGORY_GROUPS.length;
  const toggleAll = () =>
    setOpenGroups(allOpen ? new Set() : new Set(CATEGORY_GROUPS.map((g) => g.name)));

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

      <div className="form__panel">
        <div className="form__panel-bar">
          <span className="form__panel-legend">Test panel</span>
          <button type="button" className="form__panel-toggle" onClick={toggleAll}>
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>

        {CATEGORY_GROUPS.map((group) => {
          const open = openGroups.has(group.name);
          const filled = group.keys.filter((k) => hasValue(draft[k])).length;
          return (
            <section key={group.name} className={`fgroup${open ? " is-open" : ""}`}>
              <button
                type="button"
                className="fgroup__head"
                aria-expanded={open}
                onClick={() => toggleGroup(group.name)}
              >
                <span className="fgroup__chev" aria-hidden="true">
                  ▸
                </span>
                <span className="fgroup__name">{group.name}</span>
                {filled > 0 && <span className="fgroup__badge">{filled}</span>}
              </button>
              {open && (
                <div className="form__grid">
                  {group.keys.map((k) => {
                    const cat = CATEGORY_BY_KEY[k];
                    return (
                      <Field
                        key={cat.key}
                        cat={cat}
                        value={draft[cat.key]}
                        onSelect={(v) => toggle(cat.key, v)}
                        onText={(v) => set(cat.key, v === "" ? null : v)}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

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
  const isChoice = cat.type === "choice";
  const isSeg = !isText && !isChoice && !!cat.options;
  const wide = cat.type === "textarea" || isChoice;

  return (
    <div className={`tfield${wide ? " tfield--wide" : ""}`}>
      <div className="tfield__label">{cat.label}</div>

      {isSeg && cat.options && (
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

      {isChoice && cat.options && (
        <div className="choices" role="group" aria-label={cat.label}>
          {groupOptions(cat.options).map(([groupName, opts]) => (
            <div key={groupName} className="choicegrp">
              {groupName && <div className="choicegrp__label">{groupName}</div>}
              <div className="choicegrp__opts">
                {opts.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`choice${value === opt.value ? " is-on" : ""}`}
                    aria-pressed={value === opt.value}
                    title={opt.title ?? opt.value}
                    onClick={() => onSelect(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
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
