// Build Mode: B opens the build menu; pick a building with 1-5; a see-through
// Ghost follows where you look (green = OK, red = not here). Click to build,
// R to turn it, B or right-click to stop.

import * as THREE from 'three';
import { Input } from '../input';
import { Island } from '../world/island';
import { blueprint } from './blueprints';
import { BUILDINGS, BUILD_ORDER, BuildingKind, Inventory, describeCost } from './inventory';
import { Buildings } from './buildings';

const REACH = 160;
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

export class BuildMode {
  menuOpen = false;
  selected: BuildingKind | null = null;
  private rot = 0;
  private seed = 1;
  private ghost = new THREE.Group();
  private ghostFor: string | null = null;
  private okMat = new THREE.MeshBasicMaterial({ color: '#5dff7a', transparent: true, opacity: 0.35, depthWrite: false });
  private badMat = new THREE.MeshBasicMaterial({ color: '#ff5050', transparent: true, opacity: 0.35, depthWrite: false });
  private menu = document.createElement('div');
  private spot: THREE.Vector3 | null = null;
  private problem: string | null = null;

  constructor(
    scene: THREE.Scene, parent: HTMLElement,
    private island: Island, private inventory: Inventory, private buildings: Buildings,
    private onBuild: (kind: BuildingKind) => void,
  ) {
    scene.add(this.ghost);
    this.menu.className = 'build-menu hidden';
    parent.appendChild(this.menu);
    this.newSeed();
  }

  /** While a building is picked, the mouse places it instead of fighting. */
  get usingMouse() { return this.selected !== null; }

  private newSeed() { this.seed = Math.floor(Math.random() * 1e9); }

  update(input: Input, camera: THREE.Camera, player: THREE.Vector3) {
    if (input.wasPressed('KeyB')) {
      if (this.selected || this.menuOpen) this.close();
      else this.menuOpen = true;
    }
    if (this.menuOpen) {
      DIGITS.forEach((d, i) => {
        if (input.wasPressed(d)) { this.selected = BUILD_ORDER[i]; this.menuOpen = false; this.newSeed(); }
      });
    }
    if (this.selected) {
      if (input.wasClicked(2)) this.close();
      if (input.wasPressed('KeyR')) this.rot += Math.PI / 4;
    }
    this.place(input, camera, player);
    this.drawMenu();
  }

  private close() {
    this.menuOpen = false;
    this.selected = null;
    this.ghost.visible = false;
  }

  private place(input: Input, camera: THREE.Camera, player: THREE.Vector3) {
    const kind = this.selected;
    if (!kind) { this.ghost.visible = false; return; }
    this.spot = this.aim(camera);
    if (!this.spot) { this.ghost.visible = false; this.problem = 'Look at the ground to build'; return; }
    // Never on top of the dragon: push it out in front.
    const room = blueprint(kind, 1).footprint + 10;
    const flat = new THREE.Vector3(this.spot.x - player.x, 0, this.spot.z - player.z);
    if (flat.length() < room) {
      const fwd = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      this.spot.set(player.x + fwd.x * room, 0, player.z + fwd.z * room);
      this.spot.y = this.island.heightAt(this.spot.x, this.spot.z);
    }

    const info = BUILDINGS[kind];
    const where = this.buildings.problem(kind, this.spot.x, this.spot.z, info.needsVillage);
    this.problem = !this.inventory.canAfford(info.cost) ? `Not enough materials (needs ${describeCost(info.cost)})` : where;
    this.showGhost(kind, this.spot, this.problem === null);

    if (input.wasClicked(0) && this.problem === null && this.inventory.spend(info.cost)) {
      this.buildings.add({ kind, seed: this.seed, x: this.spot.x, z: this.spot.z, rot: this.rot });
      this.onBuild(kind);
      this.newSeed();
      this.ghostFor = null;
      this.close(); // watch it go up; press B again to build more
    }
  }

  /** Where the middle of the screen points at the ground. */
  private aim(camera: THREE.Camera): THREE.Vector3 | null {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3());
    let prev = origin.clone();
    for (let d = 4; d <= REACH; d += 2) {
      const p = origin.clone().addScaledVector(dir, d);
      if (p.y <= this.island.heightAt(p.x, p.z)) {
        // Refine between the last point above ground and this one.
        for (let i = 0; i < 6; i++) {
          const mid = prev.clone().lerp(p, 0.5);
          if (mid.y <= this.island.heightAt(mid.x, mid.z)) p.copy(mid); else prev = mid;
        }
        return p;
      }
      prev = p;
    }
    return null;
  }

  private showGhost(kind: BuildingKind, at: THREE.Vector3, ok: boolean) {
    const key = `${kind}:${this.seed}`;
    if (this.ghostFor !== key) {
      this.ghost.clear();
      for (const part of blueprint(kind, this.seed).parts) {
        const m = new THREE.Mesh(part.geometry, this.okMat);
        m.matrixAutoUpdate = false;
        m.matrix.copy(part.matrix);
        this.ghost.add(m);
      }
      this.ghostFor = key;
    }
    const mat = ok ? this.okMat : this.badMat;
    this.ghost.children.forEach((c) => { (c as THREE.Mesh).material = mat; });
    this.ghost.position.copy(at);
    this.ghost.rotation.y = this.rot;
    this.ghost.visible = true;
  }

  private drawMenu() {
    const show = this.menuOpen || this.selected !== null;
    this.menu.classList.toggle('hidden', !show);
    if (!show) return;
    if (this.menuOpen) {
      this.menu.innerHTML = `<h3>Build</h3>` + BUILD_ORDER.map((k, i) => {
        const b = BUILDINGS[k];
        const can = this.inventory.canAfford(b.cost);
        return `<div class="row ${can ? '' : 'poor'}"><b>${i + 1}</b> ${b.name}<span>${describeCost(b.cost)}</span></div>`;
      }).join('') + `<p>Press a number to pick · B to close</p>`;
    } else if (this.selected) {
      const b = BUILDINGS[this.selected];
      this.menu.innerHTML = `<h3>${b.name}</h3><p class="${this.problem ? 'bad' : 'good'}">${this.problem ?? 'Click to build here'}</p>
        <p>R to turn · B or right-click to stop</p>`;
    }
  }
}
