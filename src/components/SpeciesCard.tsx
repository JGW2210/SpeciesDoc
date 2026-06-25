import { useEffect, useState } from "react";
import type { Species } from "../types";
import { binomial } from "../lib/format";
import Readout from "./Readout";

interface SpeciesCardProps {
  species: Species;
  index: number;
  isEditing: boolean;
  collapsed: boolean; // global "name only" state from the list toggle
  onEdit: (s: Species) => void;
  onDelete: (id: string) => void;
}

export default function SpeciesCard({
  species,
  index,
  isEditing,
  collapsed,
  onEdit,
  onDelete,
}: SpeciesCardProps) {
  const [confirming, setConfirming] = useState(false);
  // Per-card open state, reset whenever the global collapse toggle flips.
  const [open, setOpen] = useState(!collapsed);
  useEffect(() => setOpen(!collapsed), [collapsed]);

  const notes = species.other_notes?.trim();
  const logged = new Date(species.created_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <article
      className={`card${isEditing ? " card--editing" : ""}${open ? "" : " card--collapsed"}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="card__top">
        <button
          className={`chev card__chev${open ? " is-open" : ""}`}
          aria-label={open ? "Collapse" : "Show details"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          ▸
        </button>
        <h3 className="card__name">
          <em>{binomial(species.genus, species.species)}</em>
        </h3>
        <div className="card__meta">
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

      {open && (
        <>
          <Readout species={species} />
          {notes && (
            <details className="card__notes">
              <summary>Notes</summary>
              <p>{notes}</p>
            </details>
          )}
          <div className="card__foot">
            <time dateTime={species.created_at}>{logged}</time>
          </div>
        </>
      )}
    </article>
  );
}
