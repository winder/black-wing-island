import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { coneHitsSphere } from './hits';

const apex = new THREE.Vector3(0, 0, 0);
const dir = new THREE.Vector3(0, 0, -1);

describe('coneHitsSphere', () => {
  it('hits a sphere straight ahead within range', () => {
    expect(coneHitsSphere(apex, dir, 40, 0.3, { center: new THREE.Vector3(0, 0, -30), radius: 2 })).toBe(true);
  });
  it('misses a sphere behind', () => {
    expect(coneHitsSphere(apex, dir, 40, 0.3, { center: new THREE.Vector3(0, 0, 10), radius: 2 })).toBe(false);
  });
  it('misses a sphere beyond range', () => {
    expect(coneHitsSphere(apex, dir, 40, 0.3, { center: new THREE.Vector3(0, 0, -60), radius: 2 })).toBe(false);
  });
  it('misses a sphere far off to the side', () => {
    expect(coneHitsSphere(apex, dir, 40, 0.3, { center: new THREE.Vector3(30, 0, -20), radius: 2 })).toBe(false);
  });
  it('hits a big sphere whose edge pokes into the cone', () => {
    expect(coneHitsSphere(apex, dir, 40, 0.2, { center: new THREE.Vector3(12, 0, -20), radius: 10 })).toBe(true);
  });
});
