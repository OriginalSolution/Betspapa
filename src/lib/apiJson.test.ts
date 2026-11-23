import { describe, expect, it } from 'vitest';
import { ApiError, apiUrl, friendlyError, parseApiBody } from './apiJson';

describe('apiUrl', () => {
  it('sends the Android app to the API host, not its own https://localhost', () => {
    expect(apiUrl('/api/codes', { native: true, host: 'localhost' })).toBe('https://api.betspapa.com/api/codes');
  });

  it('keeps the dev proxy path in a desktop browser on localhost', () => {
    expect(apiUrl('/api/codes', { native: false, host: 'localhost' })).toBe('/api/codes');
    expect(apiUrl('/api/results?day=2026-11-23', { native: false, host: '127.0.0.1' })).toBe('/api/results?day=2026-11-23');
  });

  it('uses the API host on betspapa.com', () => {
    expect(apiUrl('/api/lineups', { native: false, host: 'betspapa.com' })).toBe('https://api.betspapa.com/api/lineups');
  });
});

describe('parseApiBody', () => {
  it('reads JSON text and objects', () => {
    expect(parseApiBody(200, '{"strategies":[]}', 'Codes')).toEqual({ strategies: [] });
    expect(parseApiBody(200, { strategies: [] }, 'Codes')).toEqual({ strategies: [] });
  });

  it('turns an HTML page into a plain message, never parser text', () => {
    let error: unknown;
    try {
      parseApiBody(200, '<!doctype html><html></html>', 'Codes');
    } catch (reason) {
      error = reason;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as Error).message).toBe('Codes could not be read. Check your connection and try again.');
    expect((error as Error).message).not.toMatch(/Unexpected token|<!doctype/i);
  });

  it('names the status on a failed response', () => {
    expect(() => parseApiBody(405, '{"error":"Method not allowed"}', 'Codes')).toThrow(/Codes are not available right now \(error 405\)/);
  });
});

describe('friendlyError', () => {
  it('hides raw errors behind the fallback', () => {
    expect(friendlyError(new SyntaxError(`Unexpected token '<', "<!doctype "... is not valid JSON`), 'Codes could not load.')).toBe('Codes could not load.');
    expect(friendlyError(new ApiError('Codes are not available right now (error 500). Try again in a moment.', 500), 'x')).toMatch(/error 500/);
  });
});
