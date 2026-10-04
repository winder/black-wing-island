import { describe, expect, it } from 'vitest';
import { box, Collider, pushDragonOut, pushOutOf } from './collide';

const out = { x: 0, z: 0 };

describe('pushOutOf', () => {
  const circle: Collider = { x: 0, z: 0, r: 5, height: 10 };
  it('leaves a circle alone when it is clear', () => {
    expect(pushOutOf(circle, 8, 0, 2, out)).toBe(false);
  });
  it('pushes a circle straight out of a circle', () => {
    expect(pushOutOf(circle, 6, 0, 2, out)).toBe(true);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
  });
  it('catches a box corner that a circle would miss', () => {
    const b = box(0, 0, 5, 5, 10);
    expect(pushOutOf(b, 6, 6, 2, out)).toBe(true);
    expect(pushOutOf({ x: 0, z: 0, r: 5, height: 10 }, 6, 6, 2, out)).toBe(false);
  });
  it('pushes out of the nearest side of a box', () => {
    const b = box(0, 0, 10, 2, 10);
    expect(pushOutOf(b, 3, 3, 1, out)).toBe(false); // just touching
    expect(pushOutOf(b, 3, 2.5, 1, out)).toBe(true);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0.5);
    expect(pushOutOf(b, 3, 1.5, 1, out)).toBe(true); // centre inside: out the near (+z) side
    expect(3 + out.x).toBeCloseTo(3);
    expect(1.5 + out.z).toBeCloseTo(3);
  });
  it('turns a box the same way as rotation.y', () => {
    // A long thin box turned a quarter turn runs along z.
    const b = box(0, 0, 10, 1, 10, Math.PI / 2);
    expect(pushOutOf(b, 0, 8, 1, out)).toBe(true);
    expect(pushOutOf(b, 8, 0, 1, out)).toBe(false);
  });
});

describe('pushDragonOut', () => {
  const wall = box(0, -10, 20, 1, 12);
  it('keeps the head out of a wall in front', () => {
    const pos = { x: 0, y: 0, z: -3 };
    expect(pushDragonOut(pos, 0, [wall])).toBe(true);
    // Head is 4.6 ahead (towards -z) with radius 1.6; the wall's face is at z = -9.
    expect(pos.z - 4.6 - 1.6).toBeGreaterThanOrEqual(-9 - 1e-6);
  });
  it('lets the dragon fly over', () => {
    const pos = { x: 0, y: 13, z: -3 };
    expect(pushDragonOut(pos, 0, [wall])).toBe(false);
  });
});
