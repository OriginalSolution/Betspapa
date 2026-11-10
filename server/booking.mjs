import { bookAll, publicError } from './bookers.mjs';
import { requestJson } from './curl-request.mjs';
import { selectionKey, toSelection } from './selection.mjs';

const jobs = new Map();
let latestKey = '';

function snapshot(job) {
  return {
    status: job.status,
    books: job.books,
    error: job.error,
  };
}

export function latestBooking() {
  const job = jobs.get(latestKey);
  return job ? snapshot(job) : { status: 'empty', books: {}, error: null };
}

export function submitBooking(rawLegs) {
  const legs = (Array.isArray(rawLegs) ? rawLegs : [])
    .slice(0, 200)
    .map((leg) => ({
      eventId: leg?.eventId,
      market: leg?.market,
      odds: leg?.odds,
      match: leg?.match,
    }))
    .filter((leg) => toSelection(leg));
  if (!legs.length) return { status: 'empty', books: {}, error: 'Nothing on this slip can be shared.' };
  const key = selectionKey(legs);
  const existing = jobs.get(key);
  if (existing && (existing.status === 'pending' || (existing.status === 'ready' && existing.expires > Date.now()))) {
    latestKey = key;
    return snapshot(existing);
  }
  const job = { status: 'pending', books: {}, error: null, expires: 0 };
  jobs.set(key, job);
  latestKey = key;
  if (jobs.size > 12) {
    const oldest = jobs.keys().next().value;
    if (oldest && oldest !== key) jobs.delete(oldest);
  }
  bookAll(legs, requestJson, (name, result) => {
    job.books = { ...job.books, [name]: result };
  })
    .then((books) => {
      job.books = books;
      job.status = 'ready';
      job.expires = Date.now() + 30 * 60 * 1000;
    })
    .catch((error) => {
      job.status = 'error';
      job.error = publicError(error?.message || error);
    });
  return snapshot(job);
}
