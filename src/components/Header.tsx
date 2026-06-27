import type { DomainConfig } from "../domains";

interface HeaderProps {
  count: number;
  config: DomainConfig;
}

// The app's masthead. The mark is a stylised streak plate — three quadrant
// streaks thinning out to single colonies, the gesture every plate starts with.
export default function Header({ count, config }: HeaderProps) {
  return (
    <header className="masthead">
      <div className="masthead__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="44" height="44">
          <circle cx="24" cy="24" r="22" className="plate__agar" />
          <circle cx="24" cy="24" r="22" className="plate__rim" />
          <path
            className="plate__streak"
            d="M9 14c8 2 16 2 24 5M11 20c7 1 14 2 21 5M14 27c5 1 11 2 16 4"
          />
          <circle className="plate__colony" cx="33" cy="32" r="1.5" />
          <circle className="plate__colony" cx="37" cy="29" r="1.1" />
          <circle className="plate__colony" cx="30" cy="36" r="1.2" />
        </svg>
      </div>
      <div className="masthead__text">
        <h1 className="masthead__title">SpeciesDoc</h1>
        <p className="masthead__tag">{config.tagline}</p>
      </div>
      <div className="masthead__count" title={`${config.nounPlural} logged`}>
        <span className="masthead__count-n">{count}</span>
        <span className="masthead__count-l">{count === 1 ? config.noun : config.nounPlural}</span>
      </div>
    </header>
  );
}
