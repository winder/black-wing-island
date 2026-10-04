// Quests: tasks from Quest Givers (villagers with a "!") and Quest Boards.
// One quest at a time. Bring-Materials quests are handed in to whoever gave
// them; the other kinds finish by themselves when done.
//
// Each Quest Giver has a short chain of hand-made quests; the last ones send
// you to rescue a dragon, for a Power or an Accessory. Quest Boards make up
// endless small quests.

import type { Material } from '../build/inventory';
import type { MonsterKind } from '../monsters/monster';
import { AccessoryId, PowerId } from './rewards';

export interface Reward { wood?: number; stone?: number; gold?: number; power?: PowerId; accessory?: AccessoryId }

export type Goal =
  | { kind: 'bring'; material: Material; amount: number }
  | { kind: 'defeat'; monster: MonsterKind; count: number }
  | { kind: 'rescue'; place: string }
  | { kind: 'explore'; place: string };

export interface Quest { id: string; giver: string; title: string; says: string; goal: Goal; reward: Reward }

/** What quests need to know about the Island: names and where places are. */
export interface QuestWorld {
  home: { x: number; z: number };
  /** Monster Castles and Dungeons (id, name, where). */
  places: { id: string; name: string; x: number; z: number }[];
  caves: { id: string; x: number; z: number }[];
  /** The Prisoner's name in a Monster Castle. */
  prisoner(placeId: string): string;
}

export interface QuestState {
  active: { id: string; progress: number } | null;
  done: string[];
  boards: Record<string, number>;
}

const MONSTER_PLURAL: Record<MonsterKind, string> = {
  snail: 'Giant Snails', wolf: 'Wolves', sandSnake: 'Sand Snakes', yeti: 'Yetis', lavaWorm: 'Lava Worms', kraken: 'Krakens',
};
const MATERIAL_NAME: Record<Material, string> = { wood: 'Wood', stone: 'Stone', gold: 'Gold' };

/** Who gives what, in order. Rescued dragons ask you to free the next castle's Prisoner. */
function storyQuests(w: QuestWorld): Quest[] {
  const place = (id: string) => w.places.find((p) => p.id === id)!;
  const near = <T extends { x: number; z: number }>(list: T[], to: { x: number; z: number }) =>
    list.reduce((a, b) => (Math.hypot(a.x - to.x, a.z - to.z) < Math.hypot(b.x - to.x, b.z - to.z) ? a : b));
  const cave = near(w.caves, w.home);
  const dungeon = near(w.places.filter((p) => p.id.startsWith('dungeon')), w.home);
  const rescue = (giver: string, n: number, castle: string, reward: Reward, says: string): Quest => ({
    id: `${giver}-${n}`, giver, title: `Free ${w.prisoner(castle)}`,
    says: `${says} ${place(castle).name} holds ${w.prisoner(castle)} prisoner. Beat its Boss and set them free!`,
    goal: { kind: 'rescue', place: castle }, reward,
  });
  return [
    // Ruby, in the Home Village.
    { id: 'ruby-1', giver: 'ruby', title: 'Mend the huts', says: 'The wind has torn at our huts. Could you bring me some wood?', goal: { kind: 'bring', material: 'wood', amount: 15 }, reward: { stone: 10, gold: 5 } },
    { id: 'ruby-2', giver: 'ruby', title: 'Snails in the crops', says: 'Giant snails keep eating the meadow bare. Chase three of them off!', goal: { kind: 'defeat', monster: 'snail', count: 3 }, reward: { gold: 15 } },
    { id: 'ruby-3', giver: 'ruby', title: 'The glittering cave', says: 'Travellers speak of a cave in the hills that glitters with gold. Find it for me.', goal: { kind: 'explore', place: cave.id }, reward: { gold: 20 } },
    rescue('ruby', 4, 'castle-1', { power: 'toughScales', gold: 20 }, 'You have grown strong.'),
    // Sky, in the Home Village.
    { id: 'sky-1', giver: 'sky', title: 'Stone for the walls', says: 'We need stone to keep the monsters out. Smash some rocks and bring me ten.', goal: { kind: 'bring', material: 'stone', amount: 10 }, reward: { wood: 10, gold: 5 } },
    { id: 'sky-2', giver: 'sky', title: 'The old dungeon', says: `Something stirs in ${dungeon.name}. Go and take a look inside.`, goal: { kind: 'explore', place: dungeon.id }, reward: { gold: 20 } },
    { id: 'sky-3', giver: 'sky', title: 'Wolves in the forest', says: 'Wolves have been howling at night. Beat two of them.', goal: { kind: 'defeat', monster: 'wolf', count: 2 }, reward: { gold: 20, wood: 10 } },
    rescue('sky', 4, 'castle-2', { power: 'swiftWings', gold: 20 }, 'I have a friend in trouble.'),
    // The rescued dragons, each pointing to the next castle.
    rescue('castle-1', 1, 'castle-3', { power: 'hotterFire', gold: 30 }, 'Thank you for freeing me! My cousin is still trapped.'),
    rescue('castle-2', 1, 'castle-4', { power: 'deepLungs', gold: 30 }, 'You saved me! Please, help another.'),
    rescue('castle-3', 1, 'castle-5', { accessory: 'crown', gold: 40 }, 'A true hero! The volcano holds one more of us.'),
    rescue('castle-4', 1, 'castle-6', { accessory: 'rubyAmulet', gold: 40 }, 'The sea castle is the last. Will you go?'),
    { id: 'castle-5-1', giver: 'castle-5', title: 'Lava for a crown', says: 'Beat two Lava Worms and I will give you something that shines.', goal: { kind: 'defeat', monster: 'lavaWorm', count: 2 }, reward: { accessory: 'goldenSheen', gold: 20 } },
    { id: 'castle-6-1', giver: 'castle-6', title: 'Under the mountain', says: `Explore ${place('dungeon-4').name} and I'll teach your scales to sparkle like stars.`, goal: { kind: 'explore', place: 'dungeon-4' }, reward: { accessory: 'starlightSheen', gold: 20 } },
  ];
}

/** An endless Quest Board quest, the same for a board and number every game. */
export function boardQuest(board: string, n: number, w: QuestWorld): Quest {
  let seed = n * 7919 + [...board].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) | 0;
  const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) | 0) >>> 0) / 4294967296;
  const id = `${board}#${n}`;
  const kind = n % 3;
  if (kind === 0) {
    const material: Material = r() < 0.5 ? 'wood' : 'stone';
    const amount = 10 + Math.floor(r() * 4) * 5;
    return { id, giver: board, title: `Wanted: ${MATERIAL_NAME[material]}`, says: `Wanted: ${amount} ${MATERIAL_NAME[material]} for building. Bring it here.`, goal: { kind: 'bring', material, amount }, reward: { gold: Math.round(amount / 2), [material === 'wood' ? 'stone' : 'wood']: 5 } };
  }
  if (kind === 1) {
    const kinds: MonsterKind[] = ['snail', 'wolf', 'sandSnake', 'yeti', 'lavaWorm'];
    const monster = kinds[Math.floor(r() * kinds.length)];
    const count = 1 + Math.floor(r() * 3);
    return { id, giver: board, title: `Hunt: ${MONSTER_PLURAL[monster]}`, says: `Reward for beating ${count} ${MONSTER_PLURAL[monster]}.`, goal: { kind: 'defeat', monster, count }, reward: { gold: 8 * count + (monster === 'lavaWorm' || monster === 'yeti' ? 10 : 0) } };
  }
  const spots = [...w.caves.map((c) => ({ id: c.id, name: 'a cave' })), ...w.places.filter((p) => p.id.startsWith('dungeon')).map((p) => ({ id: p.id, name: p.name }))];
  const spot = spots[Math.floor(r() * spots.length)];
  return { id, giver: board, title: 'Explore', says: `A map pinned to the board marks ${spot.name}. Go and see it.`, goal: { kind: 'explore', place: spot.id }, reward: { gold: 15, stone: 5 } };
}

export function goalText(q: Quest, progress: number): string {
  const g = q.goal;
  switch (g.kind) {
    case 'bring': return `Bring ${g.amount} ${MATERIAL_NAME[g.material]}`;
    case 'defeat': return `Beat ${MONSTER_PLURAL[g.monster]}: ${Math.min(progress, g.count)} / ${g.count}`;
    case 'rescue': return 'Beat the Boss and free the Prisoner';
    case 'explore': return progress > 0 ? 'Found it!' : 'Find it (it’s on your Map once seen)';
  }
}

export function rewardText(r: Reward, names: { power: (p: PowerId) => string; accessory: (a: AccessoryId) => string }) {
  const parts: string[] = [];
  if (r.gold) parts.push(`${r.gold} Gold`);
  if (r.wood) parts.push(`${r.wood} Wood`);
  if (r.stone) parts.push(`${r.stone} Stone`);
  if (r.power) parts.push(`the Power of ${names.power(r.power)}`);
  if (r.accessory) parts.push(names.accessory(r.accessory));
  return parts.join(', ');
}

export class Quests {
  active: { quest: Quest; progress: number } | null = null;
  private done = new Set<string>();
  private boards: Record<string, number> = {};
  private story: Quest[];
  /** Called when a quest finishes, to hand out its reward. */
  onComplete?: (q: Quest) => void;

  constructor(private world: QuestWorld) {
    this.story = storyQuests(world);
  }

  get state(): QuestState {
    return { active: this.active && { id: this.active.quest.id, progress: this.active.progress }, done: [...this.done], boards: { ...this.boards } };
  }

  set state(s: QuestState) {
    this.done = new Set(s.done);
    this.boards = { ...s.boards };
    this.active = null;
    if (s.active) {
      const q = this.find(s.active.id);
      if (q) this.active = { quest: q, progress: s.active.progress };
    }
  }

  private find(id: string): Quest | null {
    const story = this.story.find((q) => q.id === id);
    if (story) return story;
    const [board, n] = id.split('#');
    return n !== undefined ? boardQuest(board, Number(n), this.world) : null;
  }

  /** What this giver would offer now (ignoring that you might be busy), or null. */
  offerFor(giver: string, isRescued: (place: string) => boolean): Quest | null {
    if (giver.startsWith('board')) return boardQuest(giver, this.boards[giver] ?? 0, this.world);
    for (const q of this.story.filter((s) => s.giver === giver)) {
      if (this.done.has(q.id)) continue;
      // A dragon already freed some other way doesn't need rescuing.
      if (q.goal.kind === 'rescue' && isRescued(q.goal.place)) { this.done.add(q.id); continue; }
      return q;
    }
    return null;
  }

  accept(q: Quest) {
    if (this.active) return;
    this.active = { quest: q, progress: 0 };
  }

  giveUp() { this.active = null; }

  /** Is the active quest a Bring quest for this giver, with enough in hand? */
  readyToHandIn(giver: string, have: Record<Material, number>) {
    const a = this.active;
    return !!a && a.quest.giver === giver && a.quest.goal.kind === 'bring' && have[a.quest.goal.material] >= a.quest.goal.amount;
  }

  /** Hand in a Bring quest: returns what to take from the inventory. */
  handIn(): { material: Material; amount: number } | null {
    const a = this.active;
    if (!a || a.quest.goal.kind !== 'bring') return null;
    const { material, amount } = a.quest.goal;
    this.finish();
    return { material, amount };
  }

  defeated(kind: MonsterKind) {
    const a = this.active;
    if (a?.quest.goal.kind === 'defeat' && a.quest.goal.monster === kind && ++a.progress >= a.quest.goal.count) this.finish();
  }

  rescued(place: string) {
    const a = this.active;
    if (a?.quest.goal.kind === 'rescue' && a.quest.goal.place === place) this.finish();
  }

  visited(place: string) {
    const a = this.active;
    if (a?.quest.goal.kind === 'explore' && a.quest.goal.place === place) { a.progress = 1; this.finish(); }
  }

  private finish() {
    const q = this.active!.quest;
    this.active = null;
    if (q.giver.startsWith('board')) this.boards[q.giver] = (this.boards[q.giver] ?? 0) + 1;
    else this.done.add(q.id);
    this.onComplete?.(q);
  }
}
