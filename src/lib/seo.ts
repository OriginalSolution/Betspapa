export const SITE = 'https://betspapa.com';

const DEFAULT_DESCRIPTION =
  'Betspapa is a football matchday board with live scores and alerts for kick-off, goals, red cards, half-time and full-time.';

const descriptions: Record<string, string> = {
  '/': DEFAULT_DESCRIPTION,
  '/live': 'Football matches in play now on Betspapa, with live scores, the minute and VAR decisions.',
  '/picks': 'Betspapa picks: one card per match with every 80%+ trend and its real hit rate.',
  '/codes': 'Banker codes on Betspapa. Each strategy uses its own odds rules, read back before it is shown.',
  '/trends': 'Every tracked football trend on Betspapa with its real record, plus developing form.',
  '/slips': 'Slips built from 80%+ Betspapa tips, tracked to a win or a bust.',
  '/record': 'The Betspapa record: every published 80%+ pick, graded from the full-time score.',
  '/record/picks': 'Graded Betspapa picks with the full-time and half-time score.',
  '/record/codes': 'Booked Betspapa codes and hit rate by odds band.',
  '/following': 'The teams and matches you follow on Betspapa, pinned with live scores.',
  '/rankings': 'Your settled Betspapa tips by market, team and competition for the week, month and year.',
};

export type PageMeta = { title: string; description: string; canonical: string };

/** Title, description and canonical URL for an app route. Query strings never become canonical. */
export function pageMeta(pathname: string, title: string, match?: { home: string; away: string; competition?: string }): PageMeta {
  const path = pathname.split(/[?#]/)[0] || '/';
  const description = match
    ? `${match.home} vs ${match.away}${match.competition ? ` (${match.competition})` : ''}: live score, timeline and alerts on Betspapa.`
    : descriptions[path] ?? DEFAULT_DESCRIPTION;
  const fullTitle = path === '/' ? 'Betspapa · Live football scores and match alerts' : `${title} · Betspapa`;
  return { title: fullTitle, description, canonical: `${SITE}${path}` };
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string) {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  node.content = value;
}

/** Keep the document head in step with the route so shared and crawled pages describe what they show. */
export function applyPageMeta(meta: PageMeta) {
  document.title = meta.title;
  setMeta('meta[name="description"]', 'name', 'description', meta.description);
  setMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', meta.canonical);
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = meta.canonical;
}
