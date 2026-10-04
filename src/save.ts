// Three save slots in the browser's localStorage. Saving happens automatically.

import type { PlacedBuilding } from './build/buildings';
import type { PlayerState } from './player/player';
import type { QuestState } from './quests/quests';
import type { Rewards } from './quests/rewards';

export const SLOTS = 3;
const KEY = (slot: number) => `black-wing-island/slot-${slot}`;

export interface SaveData {
  version: 1;
  savedAt: number;
  playSeconds: number;
  timeOfDay: number;
  player: PlayerState;
  /** Explored map pixels, one bit each, base64. */
  explored: string;
  exploredFraction: number;
  // Added in Version 3 (older saves don't have these).
  inventory?: { wood: number; stone: number; gold: number };
  buildings?: PlacedBuilding[];
  lastVillage?: { x: number; z: number };
  // Added in Version 4.
  places?: { owned: string[]; beaten: string[]; hoards: string[] };
  rescued?: { place: string; village: { x: number; z: number; r: number } }[];
  quests?: QuestState;
  rewards?: Rewards['state'];
}

export function packBits(bytes: Uint8Array): string {
  const packed = new Uint8Array(Math.ceil(bytes.length / 8));
  for (let i = 0; i < bytes.length; i++) if (bytes[i]) packed[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < packed.length; i += 0x8000) s += String.fromCharCode(...packed.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unpackBits(b64: string, length: number): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return out;
}

export function loadSlot(slot: number): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

export function writeSlot(slot: number, data: SaveData): boolean {
  try {
    localStorage.setItem(KEY(slot), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSlot(slot: number) {
  try { localStorage.removeItem(KEY(slot)); } catch { /* storage unavailable */ }
}
