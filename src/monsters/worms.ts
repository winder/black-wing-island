// Long burrowing monsters made of a chain of segments: the Giant Sand Snake
// (desert) and the Giant Lava Worm (volcano).

import * as THREE from 'three';
import { HitSphere } from '../combat/hits';
import { Monster, World, skin } from './monster';

abstract class Burrower extends Monster {
  protected head = new THREE.Vector3();
  protected segments: THREE.Vector3[] = [];
  protected meshes: THREE.Mesh[] = [];
  private radii: number[] = [];
  protected state: 'under' | 'rise' | 'up' | 'dive' = 'under';
  protected stateTime = 0;
  /** Where it came out of the ground. */
  protected hole = new THREE.Vector3();
  private mound: THREE.Mesh;

  constructor(health: number, home: THREE.Vector3, leash: number, count: number, protected spacing: number, radius: number,
    colors: (i: number) => THREE.MeshLambertMaterial, headMat: THREE.MeshLambertMaterial, moundColor: string) {
    super(health, home, leash);
    this.head.copy(home).setY(home.y - 12);
    for (let i = 0; i < count; i++) {
      const r = radius * (1 - (i / count) * 0.55);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i === 0 ? headMat : colors(i));
      this.radii.push(r);
      this.meshes.push(m);
      this.segments.push(this.head.clone().add(new THREE.Vector3(0, 0, i * spacing)));
      this.group.add(m);
    }
    this.mound = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.6, radius * 0.9, 7), skin(moundColor));
    this.group.add(this.mound);
    this.collectMaterials();
  }

  /** A Burrower Boss is fatter and longer rather than scaled (its segments live in world space). */
  makeBoss(title: string, size: number, toughness: number) {
    super.makeBoss(title, 1, toughness);
    this.spacing *= size;
    this.radii = this.radii.map((r) => r * size);
    this.meshes.forEach((m) => m.scale.setScalar(size));
  }

  protected body(): HitSphere[] {
    if (this.state === 'under') return [];
    return this.segments.map((c, i) => ({ center: c, radius: this.radii[i] + 1 }));
  }

  protected setState(s: Burrower['state']) {
    this.state = s;
    this.stateTime = 0;
  }

  /** Drag every segment along behind the one in front. */
  protected follow(world: World) {
    this.segments[0].copy(this.head);
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1], seg = this.segments[i];
      const dir = seg.clone().sub(prev);
      if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);
      seg.copy(prev).addScaledVector(dir.normalize(), this.spacing);
      // While burrowing the body stays under the ground.
      if (this.state === 'under') {
        const g = world.island.heightAt(seg.x, seg.z);
        seg.y = Math.min(seg.y, g - 10);
      }
    }
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.meshes.forEach((m, i) => {
      m.position.copy(this.segments[i]);
      if (i === 0) m.lookAt(this.segments[0].clone().add(this.segments[0].clone().sub(this.segments[1])));
    });
    // A moving bump of ground shows where it is while underground.
    const g = world.island.heightAt(this.head.x, this.head.z);
    this.mound.visible = this.state === 'under' && this.alive;
    this.mound.position.set(this.head.x, g + 0.5, this.head.z);
    this.mound.rotation.y += 0.05;
    this.position.copy(this.head);
  }

  /** Move the head through the ground towards a point. */
  protected tunnel(to: THREE.Vector3, speed: number, dt: number, world: World) {
    const flat = new THREE.Vector3(to.x - this.head.x, 0, to.z - this.head.z);
    const d = flat.length();
    if (d > 0.5) this.head.addScaledVector(flat.normalize(), Math.min(d, speed * dt));
    this.head.y = world.island.heightAt(this.head.x, this.head.z) - 12;
    return d;
  }

  protected defeated(dt: number, world: World) {
    // Slump to the ground and sink.
    for (const s of this.segments) {
      const g = world.island.heightAt(s.x, s.z);
      s.y = Math.max(g - 12, s.y - dt * (this.sinceDefeat > 1.5 ? 8 : 25));
    }
    this.head.copy(this.segments[0]);
    this.meshes.forEach((m, i) => m.position.copy(this.segments[i]));
  }
}

// ---------- Giant Sand Snake ----------

export class SandSnake extends Burrower {
  readonly kind = 'sandSnake';
  private wander: THREE.Vector3;
  private strikeAt = new THREE.Vector3();
  private struck = false;

  constructor(home: THREE.Vector3) {
    const scale = skin('#c9a25a'), band = skin('#8a5a2b'), headMat = skin('#b07f3a');
    super(160, home, 500, 14, 3.4, 3.2, (i) => (i % 3 === 0 ? band : scale), headMat, '#dcc38a');
    this.wander = home.clone();
    // Eyes on the head.
    const eye = skin('#ffe14a', '#ff9a00', 0.8);
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.6, 5, 4), eye);
      e.position.set(side * 1.9, 1.2, -1.8);
      this.meshes[0].add(e);
    }
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 4).rotateX(Math.PI), skin('#f4efe0'));
    fang.position.set(0, -1.6, -2.4);
    this.meshes[0].add(fang);
  }

  protected think(dt: number, world: World) {
    this.stateTime += dt;
    const p = world.player.center();
    const reachable = this.canChase(world, 32);
    switch (this.state) {
      case 'under': {
        const chasing = reachable && this.distanceToPlayer(world) < 220;
        const d = chasing ? this.tunnel(p, 16, dt, world) : this.tunnel(this.wander, 6, dt, world);
        if (!chasing && d < 3) this.wander = this.wanderSpot(200);
        if (chasing && d < 22 && this.stateTime > 1.5) {
          this.hole.copy(this.head).setY(world.island.heightAt(this.head.x, this.head.z));
          this.strikeAt.copy(p);
          this.struck = false;
          world.sound('roar', this.hole);
          this.setState('rise');
        }
        break;
      }
      case 'rise': {
        // Burst out and lunge up at where the dragon was.
        const k = Math.min(1, this.stateTime / 0.9);
        this.head.lerpVectors(this.hole.clone().setY(this.hole.y - 10), this.strikeAt, k);
        this.head.y += Math.sin(k * Math.PI) * 8;
        if (!this.struck && this.head.distanceTo(p) < 8) {
          this.struck = true;
          world.hurtPlayer(18, this.head, 22);
          this.sinceFight = 0;
        }
        if (k >= 1) this.setState('up');
        break;
      }
      case 'up': {
        // Sway above the hole, open to attack, then dive back in.
        const sway = new THREE.Vector3(Math.sin(this.stateTime * 2) * 4, 0, Math.cos(this.stateTime * 1.6) * 4);
        const want = this.hole.clone().add(sway).setY(this.hole.y + 14);
        this.head.lerp(want, 1 - Math.exp(-3 * dt));
        if (this.stateTime > 4) this.setState('dive');
        break;
      }
      case 'dive': {
        const ahead = this.hole.clone().add(new THREE.Vector3(this.head.x - this.hole.x, 0, this.head.z - this.hole.z).setLength(15));
        ahead.y = this.hole.y - 14;
        this.head.lerp(ahead, 1 - Math.exp(-2.5 * dt));
        if (this.stateTime > 1.6) this.setState('under');
        break;
      }
    }
    this.follow(world);
  }
}

// ---------- Giant Lava Worm ----------

export class LavaWorm extends Burrower {
  readonly kind = 'lavaWorm';
  private spit = 1.5;
  private bite = 0;
  private bodyMats: THREE.MeshLambertMaterial[];

  constructor(home: THREE.Vector3) {
    const rock = skin('#2a2120'), glow = skin('#ff5a14', '#ff3a00', 1.0), headMat = skin('#3a2622', '#ff3a00', 0.15);
    super(260, home, 500, 16, 4.2, 4.2, (i) => (i % 2 === 0 ? glow : rock), headMat, '#3a2a26');
    this.resist = { fire: 0.25, claw: 1 }; // it lives in lava, so fire hardly hurts it
    this.bodyMats = [glow];
    const eye = skin('#fff27a', '#ffd000', 1.5);
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.8, 5, 4), eye);
      e.position.set(side * 2.4, 1.5, -2.6);
      this.meshes[0].add(e);
    }
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3, 7).rotateX(-Math.PI / 2), skin('#120c0b'));
    jaw.position.set(0, -0.5, -3.6);
    this.meshes[0].add(jaw);
  }

  protected think(dt: number, world: World) {
    this.stateTime += dt;
    this.bodyMats[0].emissiveIntensity = 0.8 + Math.sin(this.stateTime * 3) * 0.3;
    const p = world.player.center();
    const near = this.canChase(world, 200) && this.distanceToPlayer(world) < 260;
    switch (this.state) {
      case 'under': {
        // Tunnel to a spot near the dragon (but not right under it), then come up.
        const goal = near
          ? p.clone().add(new THREE.Vector3(this.home.x - p.x, 0, this.home.z - p.z).setLength(45))
          : this.home;
        const d = this.tunnel(goal, 14, dt, world);
        if (near && d < 4 && this.stateTime > 2) {
          this.hole.copy(this.head).setY(world.island.heightAt(this.head.x, this.head.z));
          world.sound('roar', this.hole);
          this.setState('rise');
        }
        break;
      }
      case 'rise': {
        const k = Math.min(1, this.stateTime / 1.5);
        this.head.lerpVectors(this.hole.clone().setY(this.hole.y - 14), this.hole.clone().setY(this.hole.y + 30), k);
        if (k >= 1) this.setState('up');
        break;
      }
      case 'up': {
        // Rear up out of the ground, spit lava, and bite anything close.
        const toP = p.clone().sub(this.hole).setY(0);
        const lean = toP.lengthSq() > 1 ? toP.setLength(Math.min(12, toP.length() * 0.3)) : toP;
        const want = this.hole.clone().add(lean).setY(this.hole.y + 28 + Math.sin(this.stateTime * 1.4) * 3);
        this.head.lerp(want, 1 - Math.exp(-2 * dt));
        this.spit -= dt;
        this.bite -= dt;
        if (near && this.spit <= 0) {
          this.spit = 2.6;
          const d = this.head.distanceTo(p);
          world.projectiles.launch('lava', this.head.clone(), p, THREE.MathUtils.clamp(d / 45, 0.8, 2.5), 14);
        }
        if (this.head.distanceTo(p) < 16 && this.bite <= 0) {
          this.bite = 1.5;
          world.hurtPlayer(20, this.head, 20);
          this.sinceFight = 0;
        }
        if (this.stateTime > 11) this.setState('dive');
        break;
      }
      case 'dive': {
        const k = Math.min(1, this.stateTime / 1.5);
        this.head.lerpVectors(this.head, this.hole.clone().setY(this.hole.y - 16), k * 0.2);
        if (this.stateTime > 1.8) this.setState('under');
        break;
      }
    }
    this.follow(world);
  }
}
