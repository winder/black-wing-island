import { describe, expect, it } from 'vitest';
import { MAX_HEALTH, Vitals } from './vitals';

describe('Vitals', () => {
  it('knocks out at zero health and revives full', () => {
    const v = new Vitals();
    v.hurt(60);
    expect(v.knockedOut).toBe(false);
    v.hurt(60);
    expect(v.health).toBe(0);
    expect(v.knockedOut).toBe(true);
    v.revive();
    expect(v.health).toBe(MAX_HEALTH);
    expect(v.knockedOut).toBe(false);
  });

  it('only regenerates after a pause without damage', () => {
    const v = new Vitals();
    v.hurt(50);
    v.update(2, false);
    expect(v.health).toBe(50);
    v.update(4, false);
    expect(v.health).toBeGreaterThan(50);
  });

  it('runs out of fire and needs to refill before breathing again', () => {
    const v = new Vitals();
    for (let i = 0; i < 100; i++) v.breathe(0.1);
    expect(v.outOfFire).toBe(true);
    expect(v.breathe(0.1)).toBe(false);
    v.update(2, false);
    expect(v.outOfFire).toBe(false);
  });
});
