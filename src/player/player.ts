// The Player Dragon: walking, flying, swimming and diving, and the camera that
// goes with it (first person by default, third person on V).

import * as THREE from 'three';
import { Input } from '../input';
import { Island } from '../world/island';
import { makeDragon, DragonModel } from './dragonModel';

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
  /** Wing beat phase, for animation and sound. */
  flap = 0;
  flapRate = 0;
  readonly model: DragonModel;
  private fpWings: DragonModel;
  private spread = 0;

  constructor(private island: Island, private camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.model = makeDragon();
    scene.add(this.model.root);
    // First-person wings: a second pair hung off the camera so they show at the screen edges.
    this.fpWings = makeDragon();
    // Each wing sits in a holder swept forward, so its edge is in view.
    for (const [w, side] of [[this.fpWings.leftWing, -1], [this.fpWings.rightWing, 1]] as const) {
      const holder = new THREE.Group();
      holder.position.set(side * 1.9, -1.1, -1.8);
      holder.rotation.y = side * 0.7;
      holder.scale.setScalar(0.33);
      w.removeFromParent();
      w.position.set(0, 0, 0);
      w.visible = false;
      holder.add(w);
      camera.add(holder);
    }
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

  /** Direction the dragon is looking. */
  lookDir(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  private surfaceAt(x: number, z: number) {
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
      const speed = fast ? BOOST_SPEED : FLY_SPEED;
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
    this.spread = THREE.MathUtils.damp(this.spread, flying ? 1 : 0, 5, dt);
    const climbing = flying ? Math.max(0, this.velocity.y) / 14 : 0;
    this.flapRate = flying ? 2.2 + climbing * 3 + (this.velocity.length() < 6 ? 1.5 : 0) : this.mode === 'swim' ? 1 : 0;
    this.flap += dt * this.flapRate * Math.PI * 2 * 0.5;
    this.model.pose(this.spread, this.flap);
    this.fpWings.pose(this.spread, this.flap);

    const m = this.model.root;
    m.position.copy(this.position);
    m.rotation.set(0, this.yaw, 0, 'YXZ');
    if (flying) m.rotation.x = THREE.MathUtils.clamp(this.velocity.y / 40, -0.5, 0.5);
    m.visible = this.thirdPerson;
    // First-person wings only show while flying and when spread enough to see.
    this.fpWings.leftWing.visible = this.fpWings.rightWing.visible = !this.thirdPerson && this.spread > 0.2;
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
      const g = this.island.heightAt(pos.x, pos.z);
      if (pos.y < g + 2) pos.y = g + 2;
      cam.position.copy(pos);
      cam.lookAt(eye);
    }
  }
}
