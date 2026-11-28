/** 2UP / 1UP from the goal timeline. AH −1 by exactly one goal is a void. */

export function bankerNeedsTimeline(market) {
  return String(market || '').startsWith('2up') || String(market || '').startsWith('1up');
}

export function goalLeads(events, side) {
  let by1 = false;
  let by2 = false;
  let goals = 0;
  for (const event of events || []) {
    if (event?.type !== 'goal' || event.disabled) continue;
    const home = Number(event?.result?.home);
    const away = Number(event?.result?.away);
    if (!Number.isInteger(home) || !Number.isInteger(away)) continue;
    goals += 1;
    const lead = side === 'A' ? away - home : home - away;
    if (lead >= 1) by1 = true;
    if (lead >= 2) by2 = true;
  }
  return { by1, by2, goals };
}

export function timelineEvents(body) {
  const data = body?.doc?.[0]?.data || body?.data || body;
  const events = data?.events;
  return Array.isArray(events) ? events : null;
}

/**
 * won | lost | void | open.
 * A 2UP or 1UP leg stays open when the timeline has fewer goals than the full-time score.
 */
export function gradeBanker(market, ft, timeline) {
  const key = String(market || '');
  if (!ft || !Number.isFinite(ft.home) || !Number.isFinite(ft.away)) return 'open';
  if (key.startsWith('2up') || key.startsWith('1up')) {
    if (!Array.isArray(timeline)) return 'open';
    const side = key.endsWith('away') ? 'A' : 'H';
    const leads = goalLeads(timeline, side);
    if (leads.goals < ft.home + ft.away) return 'open';
    return key.startsWith('2up') ? (leads.by2 ? 'won' : 'lost') : leads.by1 ? 'won' : 'lost';
  }
  if (key.startsWith('ah-1')) {
    const side = key.endsWith('away') ? 'A' : 'H';
    const margin = side === 'A' ? ft.away - ft.home : ft.home - ft.away;
    if (margin >= 2) return 'won';
    if (margin === 1) return 'void';
    return 'lost';
  }
  const home = ft.home;
  const away = ft.away;
  const goals = home + away;
  if (key === 'over15') return goals >= 2 ? 'won' : 'lost';
  if (key === 'over25') return goals >= 3 ? 'won' : 'lost';
  if (key === 'home-over15') return home >= 2 ? 'won' : 'lost';
  if (key === 'away-over15') return away >= 2 ? 'won' : 'lost';
  return 'open';
}

/** Share-code isWinning: 1 won, 0 lost. Anything else is not a result. */
export function bookResult(isWinning) {
  if (isWinning === 1 || isWinning === '1') return 'won';
  if (isWinning === 0 || isWinning === '0') return 'lost';
  return '';
}

export function mismatchNote(status, book) {
  if (!book || status === 'open' || status === book) return '';
  return `Sportradar says ${status}. The share readback says ${book}.`;
}
