// The great hall at the end of an Interior: where the Boss waits, guarding a
// Prisoner in a cage (Monster Castles) or a Gold Hoard (Dungeons).

import * as THREE from 'three';
import { DragonModel, makeDragon } from '../player/dragonModel';
import { BOSS_GOLD, spawnBoss } from '../monsters/bosses';
import { Monster, World } from '../monsters/monster';
import { Collider } from '../world/collide';
import { villagerColors } from '../world/village';
import { CELL, Interior, ORIGIN, roomCenter } from './interior';
import { Place } from './places';

export const HOARD_GOLD = 150;
/** Bosses hit this much harder than the ordinary monster. */
const BOSS_DAMAGE = 1.6;

/** What a place's Prisoner is called and looks like. */
const PRISONER_NAMES = ['Ember', 'Sapphire', 'Thorn', 'Nimbus', 'Coral', 'Willow', 'Blaze', 'Pebble', 'Storm'];
export function prisonerFor(place: Place) {
  return { name: PRISONER_NAMES[place.seed % PRISONER_NAMES.length], colorSeed: place.seed + 3 };
}

export interface LairEvents {
  bossDefeated(place: Place, boss: Monster): void;
  rescued(place: Place): void;
  hoardTaken(place: Place): void;
  /** Say something on screen. */
  say(text: string): void;
}

export class Lair {
  readonly group = new THREE.Group();
  readonly monsters: Monster[] = [];
  readonly colliders: Collider[] = [];
  private world: World;
  private noticed = false;
  private rewarded = new Set<Monster>();
  private cage?: { bars: THREE.Group; dragon: DragonModel; open: number; flight: number; velocity: THREE.Vector3; done: boolean };
  private hoard?: { pile: THREE.Group; at: THREE.Vector3; taken: boolean; warned: boolean };
  private t = 0;

  constructor(
    private place: Place, private interior: Interior, outside: World,
    state: { beaten: boolean; hoardTaken: boolean }, private events: LairEvents,
  ) {
    // Inside, monsters stand on the Interior's floor and there are no villages to keep out of.
    this.world = {
      ...outside,
      island: interior,
      villages: () => [],
      hurtPlayer: (amount, from, shove) => outside.hurtPlayer(amount * BOSS_DAMAGE, from, shove * 1.2),
    };
    const hall = interior.layout.boss;
    const centre = roomCenter(hall);
    // The prize goes at the far side of the hall from the way in.
    const start = roomCenter(interior.layout.start);
    const away = centre.clone().sub(start).setY(0).normalize();
    const reach = (Math.min(hall.w, hall.d) * CELL) / 2 - 16;
    const prize = centre.clone().addScaledVector(away, reach);

    if (!state.beaten) {
      // Small enough to fit under the roof, with room to fly over it.
      const roof = interior.ceilingAt(centre.x, centre.z) - ORIGIN.y;
      const boss = spawnBoss(place.boss, centre.clone().addScaledVector(away, -10), roof * 0.55);
      this.monsters.push(boss);
      this.group.add(boss.group);
    }
    if (place.kind === 'castle') this.makeCage(prize, centre, state.beaten);
    else this.makeHoard(prize, state.hoardTaken);
    if (place.boss === 'kraken') {
      // The Kraken Queen lurks in a flooded hall.
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(hall.w * CELL - 2, hall.d * CELL - 2).rotateX(-Math.PI / 2),
        new THREE.MeshPhongMaterial({ color: '#1d4a6a', transparent: true, opacity: 0.85, shininess: 80 }),
      );
      pool.position.set(centre.x, ORIGIN.y + 0.4, centre.z);
      this.group.add(pool);
    }
  }

  get boss() { return this.monsters[0] ?? null; }

  private makeCage(at: THREE.Vector3, facing: THREE.Vector3, open: boolean) {
    const bars = new THREE.Group();
    const iron = new THREE.MeshLambertMaterial({ color: '#2b2a2e', flatShading: true });
    const R = 8, H = 15;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, H, 5), iron);
      bar.position.set(Math.cos(a) * R, H / 2, Math.sin(a) * R);
      bars.add(bar);
    }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.6, 0.8, 14), iron);
    lid.position.y = H;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 4), iron);
    chain.position.y = H + 15;
    bars.add(lid, chain);
    bars.position.copy(at);
    this.group.add(bars);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.5, R + 2, 1, 14), iron);
    floor.position.copy(at).setY(ORIGIN.y + 0.5);
    this.group.add(floor);

    const { colorSeed } = prisonerFor(this.place);
    const [body, accent] = villagerColors(colorSeed);
    const dragon = makeDragon(body, accent);
    dragon.root.scale.setScalar(0.55);
    dragon.root.position.copy(at).setY(ORIGIN.y + 1);
    dragon.root.rotation.y = Math.atan2(at.x - facing.x, at.z - facing.z);
    dragon.update(0, { mode: 'walk', velocity: new THREE.Vector3(), yaw: dragon.root.rotation.y });
    if (open) {
      bars.position.y = -H - 1;
      dragon.root.visible = false;
    } else {
      this.colliders.push({ x: at.x, z: at.z, r: R + 1, height: ORIGIN.y + H });
    }
    this.group.add(dragon.root);
    this.cage = { bars, dragon, open: open ? 1 : 0, flight: 0, velocity: new THREE.Vector3(), done: open };
  }

  private makeHoard(at: THREE.Vector3, taken: boolean) {
    const pile = new THREE.Group();
    const gold = new THREE.MeshLambertMaterial({ color: '#f2c230', emissive: '#7a5200', emissiveIntensity: 0.9, flatShading: true });
    const wood = new THREE.MeshLambertMaterial({ color: '#5a3a22', flatShading: true });
    // A heap of coins and bars, a couple of chests spilling over.
    const heap = new THREE.Mesh(new THREE.ConeGeometry(9, 5, 9), gold);
    heap.position.y = 2.5;
    pile.add(heap);
    let seed = this.place.seed;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = r() * 11;
      const bit = new THREE.Mesh(i % 3 ? new THREE.CylinderGeometry(0.7, 0.7, 0.25, 7) : new THREE.BoxGeometry(1.6, 0.6, 0.8), gold);
      bit.position.set(Math.cos(a) * d, Math.max(0.2, 4.5 - d * 0.45) * r(), Math.sin(a) * d);
      bit.rotation.set(r() * 3, r() * 3, r() * 3);
      pile.add(bit);
    }
    for (const s of [-1, 1]) {
      const chest = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 3.2), wood);
      chest.position.set(s * 9, 1.6, -3);
      chest.rotation.y = s * 0.4;
      pile.add(chest);
    }
    pile.position.copy(at).setY(ORIGIN.y);
    pile.visible = !taken;
    this.group.add(pile);
    this.hoard = { pile, at: at.clone(), taken, warned: false };
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.t += dt;
    const boss = this.boss;
    for (const m of this.monsters) {
      m.update(dt, this.world);
      if (!m.alive && !this.rewarded.has(m)) {
        this.rewarded.add(m);
        this.events.bossDefeated(this.place, m);
        this.events.say(`You beat ${m.name.replace(/^The/, 'the')}! +${BOSS_GOLD} gold`);
        if (this.cage) this.cage.open = 0.001;
      }
    }
    if (boss && !this.noticed && boss.aggro) {
      this.noticed = true;
      this.events.say(boss.name);
    }
    for (const m of this.monsters.filter((m) => m.finished)) {
      this.group.remove(m.group);
      this.monsters.splice(this.monsters.indexOf(m), 1);
    }

    const cage = this.cage;
    if (cage && !cage.done) {
      const d = cage.dragon;
      if (cage.open > 0) {
        // The bars sink into the floor, then the Prisoner flies off for home.
        cage.open = Math.min(1, cage.open + dt / 2.5);
        cage.bars.position.y = ORIGIN.y - cage.open * 16;
        this.colliders.length = 0;
        if (cage.open >= 1) {
          if (cage.flight === 0) this.events.say(`${prisonerFor(this.place).name} is free!`);
          cage.flight += dt;
          const exit = this.interior.exit;
          const toExit = exit.clone().sub(d.root.position).setY(0).normalize();
          cage.velocity.set(toExit.x * 14, cage.flight < 2 ? 6 : 1, toExit.z * 14);
          d.root.position.addScaledVector(cage.velocity, dt);
          d.root.rotation.y = Math.atan2(-toExit.x, -toExit.z);
          d.update(dt, { mode: 'fly', velocity: cage.velocity, yaw: d.root.rotation.y });
          if (cage.flight > 4) {
            d.root.visible = false;
            cage.done = true;
            this.events.rescued(this.place);
          }
          return;
        }
      }
      // Waiting in the cage: shuffling, looking about.
      d.update(dt, { mode: 'walk', velocity: new THREE.Vector3(), yaw: d.root.rotation.y, pitch: Math.sin(this.t * 0.7) * 0.3 });
    }

    const hoard = this.hoard;
    if (hoard && !hoard.taken) {
      hoard.pile.rotation.y = Math.sin(this.t * 0.3) * 0.02;
      const near = Math.hypot(playerPos.x - hoard.at.x, playerPos.z - hoard.at.z) < 18;
      if (near && boss?.alive) {
        if (!hoard.warned) { hoard.warned = true; this.events.say(`${boss.name} guards this gold!`); }
      } else if (near) {
        hoard.taken = true;
        hoard.pile.visible = false;
        this.events.hoardTaken(this.place);
      }
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
