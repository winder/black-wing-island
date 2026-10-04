// Quest Givers in the world: villagers and Quest Boards, a "!" over each one
// with a quest for you (a "?" when you've something to hand in), and talking
// to them with T.

import * as THREE from 'three';
import { Inventory } from '../build/inventory';
import { Input } from '../input';
import { Collider, box } from '../world/collide';
import { Quest, Quests, goalText, rewardText } from './quests';
import { ACCESSORIES, POWERS } from './rewards';

const TALK_RANGE = 24;

export interface Giver {
  id: string;
  name: string;
  /** Where it stands (read each frame; villagers wander). */
  at: THREE.Object3D;
  /** How high to hang its "!". */
  height: number;
}

/** A notice board: two posts, a plank, papers pinned to it. */
function boardModel(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#6b4a2f', flatShading: true });
  const paper = new THREE.MeshLambertMaterial({ color: '#efe4c4', flatShading: true });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), wood);
    post.position.set(s * 4, 4.5, 0);
    g.add(post);
  }
  const plank = new THREE.Mesh(new THREE.BoxGeometry(9.5, 5, 0.5), wood);
  plank.position.set(0, 6, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.5, 2), wood);
  roof.position.set(0, 8.9, 0);
  g.add(plank, roof);
  for (const [x, y, r] of [[-2.6, 6.6, 0.1], [0.2, 5.6, -0.08], [2.8, 6.4, 0.15], [-0.9, 7.2, 0.05]]) {
    const note = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 0.1), paper);
    note.position.set(x, y, -0.32);
    note.rotation.z = r;
    g.add(note);
  }
  return g;
}

function markerTexture(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 110px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#1b1424';
  ctx.strokeText(text, 64, 70);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 70);
  return new THREE.CanvasTexture(c);
}

export class QuestGivers {
  readonly group = new THREE.Group();
  /** Boards standing in villages, so the dragon bumps into them. */
  readonly colliders: Collider[] = [];
  private boards = new Map<string, { model: THREE.Group; giver: Giver }>();
  private markers = new Map<string, THREE.Sprite>();
  private bang = new THREE.SpriteMaterial({ map: markerTexture('!', '#ffd84a'), depthTest: false });
  private ask = new THREE.SpriteMaterial({ map: markerTexture('?', '#9ae6ff'), depthTest: false });
  /** The giver you're talking to, and what they offered. */
  private talking: { giver: Giver; offer: Quest | null } | null = null;
  private t = 0;
  private hint: HTMLDivElement;
  private dialog: HTMLDivElement;
  private tracker: HTMLDivElement;

  constructor(
    hud: HTMLElement, private quests: Quests, private inventory: Inventory,
    private isRescued: (place: string) => boolean, private say: (text: string) => void,
  ) {
    this.hint = document.createElement('div');
    this.hint.className = 'talk-hint hidden';
    this.dialog = document.createElement('div');
    this.dialog.className = 'quest-dialog hidden';
    this.tracker = document.createElement('div');
    this.tracker.className = 'quest-tracker hidden';
    hud.append(this.hint, this.dialog, this.tracker);
  }

  /** Make sure a Quest Board stands here (a village's board). */
  board(id: string, x: number, y: number, z: number, faceX: number, faceZ: number) {
    if (this.boards.has(id)) return;
    const model = boardModel();
    model.position.set(x, y, z);
    model.rotation.y = Math.atan2(x - faceX, z - faceZ);
    this.group.add(model);
    this.boards.set(id, { model, giver: { id, name: 'the Quest Board', at: model, height: 13 } });
    this.colliders.push(box(x, z, 5, 1, y + 9, model.rotation.y));
  }

  /** Forget the boards in built villages (switching saves); the Home Village board stays. */
  clearBoards(keep: string) {
    for (const [id, b] of this.boards) if (id !== keep) { this.group.remove(b.model); this.boards.delete(id); }
    this.colliders.length = 0;
    const home = this.boards.get(keep);
    if (home) this.colliders.push(box(home.model.position.x, home.model.position.z, 5, 1, home.model.position.y + 9, home.model.rotation.y));
  }

  /** Every giver, given the villagers who give quests. */
  private all(villagers: Giver[]): Giver[] {
    return [...villagers, ...[...this.boards.values()].map((b) => b.giver)];
  }

  update(dt: number, input: Input, player: THREE.Vector3, villagers: Giver[], enabled: boolean) {
    this.t += dt;
    const givers = this.all(villagers);
    const busy = this.quests.active;

    // "!" over anyone with a quest for you, "?" over whoever's waiting for what you've brought.
    const wanted = new Set<string>();
    for (const g of givers) {
      const ready = this.quests.readyToHandIn(g.id, this.inventory);
      const offers = !busy && this.quests.offerFor(g.id, this.isRescued);
      if (!ready && !offers) continue;
      wanted.add(g.id);
      let m = this.markers.get(g.id);
      if (!m) {
        m = new THREE.Sprite(this.bang);
        m.scale.setScalar(6);
        m.renderOrder = 5;
        this.markers.set(g.id, m);
        this.group.add(m);
      }
      m.material = ready ? this.ask : this.bang;
      const pos = g.at.getWorldPosition(new THREE.Vector3());
      m.position.set(pos.x, pos.y + g.height * g.at.scale.y + Math.sin(this.t * 3) * 0.6, pos.z);
    }
    for (const [id, m] of this.markers) if (!wanted.has(id)) { this.group.remove(m); this.markers.delete(id); }

    // Who's close enough to talk to?
    let near: Giver | null = null, nearD = TALK_RANGE;
    if (enabled) for (const g of givers) {
      const p = g.at.getWorldPosition(new THREE.Vector3());
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < nearD) { nearD = d; near = g; }
    }
    if (this.talking && this.talking.giver.id !== near?.id) this.close();
    this.hint.classList.toggle('hidden', !near || !!this.talking);
    if (near) this.hint.innerHTML = `<b>T</b> ${near.id.startsWith('board') ? 'Read the Quest Board' : `Talk to ${near.name}`}`;

    if (near && input.wasPressed('KeyT')) this.talk(near);
    else if (this.talking && input.wasPressed('KeyX')) {
      const a = this.quests.active;
      if (a && a.quest.giver === this.talking.giver.id && !this.talking.offer) {
        this.quests.giveUp();
        this.say(`You gave up: ${a.quest.title}`);
      }
      this.close();
    }
    this.drawTracker();
  }

  private talk(g: Giver) {
    const a = this.quests.active;
    // Second T on an offer: accept it.
    if (this.talking?.giver.id === g.id && this.talking.offer) {
      this.quests.accept(this.talking.offer);
      this.say(`New quest: ${this.talking.offer.title}`);
      this.close();
      return;
    }
    if (this.quests.readyToHandIn(g.id, this.inventory)) {
      const take = this.quests.handIn();
      if (take) this.inventory[take.material] -= take.amount;
      this.close();
      return;
    }
    const names = { power: (p: keyof typeof POWERS) => POWERS[p].name, accessory: (x: keyof typeof ACCESSORIES) => ACCESSORIES[x].name };
    const who = g.id.startsWith('board') ? 'Quest Board' : g.name;
    let body: string, keys: string, offer: Quest | null = null;
    if (a && a.quest.giver === g.id) {
      body = `<p>${a.quest.says}</p><p class="goal">${goalText(a.quest, a.progress)}</p>`;
      keys = '<b>X</b> give up · walk away to close';
    } else if (a) {
      body = `<p>${g.id.startsWith('board') ? 'Finish the quest you have first.' : 'Come back when you’ve finished your quest!'}</p><p class="goal">${a.quest.title}: ${goalText(a.quest, a.progress)}</p>`;
      keys = '<b>X</b> close';
    } else {
      offer = this.quests.offerFor(g.id, this.isRescued);
      if (offer) {
        body = `<h4>${offer.title}</h4><p>${offer.says}</p><p class="goal">${goalText(offer, 0)}</p><p class="reward">Reward: ${rewardText(offer.reward, names)}</p>`;
        keys = '<b>T</b> accept · <b>X</b> not now';
      } else {
        body = '<p>Thank you, dragon! I’ve nothing for you just now.</p>';
        keys = '<b>X</b> close';
      }
    }
    this.dialog.innerHTML = `<h3>${who}</h3>${body}<div class="keys">${keys}</div>`;
    this.dialog.classList.remove('hidden');
    this.talking = { giver: g, offer };
  }

  private close() {
    this.talking = null;
    this.dialog.classList.add('hidden');
  }

  private drawTracker() {
    const a = this.quests.active;
    this.tracker.classList.toggle('hidden', !a);
    if (!a) return;
    const ready = a.quest.goal.kind === 'bring' && this.inventory[a.quest.goal.material] >= a.quest.goal.amount;
    const html = `<b>${a.quest.title}</b><br>${goalText(a.quest, a.progress)}${ready ? '<br><i>Ready! Take it back.</i>' : ''}`;
    if (this.tracker.innerHTML !== html) this.tracker.innerHTML = html;
  }
}
