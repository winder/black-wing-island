// Powers (upgrades from big Quests) and Accessories (things to wear).

export type PowerId = 'hotterFire' | 'swiftWings' | 'toughScales' | 'deepLungs';
export type AccessoryId = 'crown' | 'rubyAmulet' | 'midnightScales' | 'emeraldScales' | 'crimsonScales' | 'goldenSheen' | 'starlightSheen';

export const POWERS: Record<PowerId, { name: string; does: string }> = {
  hotterFire: { name: 'Hotter Fire', does: 'Fire Breath does more damage and reaches further.' },
  swiftWings: { name: 'Swift Wings', does: 'Faster flying and boosting.' },
  toughScales: { name: 'Tough Scales', does: 'More health, and hits hurt less.' },
  deepLungs: { name: 'Deep Lungs', does: 'A bigger fire meter that refills faster.' },
};

export type AccessorySlot = 'head' | 'neck' | 'scales' | 'sheen';

export const ACCESSORIES: Record<AccessoryId, { name: string; slot: AccessorySlot; color?: string; accent?: string }> = {
  crown: { name: 'a Golden Crown', slot: 'head' },
  rubyAmulet: { name: 'a Ruby Amulet', slot: 'neck' },
  midnightScales: { name: 'Midnight Blue scales', slot: 'scales', color: '#141c3a', accent: '#3a5aa8' },
  emeraldScales: { name: 'Emerald scales', slot: 'scales', color: '#123a22', accent: '#3fa86a' },
  crimsonScales: { name: 'Crimson scales', slot: 'scales', color: '#3a1014', accent: '#b8333a' },
  goldenSheen: { name: 'a Golden Sheen', slot: 'sheen', color: '#ffcf5a' },
  starlightSheen: { name: 'a Starlight Sheen', slot: 'sheen', color: '#bcd8ff' },
};

/** What you've won, and what you're wearing. */
export class Rewards {
  readonly powers = new Set<PowerId>();
  readonly accessories = new Set<AccessoryId>();
  /** Worn accessory per slot (null = none / your own black scales). */
  readonly worn: Partial<Record<AccessorySlot, AccessoryId>> = {};
  /** Called whenever what you have or wear changes. */
  onChange?: () => void;

  has(p: PowerId) { return this.powers.has(p); }

  grantPower(p: PowerId) { this.powers.add(p); this.onChange?.(); }

  grantAccessory(a: AccessoryId) {
    this.accessories.add(a);
    this.worn[ACCESSORIES[a].slot] = a; // put new things on straight away
    this.onChange?.();
  }

  /** Put an accessory on, or take it off if already worn. */
  toggle(a: AccessoryId) {
    if (!this.accessories.has(a)) return;
    const slot = ACCESSORIES[a].slot;
    if (this.worn[slot] === a) delete this.worn[slot];
    else this.worn[slot] = a;
    this.onChange?.();
  }

  get state() { return { powers: [...this.powers], accessories: [...this.accessories], worn: { ...this.worn } }; }

  set state(s: { powers: PowerId[]; accessories: AccessoryId[]; worn: Partial<Record<AccessorySlot, AccessoryId>> }) {
    this.powers.clear();
    this.accessories.clear();
    for (const p of s.powers) this.powers.add(p);
    for (const a of s.accessories) this.accessories.add(a);
    for (const k of Object.keys(this.worn) as AccessorySlot[]) delete this.worn[k];
    Object.assign(this.worn, s.worn);
    this.onChange?.();
  }
}
