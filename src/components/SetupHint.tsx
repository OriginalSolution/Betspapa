import type { StepHint } from '../lib/alertSetup';

/** A small picture of the system screen, with the control to tap outlined. */
export function SetupHint({ hint }: { hint: StepHint }) {
  const choices = hint.rows.length > 1 && hint.rows.every((row) => row.control === 'allow');
  return (
    <figure className="setup-hint" data-setup-hint={hint.screen}>
      <figcaption className="setup-hint-screen">{hint.screen}</figcaption>
      <div className={choices ? 'setup-hint-choices' : 'setup-hint-list'}>
        {hint.rows.map((row) => (
          <div key={row.label} className={row.target ? 'setup-hint-row is-target' : 'setup-hint-row'} data-setup-target={row.target ? row.label : undefined}>
            <div>
              <strong>{row.label}</strong>
              {row.detail && <small>{row.detail}</small>}
            </div>
            {row.control === 'allow' ? null : row.control === 'radio' ? (
              <span className={row.on ? 'setup-radio is-on' : 'setup-radio'} aria-hidden="true" />
            ) : (
              <span className={row.on ? 'setup-switch is-on' : 'setup-switch'} aria-hidden="true" />
            )}
            {row.target && <em>Tap this</em>}
          </div>
        ))}
      </div>
      <p className="setup-hint-caption">{hint.caption}</p>
    </figure>
  );
}
