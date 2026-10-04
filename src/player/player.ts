// The Player Dragon: walking, flying, swimming and diving, and the camera that
// goes with it (first person by default, third person on V).

import * as THREE from 'three';
import { Vitals } from '../combat/vitals';
import { Input } from '../input';
import { Island } from '../world/island';
import type { Indoors } from '../places/interior';
import type { Caves } from '../places/caves';
import { makeDragon, DragonModel } from './dragonModel';
import { wear } from './accessories';

export type Mode = 'walk' | 'fly' | 'swim';

const GRAVITY = 30;
const EYE = 4.4;            // eye height when standing
const SWIM_DEPTH = 3.2;     // how far the feet hang below the surface when swimming
const WALK_SPEED = 9, RUN_SPEED = 20;
const FLY_SPEED = 20, BOOST_SPEED = 30; // boost: ~5 minutes from head to tail
const SWIM_SPEED = 7, SWIM_FAST = 12;
const WIND_START = 450;     // metres out to sea before the wind pushes back
const MOUSE_SENSITIVITY = 0.0022;

export interface PlayerState {
  x: number; y: number; z: number; yaw: number; pitch: number; mode: Mode;
}

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  mode: Mode = 'walk';
  underwater = false;
  thirdPerson = false;
  /** Wing beat phase, for sound. */
  flap = 0;
  /** Set by the attacks each frame, so the model can open its mouth or swipe a paw. */
  breathing = false;
  swipe: { t: number; side: number } | null = null;
  model: DragonModel;
  readonly vitals = new Vitals();
  /** While something (a Kraken tentacle) holds the dragon, it is dragged to this point and can't move. */
  heldAt: THREE.Vector3 | null = null;
  private fpWings: DragonModel;
  /** Swift Wings: how much faster flying is. */
  speedBoost = 1;
  /** Set while inside an Interior: its floor, ceiling and walls replace the Island's. */
  indoors: Indoors | null = null;
  /** The Island's caves: inside a tunnel, its floor and roof replace the ground. */
  caves: Caves | null = null;
  private probe = new THREE.Vector3();

  constructor(private island: Island, private camera: THREE.PerspectiveCamera, private scene: THREE.Scene) {
    this.model = makeDragon();
    scene.add(this.model.root);
    // First-person wings: a second dragon hung under the camera with only its
    // wings showing, swept forward so they're in view at the screen edges.
    this.fpWings = makeDragon();
    this.fpWings.body.visible = this.fpWings.eyes.visible = false;
    this.fpWings.anim.extraSweep = 0.9;
    this.fpWings.root.position.set(0, -2.2, 0.6);
    this.fpWings.root.scale.setScalar(0.3);
    this.fpWings.root.visible = false;
    camera.add(this.fpWings.root);
  }

  /** Change how the dragon looks: scale colours, a sheen, a crown, an amulet. */
  dress(look: { color?: string; accent?: string; sheen?: string; crown: boolean; amulet: boolean }) {
    const color = look.color ?? '#16131c', accent = look.accent ?? '#3b2f52';
    this.scene.remove(this.model.root);
    const wasVisible = this.model.root.visible;
    this.model = makeDragon(color, accent, look.sheen);
    this.model.root.visible = wasVisible;
    wear(this.model, look);
    this.scene.add(this.model.root);
    // The first-person wings match.
    const fp = makeDragon(color, accent, look.sheen);
    fp.body.visible = fp.eyes.visible = false;
    fp.anim.extraSweep = this.fpWings.anim.extraSweep;
    fp.root.position.copy(this.fpWings.root.position);
    fp.root.scale.copy(this.fpWings.root.scale);
    fp.root.visible = this.fpWings.root.visible;
    this.camera.remove(this.fpWings.root);
    this.camera.add(fp.root);
    this.fpWings = fp;
  }

  get state(): PlayerState {
    const p = this.position;
    return { x: p.x, y: p.y, z: p.z, yaw: this.yaw, pitch: this.pitch, mode: this.mode };
  }

  set state(s: PlayerState) {
    this.position.set(s.x, s.y, s.z);
    this.yaw = s.yaw;
    this.pitch = s.pitch;
    this.mode = s.mode;
    this.velocity.set(0, 0, 0);
  }

  /** Stand somewhere on the ground. */
  placeAt(x: number, z: number, yaw = 0) {
    this.position.set(x, this.island.heightAt(x, z), z);
    this.yaw = yaw;
    this.pitch = 0;
    this.mode = 'walk';
    this.velocity.set(0, 0, 0);
  }

  /** Go into (or, with null, out of) an Interior, standing at `at`. */
  enterIndoors(indoors: Indoors | null, at: THREE.Vector3, yaw: number) {
    this.indoors = indoors;
    this.heldAt = null; // whatever was holding on is left behind
    this.position.copy(at);
    this.position.y = indoors ? indoors.floorAt(at.x, at.z) : this.island.heightAt(at.x, at.z);
    this.yaw = yaw;
    this.pitch = 0;
    this.mode = 'walk';
    this.underwater = false;
    this.velocity.set(0, 0, 0);
  }

  /** Where fire comes out: the front of the dragon's head. */
  mouth(out = new THREE.Vector3()) {
    const ahead = this.thirdPerson ? 5.5 : 5;
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(ahead).add(this.position);
    out.y += this.mode === 'fly' ? 3.2 : 4.0;
    return out;
  }

  /** The middle of the dragon's body, for things hitting it. */
  center(out = new THREE.Vector3()) {
    return out.copy(this.position).setY(this.position.y + 2.6);
  }

  /** Get shoved, e.g. by a monster's hit. */
  knockback(push: THREE.Vector3) {
    if (this.heldAt) return;
    this.velocity.add(push);
    if (this.mode === 'walk' && push.y > 0) this.position.y += 0.5;
  }

  /** Direction the dragon is looking. */
  lookDir(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  private surfaceAt(x: number, z: number) {
    if (this.indoors) return { ground: this.indoors.floorAt(x, z), water: -Infinity, inland: false, coast: Infinity };
    const cave = this.caves?.at(this.probe.set(x, this.position.y, z));
    if (cave) return { ground: cave.floor, water: -Infinity, inland: false, coast: Infinity };
    const g = this.island.ground(x, z);
    const ocean = g.height < 0 ? 0 : -Infinity;
    return { ground: g.height, water: Math.max(g.water, ocean), inland: g.water !== -Infinity, coast: g.coast };
  }

  update(dt: number, input: Input) {
    if (input.locked) {
      this.yaw -= input.mouseDX * MOUSE_SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * MOUSE_SENSITIVITY, -1.45, 1.45);
    }
    if (input.wasPressed('KeyV')) this.thirdPerson = !this.thirdPerson;

    if (this.heldAt) {
      // Grabbed: dragged along, can only look around and fight back.
      this.position.lerp(this.heldAt, 1 - Math.exp(-6 * dt));
      this.velocity.set(0, 0, 0);
      this.mode = 'fly';
      this.animate(dt);
      this.placeCamera();
      return;
    }
    if (this.vitals.knockedOut) {
      this.velocity.multiplyScalar(Math.exp(-3 * dt));
      this.animate(dt);
      this.placeCamera();
      return;
    }

    const fwd = input.isDown('KeyW', 'ArrowUp') ? 1 : 0;
    const back = input.isDown('KeyS', 'ArrowDown') ? 1 : 0;
    const right = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const fast = input.isDown('ShiftLeft', 'ShiftRight');
    const up = input.isDown('Space');
    const down = input.isDown('KeyC', 'ControlLeft', 'ControlRight');
    const flatFwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const flatRight = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const p = this.position, v = this.velocity;
    let here = this.surfaceAt(p.x, p.z);

    if (this.mode === 'walk') {
      const speed = fast ? RUN_SPEED : WALK_SPEED;
      const want = flatFwd.clone().multiplyScalar(fwd - back).addScaledVector(flatRight, right);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(speed);
      v.x = THREE.MathUtils.damp(v.x, want.x, 10, dt);
      v.z = THREE.MathUtils.damp(v.z, want.z, 10, dt);
      v.y -= GRAVITY * dt;
      p.addScaledVector(v, dt);
      here = this.surfaceAt(p.x, p.z);
      if (p.y <= here.ground) { p.y = here.ground; v.y = 0; }
      if (input.wasPressed('Space')) { this.mode = 'fly'; v.y = 14; }
      else if (here.water - here.ground > SWIM_DEPTH && p.y < here.water) this.mode = 'swim';
      else if (p.y > here.ground + 3) this.mode = 'fly'; // walked off a cliff: spread wings
    } else if (this.mode === 'fly') {
      const speed = (fast ? BOOST_SPEED : FLY_SPEED) * this.speedBoost;
      const look = this.lookDir();
      const want = new THREE.Vector3()
        .addScaledVector(look, (fwd - back * 0.5) * speed)
        .addScaledVector(flatRight, right * speed * 0.6);
      if (up) want.y += 14;
      if (down) want.y -= 18;
      v.lerp(want, 1 - Math.exp(-(fwd ? 1.6 : 2.4) * dt));
      p.addScaledVector(v, dt);
      here = this.surfaceAt(p.x, p.z);
      if (p.y < here.water && here.water > here.ground) {
        this.mode = 'swim';
        v.multiplyScalar(0.3);
      } else if (p.y <= here.ground + 0.2) {
        p.y = here.ground;
        if (v.y < 2) { this.mode = 'walk'; v.y = 0; }
      }
    } else {
      // Swimming at the surface, or diving under it (only in lakes and rivers).
      const speed = fast ? SWIM_FAST : SWIM_SPEED;
      if (this.underwater) {
        const want = this.lookDir().multiplyScalar((fwd - back) * speed).addScaledVector(flatRight, right * speed * 0.6);
        if (up) want.y += 6;
        if (down) want.y -= 6;
        v.lerp(want, 1 - Math.exp(-3 * dt));
      } else {
        const want = flatFwd.clone().multiplyScalar(fwd - back).addScaledVector(flatRight, right);
        if (want.lengthSq() > 1) want.normalize();
        want.multiplyScalar(speed);
        v.x = THREE.MathUtils.damp(v.x, want.x, 4, dt);
        v.z = THREE.MathUtils.damp(v.z, want.z, 4, dt);
        v.y = THREE.MathUtils.damp(v.y, 0, 6, dt);
        const floatY = here.water - SWIM_DEPTH;
        p.y = THREE.MathUtils.damp(p.y, floatY, 8, dt);
        if (input.wasPressed('Space')) { this.mode = 'fly'; v.y = 16; p.y = Math.max(p.y, floatY + 1); }
        else if (down && here.inland) { this.underwater = true; v.y = -4; }
      }
      p.addScaledVector(v, dt);
      here = this.surfaceAt(p.x, p.z);
      if (this.underwater && p.y + EYE > here.water - 0.5 && v.y >= 0 && !down) this.underwater = false;
      if (p.y < here.ground) { p.y = here.ground; v.y = Math.max(0, v.y); }
      if (here.water - here.ground < SWIM_DEPTH - 0.5) { this.mode = 'walk'; this.underwater = false; }
    }
    if (this.mode !== 'swim') this.underwater = false;
    // Indoors, the roof stops you flying up through it.
    if (this.indoors) {
      const roof = this.indoors.ceilingAt(p.x, p.z) - 6;
      if (p.y > roof) { p.y = roof; v.y = Math.min(0, v.y); }
    } else {
      const cave = this.caves?.at(p);
      if (cave && p.y > cave.ceiling - 6) { p.y = cave.ceiling - 6; v.y = Math.min(0, v.y); }
    }

    // Out at sea, the wind pushes the dragon back towards the Island.
    if (here.coast < -WIND_START) {
      const push = Math.min(40, (-here.coast - WIND_START) * 0.08);
      const home = new THREE.Vector3(-p.x, 0, -p.z).normalize();
      v.addScaledVector(home, push * dt);
    }

    this.animate(dt);
    this.placeCamera();
  }

  private animate(dt: number) {
    const flying = this.mode === 'fly';
    const m = this.model.root;
    m.position.copy(this.position);
    m.rotation.set(0, this.yaw, 0, 'YXZ');
    if (flying) m.rotation.x = THREE.MathUtils.clamp(this.velocity.y / 40, -0.5, 0.5);
    m.visible = this.thirdPerson;

    const motion = {
      mode: this.mode, velocity: this.velocity, yaw: this.yaw, pitch: this.pitch,
      underwater: this.underwater, breathing: this.breathing, swipe: this.swipe,
    };
    this.model.update(dt, motion);
    this.flap = this.model.anim.flap;
    // First-person wings only show while flying, once spread enough to see.
    const fp = this.fpWings.root;
    fp.visible = !this.thirdPerson && this.model.anim.flying > 0.2;
    if (fp.visible) this.fpWings.update(dt, { ...motion, pitch: 0, breathing: false, swipe: null });
  }

  private placeCamera() {
    const cam = this.camera;
    const eye = this.position.clone();
    eye.y += this.mode === 'fly' ? 3.6 : EYE;
    if (!this.thirdPerson) {
      // Eyes sit at the front of the head.
      eye.addScaledVector(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 4.3);
      cam.position.copy(eye);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else {
      const back = this.lookDir().multiplyScalar(-22);
      const pos = eye.clone().add(back);
      pos.y += 5;
      if (this.indoors) this.indoors.limitCamera(eye, pos);
      else if (this.caves?.at(this.position)) this.caves.limitCamera(eye, pos);
      else {
        const g = this.island.heightAt(pos.x, pos.z);
        if (pos.y < g + 2) pos.y = g + 2;
      }
      cam.position.copy(pos);
      cam.lookAt(eye);
    }
  }
}
