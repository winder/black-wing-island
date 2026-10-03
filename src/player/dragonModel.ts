// A low-poly dragon built from simple shapes. Used for the Player Dragon (black)
// in third-person view and for Villagers (other colours).
//
// The model faces -z, stands on y = 0, and is about 10 m nose to tail.

import * as THREE from 'three';

export interface DragonModel {
  root: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  /** 0..1 wings folded..spread; `flap` animates them up and down. */
  pose(spread: number, flap: number): void;
}

function wingShape(): THREE.BufferGeometry {
  // A flat bat-like wing reaching out along +x, in the xz plane.
  const pts = [
    [0, 0, -0.8], [7.5, 0, -1.8], [9.5, 0, 0.6], [7, 0, 0.9], [6, 0, 2.6], [3.6, 0, 1.6], [2.6, 0, 3.2], [0, 0, 1.6],
  ];
  const pos: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0], ...pts[i], ...pts[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// The membrane plus the bones that hold it: an arm along the front edge and
// fingers fanning out to the wing's points.
function makeWing(membrane: THREE.Material, bone: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(wingShape(), membrane));
  const wrist = new THREE.Vector3(7.5, 0.05, -1.8);
  const bones: [THREE.Vector3, THREE.Vector3, number][] = [
    [new THREE.Vector3(0, 0.05, -0.8), wrist, 0.22],
    [wrist, new THREE.Vector3(9.5, 0.05, 0.6), 0.12],
    [wrist, new THREE.Vector3(6, 0.05, 2.6), 0.12],
    [wrist, new THREE.Vector3(2.6, 0.05, 3.2), 0.12],
  ];
  for (const [a, b, r] of bones) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, len, 5), bone);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
  }
  const claw = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 4), bone);
  claw.position.copy(wrist).add(new THREE.Vector3(0, 0, -0.35));
  claw.rotation.x = -Math.PI / 2;
  g.add(claw);
  return g;
}

export function makeDragon(color = '#16131c', accent = '#3b2f52'): DragonModel {
  const body = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const belly = new THREE.MeshLambertMaterial({ color: accent, flatShading: true });
  const membrane = new THREE.MeshLambertMaterial({ color: accent, flatShading: true, side: THREE.DoubleSide });
  const eye = new THREE.MeshBasicMaterial({ color: '#ffcf3a' });
  const root = new THREE.Group();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // Body and belly.
  add(new THREE.IcosahedronGeometry(1, 1).scale(1.5, 1.3, 2.8), body, 0, 2.6, 0);
  add(new THREE.IcosahedronGeometry(1, 1).scale(1.2, 0.8, 2.3), belly, 0, 2.1, 0.1);
  // Neck and head.
  const neck = add(new THREE.CylinderGeometry(0.55, 0.9, 3, 6), body, 0, 3.6, -2.8);
  neck.rotation.x = -0.9;
  const head = add(new THREE.ConeGeometry(0.8, 2.6, 6).rotateX(-Math.PI / 2), body, 0, 4.5, -4.6);
  add(new THREE.ConeGeometry(0.18, 1, 4), body, 0.4, 0.7, 0.6, head).rotation.x = 0.8;  // horns
  add(new THREE.ConeGeometry(0.18, 1, 4), body, -0.4, 0.7, 0.6, head).rotation.x = 0.8;
  add(new THREE.SphereGeometry(0.14, 6, 4), eye, 0.42, 0.25, -0.1, head);
  add(new THREE.SphereGeometry(0.14, 6, 4), eye, -0.42, 0.25, -0.1, head);
  // Tail in three tapering pieces.
  let z = 2.6, r = 0.8, y = 2.5;
  for (let i = 0; i < 3; i++) {
    const seg = add(new THREE.ConeGeometry(r, 2.4, 6).rotateX(Math.PI / 2), body, 0, y, z + 1.2);
    seg.rotation.x = 0.12;
    z += 2.2; r *= 0.65; y -= 0.25;
  }
  add(new THREE.ConeGeometry(0.5, 0.8, 3).rotateX(Math.PI / 2), belly, 0, y + 0.1, z + 0.2); // tail spade
  // Spikes along the back.
  for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.22, 0.7, 4), belly, 0, 3.9 - i * 0.12, -1.6 + i * 1.0);
  // Legs.
  for (const [lx, lz] of [[0.9, -1.4], [-0.9, -1.4], [0.9, 1.6], [-0.9, 1.6]]) {
    add(new THREE.CylinderGeometry(0.35, 0.28, 2.2, 5), body, lx, 1.1, lz);
    add(new THREE.ConeGeometry(0.3, 0.6, 4).rotateX(-Math.PI / 2), body, lx, 0.15, lz - 0.4);
  }
  // Wings hinge at the shoulders.
  const leftWing = new THREE.Group(), rightWing = new THREE.Group();
  leftWing.rotation.order = rightWing.rotation.order = 'YZX'; // roll, then lift, then fold back
  leftWing.position.set(-0.9, 3.5, -0.6);
  rightWing.position.set(0.9, 3.5, -0.6);
  const lw = makeWing(membrane, body);
  lw.scale.x = -1;
  leftWing.add(lw);
  rightWing.add(makeWing(membrane, body));
  root.add(leftWing, rightWing);

  return {
    root, leftWing, rightWing,
    pose(spread, flap) {
      // Folded wings point back along the body with the membrane hanging down
      // the dragon's side; spread wings go out sideways and flap.
      const folded = 1 - spread;
      const fold = folded * 1.52;
      const roll = folded * 1.5;
      // Folding also gathers the wing up like a fan, so it's shorter.
      rightWing.scale.x = leftWing.scale.x = 1 - folded * 0.4;
      const lift = folded * -0.1 + spread * Math.sin(flap) * 0.55;
      rightWing.rotation.set(roll, -fold, lift);
      leftWing.rotation.set(roll, fold, -lift);
    },
  };
}
