// Dragon viewer: the dragon from four sides, doing one animation.
// http://localhost:5173/tools/dragon.html?anim=walk[&t=1.3][&speed=9][&color=#c0392b,#f1c40f][&one]
// &cam=x,y,z[,lookx,looky,lookz] for a single close view. &crown &amulet &sheen=#ffcf5a to dress it.
// Anims: idle walk run turn fly climb glide dive swim under fire swipe takeoff land.
// With t, the animation is simulated to that time and frozen (for screenshots).
import * as THREE from 'three';
import { makeDragon } from '../src/player/dragonModel';
import { wear } from '../src/player/accessories';
import type { DragonMotion } from '../src/player/dragonAnim';

const q = new URLSearchParams(location.search);
const anim = q.get('anim') ?? 'idle';
const [color, accent] = (q.get('color') ?? '#16131c,#3b2f52').split(',');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9cc3e6');
scene.add(new THREE.HemisphereLight('#bcd8ff', '#5a5040', 1.0));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(30, 50, 20);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#6fa84a' }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(400, 100, '#4d7a33', '#5d8f3e');
grid.position.y = 0.01;
scene.add(grid);

const dragon = makeDragon(color, accent, q.get('sheen') ?? undefined);
wear(dragon, { crown: q.has('crown'), amulet: q.has('amulet') });
scene.add(dragon.root);

const views: [string, THREE.Vector3, THREE.Vector3][] = [
  ['side', new THREE.Vector3(24, 4, 2), new THREE.Vector3(0, 3, 2)],
  ['front', new THREE.Vector3(5, 6, -22), new THREE.Vector3(0, 3.5, 0)],
  ['top', new THREE.Vector3(0.01, 30, 2), new THREE.Vector3(0, 0, 2)],
  ['back 3/4', new THREE.Vector3(-14, 9, 18), new THREE.Vector3(0, 3, 1)],
];
// &cam=x,y,z,lookx,looky,lookz: one view from there.
if (q.has('cam')) {
  const c = q.get('cam')!.split(',').map(Number);
  views[3] = ['cam', new THREE.Vector3(c[0], c[1], c[2]), new THREE.Vector3(c[3] ?? 0, c[4] ?? 3, c[5] ?? 0)];
  q.set('one', '');
}
const cams = views.map(() => new THREE.PerspectiveCamera(45, 1, 0.1, 500));

const speed = Number(q.get('speed') ?? NaN);
let yaw = 0;
function motion(t: number): DragonMotion {
  const v = new THREE.Vector3();
  const m: DragonMotion = { mode: 'walk', velocity: v, yaw: 0 };
  const fwd = (s: number) => v.set(0, 0, -s);
  switch (anim) {
    case 'walk': fwd(isNaN(speed) ? 9 : speed); break;
    case 'run': fwd(isNaN(speed) ? 20 : speed); break;
    case 'turn': yaw += 1 / 60 * 2; m.yaw = yaw; break;
    case 'fly': m.mode = 'fly'; fwd(isNaN(speed) ? 20 : speed); break;
    case 'climb': m.mode = 'fly'; fwd(14); v.y = 12; break;
    case 'glide': m.mode = 'fly'; fwd(26); v.y = -1; break;
    case 'dive': m.mode = 'fly'; fwd(20); v.y = -16; break;
    case 'swim': m.mode = 'swim'; fwd(7); break;
    case 'under': m.mode = 'swim'; m.underwater = true; fwd(10); break;
    case 'fire': m.breathing = true; break;
    case 'swipe': m.swipe = { t: (t % 1.2) / 0.5, side: 1 }; break;
    case 'takeoff': if (t > 1) { m.mode = 'fly'; v.y = 10; } break;
    case 'land': if (t < 1.5) { m.mode = 'fly'; fwd(8); } break;
  }
  // Keep the view centred: the dragon "moves" on the spot, the grid slides under it.
  grid.position.z = (grid.position.z + v.z / 60 * -1) % 4;
  grid.position.x = 0;
  return m;
}

const frozen = q.has('t');
let t = 0;
if (frozen) {
  const end = Number(q.get('t'));
  for (; t < end; t += 1 / 60) dragon.update(1 / 60, motion(t));
}
document.querySelector('#label')!.textContent = `${anim}${frozen ? ` t=${q.get('t')}` : ''}`;

// &strip=8&step=0.1: a filmstrip of frames `step` seconds apart, from the last camera.
if (q.has('strip')) {
  const n = Number(q.get('strip')), step = Number(q.get('step') ?? 0.1);
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const W = innerWidth, H = innerHeight, w = W / cols, h = H / rows;
  renderer.setSize(W, H);
  renderer.setScissorTest(true);
  const cam = cams[3];
  const [, pos, at] = views[3];
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  cam.position.copy(pos);
  cam.lookAt(at);
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * w, y = H - (Math.floor(i / cols) + 1) * h;
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.render(scene, cam);
    for (let k = 0; k < Math.round(step * 60); k++) { t += 1 / 60; dragon.update(1 / 60, motion(t)); }
  }
  throw new Error('strip done'); // stop the live loop below
}

function frame() {
  if (!frozen) { t += 1 / 60; dragon.update(1 / 60, motion(t)); }
  dragon.root.rotation.y = 0;
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H);
  renderer.setScissorTest(true);
  const one = q.has('one');
  cams.forEach((cam, i) => {
    if (one && i !== 3) return;
    const [, pos, at] = views[i];
    const w = one ? W : W / 2, h = one ? H : H / 2;
    const x = one ? 0 : (i % 2) * w, y = one ? 0 : (i < 2 ? h : 0);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    cam.position.copy(pos);
    cam.lookAt(at);
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.render(scene, cam);
  });
  requestAnimationFrame(frame);
}
frame();
