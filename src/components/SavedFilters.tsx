import { useState } from 'react';
import { cx } from '../lib/format';
import { addSavedChip, filterSuggestions, type SavedChip } from '../lib/savedFilters';
import type { Match } from '../types';

export function SavedFilters({
  matches,
  saved,
  onChange,
}: {
  matches: Match[];
  saved: SavedChip[];
  onChange: (next: SavedChip[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const suggestions = filterSuggestions(matches, saved);
  return (
    <div className="chips saved-filters" role="group" aria-label="Saved countries and leagues">
      {saved.length > 0 && (
        <button type="button" className="chip" onClick={() => onChange([])}>
          Clear
        </button>
      )}
      {saved.map((chip) => (
        <button
          key={`${chip.kind}:${chip.id}`}
          type="button"
          className={cx('chip', 'is-on')}
          aria-pressed
          onClick={() => onChange(saved.filter((item) => item.kind !== chip.kind || item.id !== chip.id))}
        >
          {chip.label}
        </button>
      ))}
      <button type="button" className={cx('chip', adding && 'is-on')} aria-expanded={adding} onClick={() => setAdding((open) => !open)}>
        {saved.length ? 'Add' : 'Add country or league'}
      </button>
      {adding &&
        suggestions.map((chip) => (
          <button
            key={`add:${chip.kind}:${chip.id}`}
            type="button"
            className="chip"
            onClick={() => onChange(addSavedChip(saved, chip))}
          >
            {chip.label}
          </button>
        ))}
      {adding && suggestions.length === 0 && <span className="saved-empty">Nothing else on this day</span>}
    </div>
  );
}
