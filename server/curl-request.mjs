/** Server-side bookmaker client. Curl sends no browser Origin, same as the Android native client. */
import { spawn } from 'node:child_process';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

export function requestJson(method, url, { body, headers = {}, timeout = 25 } = {}) {
  const headerList = { Accept: 'application/json', ...headers };
  if (body !== undefined) headerList['Content-Type'] = 'application/json';
  const args = ['-sS', '-m', String(timeout), '-A', UA, '-X', method];
  for (const [key, value] of Object.entries(headerList)) {
    if (value != null && key.toLowerCase() !== 'origin' && key.toLowerCase() !== 'referer' && key.toLowerCase() !== 'referrer') {
      args.push('-H', `${key}: ${value}`);
    }
  }
  args.push(url);
  if (body !== undefined) args.push('-d', JSON.stringify(body));
  return new Promise((resolve) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (buf) => {
      out += buf;
    });
    const finish = () => {
      const text = out.trim();
      if (!text || !/^[{\[]/.test(text)) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve({});
      }
    };
    child.on('close', finish);
    child.on('error', () => resolve({}));
  });
}
