// The Materials the Player Dragon is carrying, and what buildings cost.

export type Material = 'wood' | 'stone' | 'gold';
export type BuildingKind = 'villageCenter' | 'house' | 'wall' | 'tower' | 'castle';
export type Cost = Partial<Record<Material, number>>;

export const BUILDINGS: Record<BuildingKind, { name: string; cost: Cost; needsVillage: boolean }> = {
  villageCenter: { name: 'Village Center', cost: { wood: 20, stone: 10 }, needsVillage: false },
  house: { name: 'House', cost: { wood: 10 }, needsVillage: true },
  wall: { name: 'Wall', cost: { stone: 15 }, needsVillage: true },
  tower: { name: 'Tower', cost: { wood: 10, stone: 20 }, needsVillage: true },
  castle: { name: 'Castle', cost: { wood: 50, stone: 80, gold: 20 }, needsVillage: false },
};
export const BUILD_ORDER: BuildingKind[] = ['villageCenter', 'house', 'wall', 'tower', 'castle'];
export const MATERIAL_NAMES: Record<Material, string> = { wood: 'Wood', stone: 'Stone', gold: 'Gold' };

export class Inventory {
  wood = 0;
  stone = 0;
  gold = 0;
  /** Called whenever something is added (for the "+5 Wood" toasts). */
  onGain?: (m: Material, n: number) => void;

  add(m: Material, n: number) {
    if (n <= 0) return;
    this[m] += n;
    this.onGain?.(m, n);
  }

  canAfford(cost: Cost) {
    return (Object.entries(cost) as [Material, number][]).every(([m, n]) => this[m] >= n);
  }

  /** Pay for something; returns false (and pays nothing) if there isn't enough. */
  spend(cost: Cost) {
    if (!this.canAfford(cost)) return false;
    for (const [m, n] of Object.entries(cost) as [Material, number][]) this[m] -= n;
    return true;
  }

  get state() { return { wood: this.wood, stone: this.stone, gold: this.gold }; }
  set state(s: { wood: number; stone: number; gold: number }) { this.wood = s.wood; this.stone = s.stone; this.gold = s.gold; }
}

export function describeCost(cost: Cost) {
  return (Object.entries(cost) as [Material, number][]).map(([m, n]) => `${n} ${MATERIAL_NAMES[m]}`).join(' + ');
}
