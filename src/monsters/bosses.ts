// Bosses: a giant version of each biome's monster, waiting at the end of a
// Monster Castle or Dungeon.

import * as THREE from 'three';
import { Kraken } from './kraken';
import { Monster, MonsterKind } from './monster';
import { Snail } from './snail';
import { Wolf } from './wolf';
import { LavaWorm, SandSnake } from './worms';
import { Yeti } from './yeti';

export const BOSS_NAMES: Record<MonsterKind, string> = {
  snail: 'The Snail King', wolf: 'The Alpha Wolf', sandSnake: 'The Great Sand Snake',
  yeti: 'The Yeti King', lavaWorm: 'The Great Lava Worm', kraken: 'The Kraken Queen',
};
/** How much bigger than the ordinary monster. */
const SIZE: Record<MonsterKind, number> = { snail: 2.2, wolf: 2, sandSnake: 1.8, yeti: 2, lavaWorm: 1.8, kraken: 1 };
/** How many times the ordinary monster's health. */
const TOUGHNESS: Record<MonsterKind, number> = { snail: 6, wolf: 8, sandSnake: 6, yeti: 6, lavaWorm: 5, kraken: 3 };
/** Gold a Boss drops (on top of what it guards). */
export const BOSS_GOLD = 25;

export function spawnBoss(kind: MonsterKind, at: THREE.Vector3): Monster {
  let m: Monster;
  switch (kind) {
    case 'snail': m = new Snail(at); break;
    case 'sandSnake': m = new SandSnake(at); break;
    case 'yeti': m = new Yeti(at); break;
    case 'lavaWorm': m = new LavaWorm(at); break;
    case 'kraken': m = new Kraken(at); break;
    case 'wolf': {
      const pack: Wolf[] = [];
      const w = new Wolf(at, pack);
      pack.push(w);
      m = w;
      break;
    }
  }
  m.makeBoss(BOSS_NAMES[kind], SIZE[kind], TOUGHNESS[kind]);
  return m;
}
