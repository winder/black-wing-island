// Black Wing Island: start-up, title screen, and the game loop.

import * as THREE from 'three';
import { Sound } from './audio';
import { BuildMode } from './build/buildMode';
import { Buildings } from './build/buildings';
import { Gathering } from './build/gathering';
import { BUILDINGS, Inventory } from './build/inventory';
import { ClawSwipe, FireBreath } from './combat/attacks';
import { Input } from './input';
import { Player, Mode } from './player/player';
import { Dens, GOLD_DROP } from './monsters/dens';
import { Monster, MonsterKind, World } from './monsters/monster';
import { Projectiles } from './monsters/projectiles';
import { SLOTS, SaveData, clearSlot, loadSlot, packBits, unpackBits, writeSlot } from './save';
import { CombatHud } from './ui/combatHud';
import { InventoryHud } from './ui/inventoryHud';
import { WorldMap } from './ui/map';
import { Biome } from './world/biomes';
import { Island } from './world/island';
import { Places } from './places/places';
import { Interiors } from './places/interiors';
import { pushDragonOut } from './world/collide';
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
const fire = new FireBreath(island);
const claws = new ClawSwipe(camera);
const projectiles = new Projectiles(island);
const dens = new Dens(island);
const places = new Places(island, dens.dens.map((d) => d.at));
terrain.clearings.push(...places.list.map((p) => ({ x: p.x, z: p.z, r: p.radius + 25 })));
const inventory = new Inventory();
const gathering = new Gathering(terrain, inventory, (harvested, tree) => {
  if (harvested) sound.hit();
  else if (tree) sound.whump(0.35);
  else sound.hit();
});
const buildings = new Buildings(island, village, () => sound.whump(0.25));
buildings.addSolid(places);
/** Where you wake up if knocked out: the last village you were in. */
let lastVillage = { x: island.home.x, z: island.home.z };
scene.add(sky.group, terrain.group, village.group, sheep.group, fire.object, fire.light, projectiles.group, dens.group,
  gathering.group, buildings.group, places.group);

// What monsters can do to the world.
const world: World = {
  island, player, projectiles,
  villages: () => buildings.villages(),
  hurtPlayer(amount, from, shove) {
    const before = player.vitals.health;
    player.vitals.hurt(amount);
    if (shove > 0) {
      const away = player.center().sub(from).setY(0).normalize().multiplyScalar(shove);
      away.y = shove * 0.4;
      player.knockback(away);
      if (player.vitals.health < before) sound.hurt();
    }
  },
  sound(name, at) {
    if (at.distanceTo(player.position) > 400) return;
    if (name === 'roar') sound.roar();
    else if (name === 'bite') sound.bite();
    else if (name === 'hit') sound.hit();
    else sound.splash();
  },
};

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
    <div class="hint">Left mouse fire · Right mouse claws · B build · M map · V view · Esc pause</div>
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
// Going in and out of Interiors hides or shows the whole outside world.
const outside = [terrain.group, village.group, sheep.group, dens.group, gathering.group, buildings.group, places.group, ocean, projectiles.group];
const interiors = new Interiors(scene, ui, (inside) => {
  for (const o of outside) o.visible = !inside;
  sky.indoors = inside;
  if (inside) {
    const where = interiors.current!.place;
    showPlace(where.name.replace(/^the /, 'The '));
  } else currentBiome = null;
});
const worldMap = new WorldMap(island, hudEl);
worldMap.markers = places.list.map((p) => ({ x: p.x, z: p.z, kind: p.kind }));
const combatHud = new CombatHud(hudEl);
const inventoryHud = new InventoryHud(hudEl);
inventory.onGain = (m, n) => inventoryHud.gained(m, n);
const buildMode = new BuildMode(scene, hudEl, island, inventory, buildings, (kind) => {
  inventoryHud.toast(`Building a ${BUILDINGS[kind].name}!`);
  save();
});
dens.onDefeated = (m) => inventory.add('gold', GOLD_DROP[m.kind]);
let knockedOutFor = -1; // seconds since being knocked out, or -1

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
    player: interiors.outsidePos
      ? { ...player.state, x: interiors.outsidePos.pos.x, y: island.heightAt(interiors.outsidePos.pos.x, interiors.outsidePos.pos.z), z: interiors.outsidePos.pos.z, yaw: interiors.outsidePos.yaw, mode: 'walk' }
      : player.state,
    explored: packBits(worldMap.explored),
    exploredFraction: worldMap.exploredFraction,
    inventory: inventory.state,
    buildings: buildings.placed,
    lastVillage,
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
    inventory.state = data.inventory ?? { wood: 0, stone: 0, gold: 0 };
    buildings.clear();
    for (const b of data.buildings ?? []) buildings.add(b, true);
    lastVillage = data.lastVillage ?? { x: island.home.x, z: island.home.z };
    worldMap.explored = unpackBits(data.explored, island.W * island.H);
  } else {
    buildings.clear();
    // A new game starts in the Home Village, looking towards the mountains.
    player.placeAt(island.home.x, island.home.z + 40, 0.6);
    sky.time = 0.3;
    playSeconds = 0;
    inventory.state = { wood: 0, stone: 0, gold: 0 };
    lastVillage = { x: island.home.x, z: island.home.z };
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
      <b>Space</b> take off / fly up · <b>C</b> fly down / dive · <b>V</b> see yourself · <b>M</b> map<br>
      <b>Left mouse</b> (or <b>E</b>) breathe fire · <b>Right mouse</b> (or <b>F</b>) claw swipe<br>
      Claw trees and rocks for <b>wood</b> and <b>stone</b> · <b>B</b> build
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
  if (params.has('spawn')) {
    const ahead = player.position.clone().addScaledVector(player.lookDir().setY(0).normalize(), num('dist', 70));
    ahead.y = island.heightAt(ahead.x, ahead.z);
    if (params.get('spawn') === 'kraken') ahead.y = 0;
    dens.spawnNear(params.get('spawn') as MonsterKind, ahead);
  }
  input.forceLocked = params.has('mouse');
  if (params.has('rich')) inventory.state = { wood: 999, stone: 999, gold: 999 };
  (window as unknown as { game: unknown }).game = { places, interiors, island, player, terrain, sky, worldMap, renderer, dens, fire, claws, input, inventory, buildings, buildMode, gathering };
} else {
  showTitle();
}

// ---------- fighting ----------

/** The monster to show a health bar for: whoever you're fighting, nearest first. */
function currentFoe(): Monster | null {
  let best: Monster | null = null, bestD = Infinity;
  for (const m of dens.active) {
    if (!m.alive || !(m.aggro || m.sinceFight < 6)) continue;
    const d = m.position.distanceTo(player.position);
    if (d < 250 && d < bestD) { best = m; bestD = d; }
  }
  return best;
}

function updateCombat(dt: number) {
  const v = player.vitals;
  const targets = dens.active;
  const building = buildMode.usingMouse;
  const wantFire = (input.isMouseDown(0) && !building || input.isDown('KeyE')) && !v.knockedOut;
  fire.update(dt, wantFire, player, targets);
  sound.fire(fire.breathing);
  claws.update(dt, input, player, [...targets, ...gathering.targetsNear(player.position)], () => sound.swish(), !building || input.wasPressed('KeyF'));
  if (!interiors.current) dens.update(dt, world);
  buildings.update(dt, dens.active);
  projectiles.update(dt, player.center(), 4, (hit) => {
    world.hurtPlayer(hit.damage, hit.position, 14);
    if (hit.kind === 'snowball') sound.hit();
  });
  v.update(dt, fire.breathing);
  player.breathing = fire.breathing;
  player.swipe = claws.pose;

  // Knocked out: wait a moment, then wake up in the last village with nothing lost.
  if (v.knockedOut) {
    if (knockedOutFor < 0) { knockedOutFor = 0; player.heldAt = null; }
    knockedOutFor += dt;
    combatHud.knockedOut(knockedOutFor < 2.5 ? 0 : 1);
    if (knockedOutFor > 4.5) {
      const home = lastVillage.x === island.home.x && lastVillage.z === island.home.z;
      const wake = new THREE.Vector3(lastVillage.x, 0, lastVillage.z + (home ? 40 : 48));
      if (interiors.current) interiors.leave(player, { pos: wake, yaw: 0.6 });
      else player.placeAt(wake.x, wake.z, 0.6);
      v.revive();
      knockedOutFor = -1;
      combatHud.knockedOut(null);
    }
  }
  combatHud.update(v, currentFoe());
}

/** Show a place's name across the screen for a moment. */
function showPlace(name: string) {
  placeEl.textContent = name;
  placeEl.classList.remove('show');
  void placeEl.offsetWidth;
  placeEl.classList.add('show');
}

// ---------- the loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const paused = playing && !input.locked && !params.has('debug');
  if (playing && !paused) {
    const inside = interiors.current;
    if (input.wasPressed('KeyM') && !inside) worldMap.toggle();
    const wasSwimming = player.mode === 'swim';
    if (!inside) buildMode.update(input, camera, player.position);
    if (!interiors.busy) player.update(dt, input);
    if (inside) pushDragonOut(player.position, player.yaw, inside.interior.colliders);
    else buildings.pushOut(player.position, player.yaw);
    // Walk into a Portal to go in; back to the doorway to come out.
    if (!interiors.busy && !player.vitals.knockedOut) {
      if (inside) {
        if (player.position.distanceTo(inside.interior.exit) < 7) interiors.leave(player);
      } else {
        const door = places.portalNear(player.position);
        if (door) interiors.enter(door, player);
      }
    }
    interiors.update(dt, player.position);
    if (!inside) {
      gathering.update(dt);
      const inVillage = buildings.villageAt(player.position.x, player.position.z);
      if (inVillage) lastVillage = { x: inVillage.x, z: inVillage.z };
    }
    inventoryHud.update(inventory);
    if (player.mode === 'swim' && !wasSwimming) sound.splash();
    updateCombat(dt);
    playSeconds += dt;
    sinceSave += dt;
    if (sinceSave > AUTOSAVE_SECONDS) save();
    sound.update(player.velocity.length(), player.flap, player.mode === 'fly', player.underwater);

    if (!inside) {
      const p = player.position;
      const g = island.ground(p.x, p.z);
      worldMap.reveal(p.x, p.z, p.y - g.height);
      worldMap.draw(p.x, p.z, player.yaw);

      // Say which biome you've entered, once you've been there a moment.
      const b = g.coast > 0 ? g.biome : Biome.Ocean;
      if (b !== currentBiome) {
        biomeTimer += dt;
        if (biomeTimer > 1.2) {
          currentBiome = b;
          biomeTimer = 0;
          showPlace(BIOME_NAMES[b]);
        }
      } else biomeTimer = 0;
    }
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
  village.viewer.copy(player.position);
  village.update(dt, 1 - THREE.MathUtils.smoothstep(Math.sin((sky.time - 0.25) * Math.PI * 2), -0.1, 0.2));
  sheep.update(dt, player.position);
  ocean.position.set(camera.position.x, 0, camera.position.z);

  // Under a lake, everything turns blue and murky.
  const camGround = island.ground(camera.position.x, camera.position.z);
  const fog = scene.fog as THREE.Fog;
  const underwater = !interiors.current && (camera.position.y < camGround.water || (camGround.height < 0 && camera.position.y < 0));
  if (interiors.current) { fog.near = 30; fog.far = 260; }
  else if (underwater) { fog.color.set('#1d5a7a'); fog.near = 2; fog.far = 70; }
  else {
    // See further when flying high, so the whole dragon shape can be seen from the sky.
    const altitude = Math.max(0, camera.position.y - Math.max(0, camGround.height));
    fog.near = 900 + altitude * 2;
    fog.far = 4500 + altitude * 5;
  }
  underwaterEl.classList.toggle('hidden', !underwater);

  renderer.render(scene, camera);
});
