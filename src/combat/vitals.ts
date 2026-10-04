// The Player Dragon's health and fire. Health comes back on its own after a
// little while without getting hurt; fire refills whenever you're not breathing it.

export const MAX_HEALTH = 100;
export const MAX_FIRE = 100;
const REGEN_DELAY = 5;     // seconds without damage before health comes back
const REGEN_RATE = 6;      // health per second
const FIRE_USE = 22;       // fire per second while breathing
const FIRE_REFILL = 16;    // fire per second while not breathing
const FIRE_MIN_RESTART = 15; // after running dry, wait for this much before breathing again

export class Vitals {
  /** Powers raise these. */
  maxHealth = MAX_HEALTH;
  maxFire = MAX_FIRE;
  /** How much of each hit gets through (Tough Scales lowers it). */
  armor = 1;
  /** How fast fire refills (Deep Lungs raises it). */
  refill = 1;
  health = MAX_HEALTH;
  fire = MAX_FIRE;
  sinceHurt = Infinity;
  /** Set when fire ran dry, until it refills a little. */
  outOfFire = false;
  /** Set when health hits zero; cleared by `revive()`. */
  knockedOut = false;
  /** 0..1, how recently and how hard the dragon was hurt (for the red flash). */
  hurtFlash = 0;

  hurt(amount: number) {
    if (this.knockedOut || amount <= 0) return;
    amount *= this.armor;
    this.health = Math.max(0, this.health - amount);
    this.sinceHurt = 0;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.25 + amount / 40);
    if (this.health === 0) this.knockedOut = true;
  }

  /** Spend fire for `dt` seconds of breathing; returns whether there was fire to breathe. */
  breathe(dt: number): boolean {
    if (this.outOfFire || this.knockedOut) return false;
    this.fire = Math.max(0, this.fire - FIRE_USE * dt);
    if (this.fire === 0) this.outOfFire = true;
    return true;
  }

  update(dt: number, breathing: boolean) {
    this.sinceHurt += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    if (!this.knockedOut && this.sinceHurt > REGEN_DELAY) this.health = Math.min(this.maxHealth, this.health + REGEN_RATE * dt);
    if (!breathing) this.fire = Math.min(this.maxFire, this.fire + FIRE_REFILL * this.refill * dt);
    if (this.outOfFire && this.fire >= FIRE_MIN_RESTART) this.outOfFire = false;
  }

  revive() {
    this.health = this.maxHealth;
    this.fire = this.maxFire;
    this.knockedOut = false;
    this.outOfFire = false;
    this.sinceHurt = Infinity;
    this.hurtFlash = 0;
  }
}
