/** Official desk marks. The bookmaker name stays in the card text. */

export const bookMarks = {
  sportybet: '/bookies/sportybet.png',
  footballcom: '/bookies/football.png',
  msport: '/bookies/msport.png',
  betika: '/bookies/betika.png',
  betpawa: '/bookies/betpawa.png',
} as const;

export type BookId = keyof typeof bookMarks;

export function BookMark({ id }: { id: string }) {
  const src = bookMarks[id as BookId];
  if (!src) return null;
  return <img className="book-mark" src={src} alt="" />;
}
