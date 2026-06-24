import { useState } from "react";
import type { Species, TestKey } from "../types";
import { CATEGORIES } from "../data/categories";
import { binomial, polarityOf } from "../lib/format";

interface SpeciesCardProps {
  species: Species;
  index: number;
  isEditing: boolean;
  onEdit: (s: Species) => void;
  onDelete: (id: string) => void;
}

// Tests shown as compact readout chips (everything except the free-text note block).
const CHIP_KEYS = CATEGORIES.filter((c) => c.key !== "other_notes");

export default function SpeciesCard({
  species,
  index,
  isEditing,
  onEdit,
  onDelete,
}: SpeciesCardProps) {
  const [confirming, setConfirming] = useState(false);

  const results = CHIP_KEYS.map((cat) => ({ cat, value: species[cat.key] }))
    .filter((r): r is { cat: (typeof CHIP_KEYS)[number]; value: string } => !!r.value && r.value.trim() !== "");

  const notes = species.other_notes?.trim();
  const logged = new Date(species.created_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <article
      className={`card${isEditing ? " card--editing" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="card__top">
        <h3 className="card__name">
          <em>{binomial(species.genus, species.species)}</em>
        </h3>
        <div className="card__meta">
          <time dateTime={species.created_at}>{logged}</time>
          {confirming ? (
            <span className="card__confirm">
              <button className="linkbtn linkbtn--danger" onClick={() => onDelete(species.id)}>
                Delete
              </button>
              <button className="linkbtn" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          ) : (
            <>
              <button
                className="card__action"
                aria-label={`Edit ${binomial(species.genus, species.species)}`}
                title="Edit"
                onClick={() => onEdit(species)}
              >
                Edit
              </button>
              <button
                className="card__del"
                aria-label={`Delete ${binomial(species.genus, species.species)}`}
                title="Delete"
                onClick={() => setConfirming(true)}
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>

      {results.length > 0 ? (
        <ul className="readout">
          {results.map(({ cat, value }) => {
            // Only the inherently polar tests get +/- colouring; descriptive
            // ones (text, motility choice) stay neutral.
            const polar =
              cat.type === "sign" ||
              cat.type === "gram" ||
              cat.type === "haemolysis" ||
              cat.type === "of";
            const pol = polar ? polarityOf(value) : "neutral";
            return (
              <li key={cat.key as TestKey} className={`rchip rchip--${pol}`} title={`${cat.label}: ${value}`}>
                <span className="rchip__k">{cat.short}</span>
                <span className="rchip__v">{value}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card__none">No test results recorded yet.</p>
      )}

      {notes && (
        <details className="card__notes">
          <summary>Notes</summary>
          <p>{notes}</p>
        </details>
      )}
    </article>
  );
}
