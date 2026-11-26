import { describe, expect, it } from 'vitest';
import { PRO_UI_ENABLED } from './proFlag';

describe('Pro UI flag', () => {
  it('stays off until Play products and real ad units are ready', () => {
    expect(PRO_UI_ENABLED).toBe(false);
  });
});
