/** Original marks in each desk’s public colors. The name stays in the card text. */

const marks = {
  sportybet: { label: 'SportyBet', bg: '#0D9F4C', fg: '#ffffff' },
  footballcom: { label: 'Football.com', bg: '#111111', fg: '#ffffff' },
  msport: { label: 'MSport', bg: '#0A4DFF', fg: '#ffffff' },
  betika: { label: 'Betika', bg: '#148A3C', fg: '#F6C445' },
  betpawa: { label: 'BetPawa', bg: '#1A1A1A', fg: '#FFE14A' },
} as const;

export type BookId = keyof typeof marks;

export function bookTheme(id: string) {
  return marks[id as BookId] ?? null;
}

export function BookMark({ id }: { id: string }) {
  const theme = bookTheme(id);
  if (!theme) return null;
  return (
    <svg className="book-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={theme.bg} />
      {id === 'footballcom' ? (
        <>
          <circle cx="16" cy="16" r="7" fill="none" stroke={theme.fg} strokeWidth="1.6" />
          <path d="M16 9v14M9 16h14M11 12.2c3 1.6 7 1.6 10 0M11 19.8c3-1.6 7-1.6 10 0" fill="none" stroke={theme.fg} strokeWidth="1.2" />
        </>
      ) : id === 'betpawa' ? (
        <>
          <circle cx="11" cy="13" r="2.2" fill={theme.fg} />
          <circle cx="16" cy="10.5" r="2.2" fill={theme.fg} />
          <circle cx="21" cy="13" r="2.2" fill={theme.fg} />
          <circle cx="16" cy="18.5" r="3.1" fill={theme.fg} />
        </>
      ) : (
        <text x="16" y="21" textAnchor="middle" fontSize="14" fontFamily="Arial, sans-serif" fontWeight="700" fill={theme.fg}>
          {id === 'sportybet' ? 'S' : id === 'msport' ? 'M' : 'B'}
        </text>
      )}
    </svg>
  );
}
