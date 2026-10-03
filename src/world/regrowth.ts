// Remembers which trees and rocks have been cut down or smashed, until they
// grow back. Not saved: everything grows back anyway.

export const REGROW_SECONDS = 600;

class Regrowth {
  /** Game clock in seconds; advanced by the game loop. */
  now = 0;
  private gone = new Map<string, number>();

  isGone(key: string) {
    const until = this.gone.get(key);
    if (until === undefined) return false;
    if (until <= this.now) { this.gone.delete(key); return false; }
    return true;
  }

  cut(key: string) { this.gone.set(key, this.now + REGROW_SECONDS); }

  /** When the given item will be back, or 0 if it is there now. */
  backAt(key: string) { return this.isGone(key) ? this.gone.get(key)! : 0; }
}

export const regrowth = new Regrowth();
