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
import { Caves } from './places/caves';
import { Interiors } from './places/interiors';
import { HOARD_GOLD, Lair, LairEvents, prisonerFor } from './places/lair';
import { BOSS_GOLD } from './monsters/bosses';
import { Quest, QuestState, Quests, rewardText } from './quests/quests';
import { ACCESSORIES, AccessoryId, POWERS, Rewards } from './quests/rewards';
import { Giver, QuestGivers } from './quests/givers';
import { Treasures } from './ui/treasures';
import type { DragonModel } from './player/dragonModel';
import { pushDragonOut } from './world/collide';
import { SheepFlocks } from './world/sheep';
import { Sky } from './world/sky';
import { Terrain } from './world/terrain';
import { Village } from './world/village';

const AUTOSAVE_SECONDS = 60;
const NO_QUESTS: QuestState = { active: null, done: [], boards: {} };
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
const caves = new Caves(island, places.list.map((p) => ({ x: p.x, z: p.z, r: p.radius })));
terrain.clearings.push(...places.list.map((p) => ({ x: p.x, z: p.z, r: p.radius + 25 })), ...caves.list.map((c) => ({ x: c.mouth.x, z: c.mouth.z, r: 30 })));
terrain.hole = caves;
player.caves = caves;
const inventory = new Inventory();
const gathering = new Gathering(terrain, inventory, (harvested, tree) => {
  if (harvested) sound.hit();
  else if (tree) sound.whump(0.35);
  else sound.hit();
});
const buildings = new Buildings(island, village, () => sound.whump(0.25));
buildings.addSolid(places);
buildings.moreVillages = () => places.villages();
/** Dragons rescued from Monster Castles, and the village each went to live in. */
let rescued: { place: string; village: { x: number; z: number; r: number } }[] = [];
/** Rescued dragons' models, so they can give quests. */
const rescuedModels = new Map<string, DragonModel>();
/** Where you wake up if knocked out: the last village you were in. */
let lastVillage = { x: island.home.x, z: island.home.z };
scene.add(sky.group, terrain.group, village.group, sheep.group, fire.object, fire.light, projectiles.group, dens.group,
  gathering.group, buildings.group, places.group, caves.group);

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
    <div class="hint">Mouse fire / claws · T talk · B build · M map · I treasures · V view · Esc pause</div>
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
const outside = [terrain.group, village.group, sheep.group, dens.group, gathering.group, buildings.group, places.group, caves.group, ocean];
const interiors = new Interiors(scene, ui, (inside) => {
  for (const o of outside) o.visible = !inside;
  sky.indoors = inside;
  projectiles.island = fire.island = inside ? interiors.current!.interior : island;
  if (inside) {
    const where = interiors.current!.place;
    showPlace(where.name.replace(/^the /, 'The '));
    quests.visited(where.id);
  } else currentBiome = null;
}, (place, interior) => new Lair(place, interior, world, { beaten: places.beaten.has(place.id), hoardTaken: places.hoards.has(place.id) }, lairEvents));

/** A rescued dragon moves into the nearest village (not the castle it was rescued from). */
function settleRescued(placeId: string, home: { x: number; z: number; r: number }) {
  const place = places.list.find((p) => p.id === placeId)!;
  const a = place.seed * 2.4;
  rescuedModels.set(placeId, village.addVillager({ x: home.x + Math.cos(a) * 30, z: home.z + Math.sin(a) * 30 }, home, prisonerFor(place).colorSeed));
}

const lairEvents: LairEvents = {
  bossDefeated(place, boss) {
    places.beaten.add(place.id);
    quests.defeated(boss.kind);
    inventory.add('gold', BOSS_GOLD);
    if (place.kind === 'castle') {
      places.setOwned(place.id);
      inventoryHud.toast(`${place.name} is yours now!`);
    }
    refreshMarkers();
    save();
  },
  rescued(place) {
    const others = buildings.villages().filter((v) => Math.hypot(v.x - place.x, v.z - place.z) > 1);
    const home = others.reduce((a, b) => (Math.hypot(a.x - place.x, a.z - place.z) < Math.hypot(b.x - place.x, b.z - place.z) ? a : b));
    rescued.push({ place: place.id, village: { x: home.x, z: home.z, r: home.r } });
    quests.rescued(place.id);
    settleRescued(place.id, home);
    inventoryHud.toast(`${prisonerFor(place).name} flies off to live in ${home.name}.`);
    save();
  },
  hoardTaken(place) {
    places.hoards.add(place.id);
    inventory.add('gold', HOARD_GOLD);
    const scales = HOARD_SCALES[place.id];
    if (scales) { rewards.grantAccessory(scales); inventoryHud.toast(`You found ${ACCESSORIES[scales].name}!`); }
    inventoryHud.toast(`The Gold Hoard of ${place.name.replace(/^the /, '')}!`);
    save();
  },
  say(text) { inventoryHud.toast(text); },
};

// ---------- quests and rewards ----------
const rewards = new Rewards();
const quests = new Quests({
  home: island.home,
  places: places.list.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z })),
  caves: caves.list.map((c) => ({ id: c.id, x: c.mouth.x, z: c.mouth.z })),
  prisoner: (id) => prisonerFor(places.list.find((p) => p.id === id)!).name,
});
const rewardNames = { power: (p: keyof typeof POWERS) => POWERS[p].name, accessory: (a: AccessoryId) => ACCESSORIES[a].name };
quests.onComplete = (q: Quest) => {
  const r = q.reward;
  if (r.wood) inventory.add('wood', r.wood);
  if (r.stone) inventory.add('stone', r.stone);
  if (r.gold) inventory.add('gold', r.gold);
  if (r.power) { rewards.grantPower(r.power); showPlace(`Power: ${POWERS[r.power].name}!`); }
  if (r.accessory) rewards.grantAccessory(r.accessory);
  inventoryHud.toast(`Quest complete: ${q.title}! (${rewardText(r, rewardNames)})`);
  save();
};
const givers = new QuestGivers(hudEl, quests, inventory, (id) => places.beaten.has(id), (t) => inventoryHud.toast(t));
scene.add(givers.group);
buildings.addSolid({ colliders: givers.colliders, obstacles: [] });
const treasures = new Treasures(hudEl, rewards);
/** Powers change the dragon's numbers; Accessories change how it looks. */
rewards.onChange = () => {
  const v = player.vitals;
  const tough = rewards.has('toughScales'), deep = rewards.has('deepLungs'), hot = rewards.has('hotterFire');
  v.maxHealth = tough ? 150 : 100;
  v.armor = tough ? 0.75 : 1;
  v.maxFire = deep ? 160 : 100;
  v.refill = deep ? 1.5 : 1;
  v.health = Math.min(v.health, v.maxHealth);
  v.fire = Math.min(v.fire, v.maxFire);
  fire.power = hot ? 1.6 : 1;
  fire.reach = hot ? 1.3 : 1;
  player.speedBoost = rewards.has('swiftWings') ? 1.35 : 1;
  const scales = rewards.worn.scales ? ACCESSORIES[rewards.worn.scales] : null;
  const sheen = rewards.worn.sheen ? ACCESSORIES[rewards.worn.sheen] : null;
  const look = { color: scales?.color, accent: scales?.accent, sheen: sheen?.color, crown: rewards.worn.head === 'crown', amulet: rewards.worn.neck === 'rubyAmulet' };
  const key = JSON.stringify(look);
  if (key !== lastLook) { lastLook = key; player.dress(look); }
  treasures.draw();
};
let lastLook = JSON.stringify({ crown: false, amulet: false });
/** Each Dungeon's hoard holds a new scale colour. */
const HOARD_SCALES: Record<string, AccessoryId> = { 'dungeon-2': 'emeraldScales', 'dungeon-3': 'crimsonScales', 'dungeon-4': 'midnightScales' };

/** Villagers who give quests: Ruby and Sky in the Home Village, and every rescued dragon. */
function villagerGivers(): Giver[] {
  const out: Giver[] = [];
  const ruby = village.villagerModel(0), sky = village.villagerModel(1);
  if (ruby) out.push({ id: 'ruby', name: 'Ruby', at: ruby.root, height: 12 });
  if (sky) out.push({ id: 'sky', name: 'Sky', at: sky.root, height: 12 });
  for (const [id, m] of rescuedModels) out.push({ id, name: prisonerFor(places.list.find((p) => p.id === id)!).name, at: m.root, height: 12 });
  return out;
}

/** A Quest Board in every village (and in every castle you've won). */
function placeBoards() {
  const h = island.home;
  givers.board('board-home', h.x + 24, island.heightAt(h.x + 24, h.z + 24), h.z + 24, h.x, h.z);
  for (const v of buildings.villages()) {
    if (v.x === h.x && v.z === h.z) continue;
    const castle = places.list.find((p) => p.x === v.x && p.z === v.z);
    if (castle) {
      const out = new THREE.Vector3(-Math.sin(castle.rot), 0, -Math.cos(castle.rot));
      const at = castle.portal.clone().addScaledVector(out, 25);
      givers.board(`board-${castle.id}`, at.x, castle.y, at.z, castle.portal.x, castle.portal.z);
    } else {
      givers.board(`board-${Math.round(v.x)},${Math.round(v.z)}`, v.x, island.heightAt(v.x, v.z + 48), v.z + 48, v.x, v.z);
    }
  }
}

function refreshMarkers() {
  worldMap.markers = [
    ...places.list.map((p) => ({ x: p.x, z: p.z, kind: p.kind, owned: places.isOwned(p.id) })),
    ...caves.list.map((c) => ({ x: c.mouth.x, z: c.mouth.z, kind: 'cave' as const })),
  ];
}
const worldMap = new WorldMap(island, hudEl);
refreshMarkers();
const combatHud = new CombatHud(hudEl);
const inventoryHud = new InventoryHud(hudEl);
inventory.onGain = (m, n) => inventoryHud.gained(m, n);
const buildMode = new BuildMode(scene, hudEl, island, inventory, buildings, (kind) => {
  inventoryHud.toast(`Building a ${BUILDINGS[kind].name}!`);
  save();
});
dens.onDefeated = caves.onDefeated = (m) => {
  inventory.add('gold', GOLD_DROP[m.kind]);
  quests.defeated(m.kind);
};
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
    places: { owned: places.ownedIds, beaten: [...places.beaten], hoards: [...places.hoards] },
    rescued,
    quests: quests.state,
    rewards: rewards.state,
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
    places.reset();
    for (const id of data.places?.owned ?? []) places.setOwned(id);
    for (const id of data.places?.beaten ?? []) places.beaten.add(id);
    for (const id of data.places?.hoards ?? []) places.hoards.add(id);
    rescued = data.rescued ?? [];
    rescuedModels.clear();
    for (const r of rescued) settleRescued(r.place, r.village);
    quests.state = data.quests ?? NO_QUESTS;
    rewards.state = data.rewards ?? { powers: [], accessories: [], worn: {} };
  } else {
    buildings.clear();
    places.reset();
    rescued = [];
    rescuedModels.clear();
    quests.state = NO_QUESTS;
    rewards.state = { powers: [], accessories: [], worn: {} };
    // A new game starts in the Home Village, looking towards the mountains.
    player.placeAt(island.home.x, island.home.z + 40, 0.6);
    sky.time = 0.3;
    playSeconds = 0;
    inventory.state = { wood: 0, stone: 0, gold: 0 };
    lastVillage = { x: island.home.x, z: island.home.z };
    worldMap.explored = new Uint8Array(island.W * island.H);
  }
  refreshMarkers();
  givers.clearBoards('board-home');
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
      Claw trees and rocks for <b>wood</b> and <b>stone</b> · <b>B</b> build<br>
      <b>T</b> talk to villagers with a <b>!</b> · <b>I</b> treasures · fly into dark doorways and caves to explore
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
  (window as unknown as { game: unknown }).game = { treasures, quests, rewards, givers, places, caves, interiors, island, player, terrain, sky, worldMap, renderer, dens, fire, claws, input, inventory, buildings, buildMode, gathering };
} else {
  showTitle();
}

// ---------- fighting ----------

/** Monsters you can fight here: a Boss inside, or the dens' monsters outside. */
function foes(): Monster[] {
  return interiors.current ? interiors.current.lair.monsters : [...dens.active, ...caves.active];
}

/** The monster to show a health bar for: whoever you're fighting, nearest first. */
function currentFoe(): Monster | null {
  let best: Monster | null = null, bestD = Infinity;
  for (const m of foes()) {
    if (!m.alive || !(m.aggro || m.sinceFight < 6)) continue;
    const d = m.position.distanceTo(player.position);
    if (d < 250 && d < bestD) { best = m; bestD = d; }
  }
  return best;
}

function updateCombat(dt: number) {
  const v = player.vitals;
  const targets = foes();
  const building = buildMode.usingMouse;
  const wantFire = (input.isMouseDown(0) && !building || input.isDown('KeyE')) && !v.knockedOut;
  fire.update(dt, wantFire, player, targets);
  sound.fire(fire.breathing);
  const gatherable = interiors.current ? [] : [...gathering.targetsNear(player.position), ...caves.targetsNear(player.position, inventory, () => sound.hit())];
  claws.update(dt, input, player, [...targets, ...gatherable], () => sound.swish(), !building || input.wasPressed('KeyF'));
  if (!interiors.current) {
    dens.update(dt, world);
    caves.update(dt, world);
  }
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
    if (input.wasPressed('KeyI')) treasures.toggle();
    treasures.update(input);
    const wasSwimming = player.mode === 'swim';
    if (!inside) buildMode.update(input, camera, player.position);
    if (!interiors.busy) player.update(dt, input);
    if (inside) pushDragonOut(player.position, player.yaw, [...inside.interior.colliders, ...inside.lair.colliders]);
    else {
      buildings.pushOut(player.position, player.yaw);
      caves.pushOut(player.position, player.yaw);
    }
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
      placeBoards();
      const inCave = caves.at(player.position);
      if (inCave && inCave.depth > 0.3) quests.visited(inCave.cave.id);
    }
    givers.update(dt, input, player.position, villagerGivers(), !inside && !interiors.busy);
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
  // Deep in a cave it gets dark.
  const cave = interiors.current ? null : caves.at(camera.position);
  if (cave) {
    const dark = cave.depth;
    sky.sun.intensity *= 1 - 0.95 * dark;
    sky.moon.intensity *= 1 - 0.95 * dark;
    sky.ambient.intensity *= 1 - 0.8 * dark;
    fog.color.lerp(new THREE.Color('#0b0807'), dark);
  }
  if (interiors.current) { fog.near = 30; fog.far = 260; }
  else if (cave && cave.depth > 0.3) { fog.near = 30; fog.far = 400; }
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
