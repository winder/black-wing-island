// Going through Portals: fade to black, swap the outside world for an
// Interior (or back), fade in. Also lights the Interior: a few torch lights
// that follow you from torch to torch.

import * as THREE from 'three';
import { Interior } from './interior';
import { BIOME_STONE, Place } from './places';

const FADE_SECONDS = 0.45;
const TORCH_LIGHTS = 5;

export class Interiors {
  /** The Interior you're in, and which place it belongs to. */
  current: { place: Place; interior: Interior } | null = null;
  /** Set while fading; the player shouldn't move. */
  busy = false;
  /** Where you come back out: in front of the place's doorway, facing away from it. */
  private back = { pos: new THREE.Vector3(), yaw: 0 };
  private fade: HTMLDivElement;
  // A fixed number of lights, always in the scene, so materials never need recompiling.
  private lights: THREE.PointLight[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene, ui: HTMLElement, private onSwap: (inside: boolean) => void) {
    this.fade = document.createElement('div');
    this.fade.className = 'fade';
    ui.appendChild(this.fade);
    for (let i = 0; i < TORCH_LIGHTS; i++) {
      const l = new THREE.PointLight('#ff9a50', 0, 90, 1.6);
      this.lights.push(l);
      scene.add(l);
    }
  }

  /** Where to say the player is (for saving): outside, by the door, if inside. */
  get outsidePos() { return this.current ? this.back : null; }

  async enter(place: Place, player: { position: THREE.Vector3; yaw: number; enterIndoors(i: Interior | null, at: THREE.Vector3, yaw: number): void }) {
    if (this.busy || this.current) return;
    this.busy = true;
    await this.fadeTo(1);
    const out = new THREE.Vector3(-Math.sin(place.rot), 0, -Math.cos(place.rot));
    this.back.pos.copy(place.portal).addScaledVector(out, 20);
    this.back.yaw = place.rot;
    const interior = new Interior(place.seed, place.kind === 'castle' ? 'castle' : 'dungeon', BIOME_STONE[place.biome]);
    this.scene.add(interior.group);
    this.current = { place, interior };
    player.enterIndoors(interior, interior.arrive, interior.arriveYaw);
    this.onSwap(true);
    await this.fadeTo(0);
    this.busy = false;
  }

  async leave(player: { enterIndoors(i: Interior | null, at: THREE.Vector3, yaw: number): void }, to?: { pos: THREE.Vector3; yaw: number }) {
    if (this.busy || !this.current) return;
    this.busy = true;
    await this.fadeTo(1);
    this.scene.remove(this.current.interior.group);
    this.current.interior.dispose();
    this.current = null;
    const dest = to ?? this.back;
    player.enterIndoors(null, dest.pos, dest.yaw);
    this.onSwap(false);
    for (const l of this.lights) l.intensity = 0;
    await this.fadeTo(0);
    this.busy = false;
  }

  /** Light the torches nearest the player, flickering. */
  update(dt: number, at: THREE.Vector3) {
    this.t += dt;
    if (!this.current) return;
    const torches = [...this.current.interior.torches].sort((a, b) => a.distanceToSquared(at) - b.distanceToSquared(at));
    this.lights.forEach((l, i) => {
      const p = torches[i];
      if (!p) { l.intensity = 0; return; }
      l.position.copy(p);
      l.intensity = 260 * (1 + Math.sin(this.t * 11 + i * 1.7) * 0.08 + Math.sin(this.t * 23 + i) * 0.05);
    });
  }

  private fadeTo(opacity: number) {
    this.fade.style.opacity = String(opacity);
    return new Promise<void>((done) => setTimeout(done, FADE_SECONDS * 1000));
  }
}
