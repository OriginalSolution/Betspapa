import { describe, expect, it } from 'vitest';
import { FIXTURE_FEED } from '../data/remote';
import { nativeHeaders, nativeRequestOptions, readJsonBody } from './nativeHttp';

describe('native HTTP headers', () => {
  it('omits the WebView origin and referer', () => {
    const headers = nativeHeaders({
      Origin: 'https://localhost',
      origin: 'capacitor://localhost',
      Referer: 'https://localhost/',
      referrer: 'http://localhost:5173/',
      operid: '3',
      Accept: 'application/json',
    });
    expect(Object.keys(headers).some((key) => key.toLowerCase() === 'origin')).toBe(false);
    expect(Object.keys(headers).some((key) => key.toLowerCase() === 'referer' || key.toLowerCase() === 'referrer')).toBe(false);
    expect(headers['User-Agent']).toMatch(/Chrome\/124/);
    expect(headers['x-cap-user-agent']).toBe(headers['User-Agent']);
    expect(headers.operid).toBe('3');
    expect(headers.Accept).toBe('application/json');
  });

  it('builds a fixture GET against the official feed with no body', () => {
    const call = nativeRequestOptions('GET', FIXTURE_FEED, { timeout: 20 });
    expect(call.url).toBe('https://api.betspapa.com/api/sportybet/upcoming');
    expect(call.method).toBe('GET');
    expect(call.data).toBeUndefined();
    expect(call.connectTimeout).toBe(20_000);
    expect(call.headers.Origin).toBeUndefined();
    expect(call.responseType).toBe('json');
  });

  it('keeps a JSON booking body and drops a non-JSON payload', () => {
    const post = nativeRequestOptions('POST', 'https://www.sportybet.com/api/gh/orders/share', {
      body: { selections: [] },
      headers: { operid: '3' },
    });
    expect(post.headers['Content-Type']).toBe('application/json');
    expect(post.data).toEqual({ selections: [] });
    expect(post.headers.operid).toBe('3');
    expect(readJsonBody('{"bizCode":10000}')).toEqual({ bizCode: 10000 });
    expect(readJsonBody('not json')).toEqual({});
    expect(readJsonBody({ events: [] })).toEqual({ events: [] });
  });
});
