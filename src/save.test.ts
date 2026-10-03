import { describe, expect, it } from 'vitest';
import { packBits, unpackBits } from './save';

describe('explored-map bit packing', () => {
  it('round-trips', () => {
    const bytes = new Uint8Array(1003);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 3 === 0 ? 1 : 0;
    expect(Array.from(unpackBits(packBits(bytes), bytes.length))).toEqual(Array.from(bytes));
  });

  it('handles maps larger than one chunk of characters', () => {
    const bytes = new Uint8Array(705 * 533).fill(1);
    expect(unpackBits(packBits(bytes), bytes.length).every((b) => b === 1)).toBe(true);
  });
});
