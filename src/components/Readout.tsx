import { polarityOf } from "../lib/format";
import { useDomain } from "../domains";
import { tv, type Species } from "../types";

interface ReadoutProps {
  species: Species;
  emptyText?: string;
}

// The List-view test readout: one coloured chip per recorded test. Shared by the
// list cards, the tree detail panel, and the board chips.
export default function Readout({ species, emptyText }: ReadoutProps) {
  const { categories } = useDomain();
  // Tests shown as compact readout chips (everything except the free-text notes).
  const chipKeys = categories.filter((c) => c.key !== "other_notes");
  const results = chipKeys
    .map((cat) => ({ cat, value: tv(species, cat.key) }))
    .filter((r) => r.value.trim() !== "");

  if (results.length === 0) {
    return <p className="card__none">{emptyText ?? "No test results recorded yet."}</p>;
  }

  return (
    <ul className="readout">
      {results.map(({ cat, value }) => {
        // Only inherently polar tests get +/- colouring; descriptive ones stay neutral.
        const polar =
          cat.type === "sign" || cat.type === "gram" || cat.type === "haemolysis" || cat.type === "of";
        const pol = polar ? polarityOf(value) : "neutral";
        return (
          <li key={cat.key} className={`rchip rchip--${pol}`} title={`${cat.label}: ${value}`}>
            <span className="rchip__k">{cat.short}</span>
            <span className="rchip__v">{value}</span>
          </li>
        );
      })}
    </ul>
  );
}
