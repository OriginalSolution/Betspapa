import { describe, expect, it } from 'vitest';
import { PRO_UI_ENABLED } from './proFlag';

describe('Pro UI flag', () => {
  it('stays off until the owner approves prices', () => {
    expect(PRO_UI_ENABLED).toBe(false);
  });
});
