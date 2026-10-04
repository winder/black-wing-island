import { describe, expect, it } from 'vitest';
import { Quest, QuestWorld, Quests, boardQuest } from './quests';

const world: QuestWorld = {
  home: { x: 0, z: 0 },
  places: ['castle-1', 'castle-2', 'castle-3', 'castle-4', 'castle-5', 'castle-6', 'dungeon-2', 'dungeon-3', 'dungeon-4']
    .map((id, i) => ({ id, name: `Place ${i}`, x: i * 100, z: 0 })),
  caves: [{ id: 'cave-0', x: 50, z: 50 }, { id: 'cave-1', x: 900, z: 0 }],
  prisoner: (id) => `Prisoner of ${id}`,
};
const never = () => false;

describe('Quests', () => {
  it('offers a giver their first quest, then the next once done', () => {
    const q = new Quests(world);
    const first = q.offerFor('ruby', never)!;
    expect(first.id).toBe('ruby-1');
    q.accept(first);
    expect(q.readyToHandIn('ruby', { wood: 3, stone: 0, gold: 0 })).toBe(false);
    expect(q.readyToHandIn('ruby', { wood: 20, stone: 0, gold: 0 })).toBe(true);
    expect(q.handIn()).toEqual({ material: 'wood', amount: 15 });
    expect(q.active).toBeNull();
    expect(q.offerFor('ruby', never)!.id).toBe('ruby-2');
  });

  it('only one quest at a time', () => {
    const q = new Quests(world);
    q.accept(q.offerFor('ruby', never)!);
    q.accept(q.offerFor('sky', never)!);
    expect(q.active!.quest.giver).toBe('ruby');
  });

  it('finishes defeat quests by counting the right monsters', () => {
    const q = new Quests(world);
    const done: Quest[] = [];
    q.onComplete = (x) => done.push(x);
    q.state = { active: null, done: ['ruby-1'], boards: {} };
    q.accept(q.offerFor('ruby', never)!); // three snails
    q.defeated('wolf');
    q.defeated('snail');
    q.defeated('snail');
    expect(done).toHaveLength(0);
    q.defeated('snail');
    expect(done.map((d) => d.id)).toEqual(['ruby-2']);
  });

  it('explores the cave nearest home', () => {
    const q = new Quests(world);
    q.state = { active: null, done: ['ruby-1', 'ruby-2'], boards: {} };
    const explore = q.offerFor('ruby', never)!;
    expect(explore.goal).toEqual({ kind: 'explore', place: 'cave-0' });
  });

  it('skips rescuing a dragon who is already free', () => {
    const q = new Quests(world);
    q.state = { active: null, done: ['ruby-1', 'ruby-2', 'ruby-3'], boards: {} };
    expect(q.offerFor('ruby', (p) => p === 'castle-1')).toBeNull();
    expect(q.offerFor('ruby', never)).toBeNull(); // marked done
  });

  it('remembers the active quest across saves', () => {
    const q = new Quests(world);
    q.accept(boardQuest('board-home', 4, world));
    q.active!.progress = 1;
    const again = new Quests(world);
    again.state = q.state;
    expect(again.active!.quest.id).toBe('board-home#4');
    expect(again.active!.progress).toBe(1);
  });

  it('board quests are the same every game and move on when done', () => {
    expect(boardQuest('board-home', 2, world)).toEqual(boardQuest('board-home', 2, world));
    const q = new Quests(world);
    const b = q.offerFor('board-home', never)!;
    q.accept(b);
    if (b.goal.kind === 'bring') q.handIn();
    else if (b.goal.kind === 'defeat') for (let i = 0; i < b.goal.count; i++) q.defeated(b.goal.monster);
    else if (b.goal.kind === 'explore') q.visited(b.goal.place);
    expect(q.offerFor('board-home', never)!.id).toBe('board-home#1');
  });
});
