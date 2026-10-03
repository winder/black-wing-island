// Black Wing Island: start-up, title screen, and the game loop.

import * as THREE from 'three';
import { Sound } from './audio';
import { Input } from './input';
import { Player, Mode } from './player/player';
import { SLOTS, SaveData, clearSlot, loadSlot, packBits, unpackBits, writeSlot } from './save';
import { WorldMap } from './ui/map';
import { Biome } from './world/biomes';
import { Island } from './world/island';
import { SheepFlocks } from './world/sheep';
import { Sky } from './world/sky';
import { Terrain } from './world/terrain';
import { Village } from './world/village';

const AUTOSAVE_SECONDS = 60;
const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Ocean]: 'The Ocean', [Biome.Meadow]: 'The Meadow', [Biome.Forest]: 'The Forest',
  [Biome.Desert]: 'The Desert', [Biome.Mountain]: 'The Mountains', [Biome.Volcano]: 'The Volcano',
  [Biome.Beach]: 'The Islands',
};

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('debug') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#cfe4f2', 900, 4500);
const camera = new THREE.PerspectiveCamera(72, 1, 0.5, 20000);
scene.add(camera);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

ui.innerHTML = `<div class="loading">Black Wing Island<br><small>Raising the island from the sea…</small></div>`;

const island = await Island.load();
const input = new Input(canvas);
const sound = new Sound();
const sky = new Sky();
const terrain = new Terrain(island);
const village = new Village(island);
const sheep = new SheepFlocks(island);
const player = new Player(island, camera, scene);
scene.add(sky.group, terrain.group, village.group, sheep.group);

// The ocean: one big sheet of water that follows the player.
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
  new THREE.MeshPhongMaterial({ color: '#2f6fae', shininess: 60, transparent: true, opacity: 0.9 }),
);
scene.add(ocean);

ui.innerHTML = `
  <div id="title" class="screen"></div>
  <div id="hud" class="hidden">
    <div class="crosshair"></div>
    <div id="place" class="place"></div>
    <div class="hint">M map · V view · Esc pause</div>
    <div id="underwater" class="underwater hidden"></div>
  </div>
  <div id="pause" class="screen hidden">
    <h2>Paused</h2>
    <button id="resume">Keep playing</button>
    <button id="quit">Save and go to title screen</button>
  </div>`;
const titleEl = document.querySelector<HTMLDivElement>('#title')!;
const hudEl = document.querySelector<HTMLDivElement>('#hud')!;
const pauseEl = document.querySelector<HTMLDivElement>('#pause')!;
const placeEl = document.querySelector<HTMLDivElement>('#place')!;
const underwaterEl = document.querySelector<HTMLDivElement>('#underwater')!;
const worldMap = new WorldMap(island, hudEl);

// ---------- game state ----------
let slot = -1;
let playing = false;
let playSeconds = 0;
let sinceSave = 0;
let currentBiome: Biome | null = null;
let biomeTimer = 0;

function save() {
  if (slot < 0) return;
  const data: SaveData = {
    version: 1,
    savedAt: Date.now(),
    playSeconds,
    timeOfDay: sky.time,
    player: player.state,
    explored: packBits(worldMap.explored),
    exploredFraction: worldMap.exploredFraction,
  };
  writeSlot(slot, data);
  sinceSave = 0;
}

function startGame(s: number) {
  slot = s;
  const data = loadSlot(s);
  if (data) {
    player.state = data.player;
    sky.time = data.timeOfDay;
    playSeconds = data.playSeconds;
    worldMap.explored = unpackBits(data.explored, island.W * island.H);
  } else {
    // A new game starts in the Home Village, looking towards the mountains.
    player.placeAt(island.home.x, island.home.z + 40, 0.6);
    sky.time = 0.3;
    playSeconds = 0;
    worldMap.explored = new Uint8Array(island.W * island.H);
  }
  // Build the ground nearby before showing anything.
  terrain.update(player.position.x, player.position.z, 1500);
  titleEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  playing = true;
  currentBiome = null;
  sound.start();
  input.lock();
  save();
}

function quitToTitle() {
  save();
  playing = false;
  slot = -1;
  input.unlock();
  pauseEl.classList.add('hidden');
  hudEl.classList.add('hidden');
  showTitle();
}

function showTitle() {
  const minutes = (s: number) => (s < 60 ? 'less than a minute' : `${Math.round(s / 60)} min`);
  titleEl.classList.remove('hidden');
  titleEl.innerHTML = `
    <h1>Black Wing Island</h1>
    <div class="slots">
      ${Array.from({ length: SLOTS }, (_, i) => {
        const d = loadSlot(i);
        return `<div class="slot">
          <h3>Game ${i + 1}</h3>
          <p>${d ? `Played ${minutes(d.playSeconds)}<br>${Math.round(d.exploredFraction * 100)}% explored` : 'New game'}</p>
          <button data-play="${i}">${d ? 'Continue' : 'Start'}</button>
          ${d ? `<button class="small" data-clear="${i}">Delete</button>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="controls">
      <b>Mouse</b> look · <b>W A S D</b> move · <b>Shift</b> run / fly fast<br>
      <b>Space</b> take off / fly up · <b>C</b> fly down / dive · <b>V</b> see yourself · <b>M</b> map
    </div>`;
  titleEl.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) =>
    b.addEventListener('click', () => startGame(Number(b.dataset.play))));
  titleEl.querySelectorAll<HTMLButtonElement>('[data-clear]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm(`Delete Game ${Number(b.dataset.clear) + 1}? This can't be undone.`)) {
        clearSlot(Number(b.dataset.clear));
        showTitle();
      }
    }));
}

// Pausing: losing the mouse (Esc) pauses the game.
document.addEventListener('pointerlockchange', () => {
  if (!playing) return;
  pauseEl.classList.toggle('hidden', input.locked);
});
canvas.addEventListener('click', () => { if (playing) input.lock(); });
document.querySelector('#resume')!.addEventListener('click', () => input.lock());
document.querySelector('#quit')!.addEventListener('click', quitToTitle);
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) save(); });

// Debug start: ?debug&x=..&z=..&y=..&yaw=..&pitch=..&mode=fly&time=0.5&third
if (params.has('debug')) {
  slot = -1;
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const x = num('x', island.home.x), z = num('z', island.home.z + 40);
  player.placeAt(x, z, num('yaw', 0.6));
  if (params.has('y')) player.position.y = num('y', 0);
  player.pitch = num('pitch', 0);
  player.mode = (params.get('mode') as Mode) ?? 'walk';
  player.thirdPerson = params.has('third');
  sky.time = num('time', 0.3);
  terrain.update(x, z, 60000);
  titleEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  playing = true;
  if (params.has('map')) { worldMap.explored.fill(1); worldMap.toggle(); }
  (window as unknown as { game: unknown }).game = { island, player, terrain, sky, worldMap, renderer };
} else {
  showTitle();
}

// ---------- the loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const paused = playing && !input.locked && !params.has('debug');
  if (playing && !paused) {
    if (input.wasPressed('KeyM')) worldMap.toggle();
    const wasSwimming = player.mode === 'swim';
    player.update(dt, input);
    if (player.mode === 'swim' && !wasSwimming) sound.splash();
    playSeconds += dt;
    sinceSave += dt;
    if (sinceSave > AUTOSAVE_SECONDS) save();

    const p = player.position;
    const g = island.ground(p.x, p.z);
    worldMap.reveal(p.x, p.z, p.y - g.height);
    worldMap.draw(p.x, p.z, player.yaw);
    sound.update(player.velocity.length(), player.flap, player.mode === 'fly', player.underwater);

    // Say which biome you've entered, once you've been there a moment.
    const b = g.coast > 0 ? g.biome : Biome.Ocean;
    if (b !== currentBiome) {
      biomeTimer += dt;
      if (biomeTimer > 1.2) {
        currentBiome = b;
        biomeTimer = 0;
        placeEl.textContent = BIOME_NAMES[b];
        placeEl.classList.remove('show');
        void placeEl.offsetWidth;
        placeEl.classList.add('show');
      }
    } else biomeTimer = 0;
  } else if (!playing) {
    // Title screen: drift slowly over the Island.
    const t = performance.now() / 1000;
    camera.position.set(Math.cos(t * 0.03) * 3500, 1100, Math.sin(t * 0.03) * 3000);
    camera.lookAt(0, 0, 0);
  }
  input.endFrame();

  const focus = playing ? player.position : new THREE.Vector3(0, 0, 0);
  terrain.update(focus.x, focus.z, 6);
  sky.update(playing && !paused ? dt : dt * 0.2, camera.position, scene);
  village.update(dt, 1 - THREE.MathUtils.smoothstep(Math.sin((sky.time - 0.25) * Math.PI * 2), -0.1, 0.2));
  sheep.update(dt, player.position);
  ocean.position.set(camera.position.x, 0, camera.position.z);

  // Under a lake, everything turns blue and murky.
  const camGround = island.ground(camera.position.x, camera.position.z);
  const fog = scene.fog as THREE.Fog;
  const underwater = camera.position.y < camGround.water || (camGround.height < 0 && camera.position.y < 0);
  if (underwater) { fog.color.set('#1d5a7a'); fog.near = 2; fog.far = 70; }
  else {
    // See further when flying high, so the whole dragon shape can be seen from the sky.
    const altitude = Math.max(0, camera.position.y - Math.max(0, camGround.height));
    fog.near = 900 + altitude * 2;
    fog.far = 4500 + altitude * 5;
  }
  underwaterEl.classList.toggle('hidden', !underwater);

  renderer.render(scene, camera);
});
