import { describe, expect, it } from 'vitest';
import { BUILDINGS, Inventory, describeCost } from './inventory';

describe('Inventory', () => {
  it('pays for a building only when it can afford it', () => {
    const inv = new Inventory();
    inv.add('wood', 15);
    inv.add('stone', 5);
    expect(inv.spend(BUILDINGS.villageCenter.cost)).toBe(false);
    expect(inv.state).toEqual({ wood: 15, stone: 5, gold: 0 });
    inv.add('wood', 5);
    inv.add('stone', 5);
    expect(inv.spend(BUILDINGS.villageCenter.cost)).toBe(true);
    expect(inv.state).toEqual({ wood: 0, stone: 0, gold: 0 });
  });

  it('reports gains', () => {
    const inv = new Inventory();
    const got: string[] = [];
    inv.onGain = (m, n) => got.push(`${n} ${m}`);
    inv.add('gold', 3);
    expect(got).toEqual(['3 gold']);
  });

  it('describes costs', () => {
    expect(describeCost(BUILDINGS.castle.cost)).toBe('50 Wood + 80 Stone + 20 Gold');
  });
});
