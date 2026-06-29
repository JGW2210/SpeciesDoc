import { useEffect, useMemo, useState } from "react";
import type { Category, QuickOption } from "../data/categories";
import { useDomain } from "../domains";
import { tv, type Species, type SpeciesDraft, type TestKey } from "../types";
import { binomial } from "../lib/format";

// A blank draft for the active domain: base name fields plus a null per test.
function buildEmpty(categories: Category[]): SpeciesDraft {
  const draft: SpeciesDraft = { genus: "", species: "", old_name: null };
  for (const c of categories) draft[c.key] = null;
  return draft;
}

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

// Strip the server-managed fields so an existing row can seed the form. `owner`
// is left to the database (default auth.uid() on insert; untouched on update).
function toDraft(s: Species): SpeciesDraft {
  const { id: _id, created_at: _created, owner: _owner, lineage: _lineage, ...rest } = s;
  return rest as SpeciesDraft;
}

interface SpeciesFormProps {
  onSubmit: (draft: SpeciesDraft, editingId: string | null) => Promise<void>;
  editing: Species | null;
  species: Species[]; // existing isolates, for duplicate detection
  onEditExisting: (s: Species) => void;
  onCancelEdit: () => void;
  disabled?: boolean;
  // True when no one is signed in — used to show a sign-in hint instead of a
  // generic "not configured" state.
  signedOut?: boolean;
}

export default function SpeciesForm({
  onSubmit,
  editing,
  species,
  onEditExisting,
  onCancelEdit,
  disabled,
  signedOut,
}: SpeciesFormProps) {
  const { categories, groups, defaultOpenGroups, genusPlaceholder, speciesPlaceholder, nounPlural } =
    useDomain();
  const catByKey = useMemo(() => {
    const m: Record<string, Category> = {};
    for (const c of categories) m[c.key] = c;
    return m;
  }, [categories]);
  const EMPTY = useMemo(() => buildEmpty(categories), [categories]);

  const [draft, setDraft] = useState<SpeciesDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(defaultOpenGroups));

  // Load the selected row into the form when entering edit mode; clear on exit.
  // When editing, also open any group that already holds data so it's visible.
  useEffect(() => {
    const next = editing ? toDraft(editing) : EMPTY;
    setDraft(next);
    setError(null);
    const open = new Set(defaultOpenGroups);
    if (editing) {
      for (const g of groups) {
        if (g.keys.some((k) => tv(next, k) !== "")) open.add(g.name);
      }
    }
    setOpenGroups(open);
  }, [editing, EMPTY, groups, defaultOpenGroups]);

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

  const allOpen = openGroups.size === groups.length;
  const toggleAll = () =>
    setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.name)));

  // Flag an already-logged isolate with the same name (excluding the one being
  // edited), to prevent accidental double entry.
  const nameKey =
    draft.genus.trim() && draft.species.trim()
      ? binomial(draft.genus, draft.species).toLowerCase()
      : "";
  const duplicate = nameKey
    ? (species.find(
        (s) => s.id !== editing?.id && binomial(s.genus, s.species).toLowerCase() === nameKey,
      ) ?? null)
    : null;

  const canSave =
    draft.genus.trim() !== "" &&
    draft.species.trim() !== "" &&
    !duplicate &&
    !disabled &&
    !saving;

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

      {signedOut && (
        <p className="form__editing" role="status">
          Sign in above to add your own {nounPlural} — you can browse everyone’s without an account.
        </p>
      )}

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
            placeholder={genusPlaceholder}
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
            placeholder={speciesPlaceholder}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
      </div>

      {duplicate && (
        <p className="form__dupe" role="alert">
          <span>
            <em>{binomial(duplicate.genus, duplicate.species)}</em> is already in your list — saving is
            blocked to avoid a duplicate.
          </span>
          <button type="button" className="form__dupe-edit" onClick={() => onEditExisting(duplicate)}>
            Edit the existing one
          </button>
        </p>
      )}

      <label className="field field--wide">
        <span className="field__label">Old name / synonym (optional)</span>
        <input
          className="field__input"
          value={draft.old_name ?? ""}
          onChange={(e) => set("old_name", e.target.value === "" ? null : e.target.value)}
          placeholder="e.g. Actinomyces odontolyticus"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="field__hint">
          Used to fetch lineage if the current name isn’t found, and shown on the tree card.
        </span>
      </label>

      <div className="form__panel">
        <div className="form__panel-bar">
          <span className="form__panel-legend">Test panel</span>
          <button type="button" className="form__panel-toggle" onClick={toggleAll}>
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>

        {groups.map((group) => {
          const open = openGroups.has(group.name);
          const filled = group.keys.filter((k) => tv(draft, k) !== "").length;
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
                    const cat = catByKey[k];
                    return (
                      <Field
                        key={cat.key}
                        cat={cat}
                        value={tv(draft, cat.key) || null}
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
  // Staining now has four options (incl. Acid-fast); give it the full row so
  // every segment fits instead of clipping the last one.
  const wide = cat.type === "textarea" || isChoice || cat.type === "gram";
  // Choice fields (e.g. Motility) are large, so they collapse on their own and
  // start closed — the chosen value stays visible in the header.
  const [choiceOpen, setChoiceOpen] = useState(false);

  return (
    <div className={`tfield${wide ? " tfield--wide" : ""}`}>
      {!isChoice && <div className="tfield__label">{cat.label}</div>}

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
        <div className="cfield">
          <button
            type="button"
            className={`cfield__head${choiceOpen ? " is-open" : ""}`}
            aria-expanded={choiceOpen}
            onClick={() => setChoiceOpen((o) => !o)}
          >
            <span className="fgroup__chev" aria-hidden="true">
              ▸
            </span>
            <span className="cfield__title">{cat.label}</span>
            {value ? (
              <span className="cfield__value">{value}</span>
            ) : (
              <span className="cfield__placeholder">Select…</span>
            )}
          </button>
          {choiceOpen && (
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
              {cat.hint && <p className="tfield__hint">{cat.hint}</p>}
            </div>
          )}
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

      {cat.hint && !isText && !isChoice && <p className="tfield__hint">{cat.hint}</p>}
    </div>
  );
}
