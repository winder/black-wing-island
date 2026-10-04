// Things the Player Dragon can wear: a crown on its head, an amulet round its
// neck. Hung on the skeleton's bones, so they move with the animation.

import * as THREE from 'three';
import type { DragonModel } from './dragonModel';

const gold = () => new THREE.MeshLambertMaterial({ color: '#f2c230', emissive: '#6a4400', emissiveIntensity: 0.6, flatShading: true });

function crown(): THREE.Group {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.22, 10, 1, true), gold());
  band.material.side = THREE.DoubleSide;
  g.add(band);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 4), gold());
    spike.position.set(Math.cos(a) * 0.42, 0.28, Math.sin(a) * 0.42);
    g.add(spike);
    if (i % 2 === 0) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: i ? '#3a8aff' : '#e8243a' }));
      gem.position.set(Math.cos(a) * 0.47, 0.02, Math.sin(a) * 0.47);
      g.add(gem);
    }
  }
  return g;
}

function amulet(): THREE.Group {
  const g = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 4, 18), gold());
  g.add(chain);
  const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 8), gold());
  setting.rotation.x = Math.PI / 2;
  setting.position.set(0, -1.08, -0.15);
  const ruby = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0).scale(1, 1.3, 0.6), new THREE.MeshLambertMaterial({ color: '#d0102a', emissive: '#600010', emissiveIntensity: 0.8, flatShading: true }));
  ruby.position.set(0, -1.08, -0.24);
  g.add(setting, ruby);
  return g;
}

/** Put on (or leave off) the crown and amulet. */
export function wear(model: DragonModel, has: { crown: boolean; amulet: boolean }) {
  const b = model.bones;
  if (has.crown) {
    const c = crown();
    c.position.set(0, 0.5, -0.3); // on top of the skull, between the horns
    c.rotation.x = 0.15;
    b.head.add(c);
  }
  if (has.amulet) {
    const a = amulet();
    a.position.set(0, 0.05, -0.2); // round the base of the neck, tilted along it
    a.rotation.x = -0.75;
    b.neck[2].add(a);
  }
}
