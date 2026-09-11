import * as THREE from 'three';
import { Engine }        from './core/engine.js';
import { Input }         from './core/input.js';
import { buildRoom }     from './game/room.js';
import { buildLighting } from './game/lighting.js';
import { FLOORS as MODULES, floorZones } from './game/floors.js';
import { Player }        from './game/player.js';
import { Enemies, TYPES } from './game/enemies.js';
import { Armory } from './game/armory.js';
import { StoreTutorial } from './game/store-tutorial.js';
import { Weapon, GUNS }  from './game/weapons.js';
import { Pickups }       from './game/pickups.js';
import { Fx }            from './game/fx.js';
import { ExitGuide }     from './game/guide.js';
import { Boss }          from './game/boss.js';
import { Hud }           from './ui/hud.js';
import { Story }         from './ui/story.js';
import { FloorUpgrades } from './ui/floor-upgrades.js';
import { audio }         from './core/audio.js';
import { Vault }         from './game/vault.js';

// Opt-in local playtest loadout. Normal progression is the default.
const POWER_TEST = ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname)
  && new URLSearchParams(location.search).has('power')
  && !new URLSearchParams(location.search).has('normal');
let assistedRun = POWER_TEST;

/* --------------------------------------------------------- mercy system --
   If a player dies 3 times on the same floor they get a small free buff.
   6 deaths gives a second one. Buffs are deliberately milder than a normal
   upgrade card (~60-80% of a card's value) — enough to tip the balance
   without trivialising the floor. A mercy-assisted run is flagged so it
   cannot post to the leaderboard. */
const MERCY_BUFFS = [
  { id: 'mercy-dmg',   name: 'SUIT RECALIBRATED · +8% DAMAGE',
    apply: () => weapon.applyRunMods({ damage: 1.08 }) },
  { id: 'mercy-rate',  name: 'SUIT RECALIBRATED · +8% FIRE RATE',
    apply: () => weapon.applyRunMods({ fireRate: 1.08 }) },
  { id: 'mercy-shield', name: 'EMERGENCY PLATING · +1 SHIELD',
    apply: () => { player.shield += 1; hud.setShield(player.shield); return null; } },
  { id: 'mercy-range', name: 'SUIT RECALIBRATED · +50% PICKUP RANGE',
    apply: () => { loot.magnetMul *= 1.5; return 'range'; } },
  { id: 'mercy-speed', name: 'SUIT RECALIBRATED · +8% SPEED',
    apply: () => { player.speedMul *= 1.08; return 'speed'; } },
];
let mercyActive = [];   // { buff, revertData } entries for the current floor

/* Drives the persistent #mercy badge — see hud.setMercy() for why this exists
   instead of relying on the toast. Called after every event that changes what
   it should say: a death, mercy firing, or leaving the floor. */
function updateMercyHud(){
  if (mercyActive.length){
    hud.setMercy({ names: mercyActive.map(m => m.buff.name.split(' · ')[1] || m.buff.name) });
    return;
  }
  // stay quiet on a floor with zero deaths so far — the badge is forgiveness
  // for a floor that's going badly, not an ambient invitation to die for loot
  if (state.floorDeaths <= 0){ hud.setMercy(null); return; }
  const next = state.floorDeaths < 3 ? 3 - state.floorDeaths
             : state.floorDeaths < 6 ? 6 - state.floorDeaths
             : 0;
  hud.setMercy(next > 0 ? { until: next } : null);
}

function applyMercy(){
  // pick a buff that hasn't been used this floor
  const used = new Set(mercyActive.map(m => m.buff.id));
  const pool = MERCY_BUFFS.filter(b => !used.has(b.id));
  if (!pool.length) return;
  const buff = pool[Math.floor(Math.random() * pool.length)];
  const revertData = buff.apply();
  mercyActive.push({ buff, revertData });
  assistedRun = true;
  hud.toast(buff.name, 2800);
  audio.confirm();
  updateMercyHud();
}

function revertMercy(){
  for (const m of mercyActive){
    if (m.revertData === 'speed') player.speedMul /= 1.08;
    else if (m.revertData === 'range') loot.magnetMul /= 1.5;
    else if (m.revertData) weapon.removeRunUpgrade(m.revertData);
    // shield is consumed — nothing to revert
  }
  mercyActive = [];
  updateMercyHud();
}

function applyPowerBuffs(){
  weapon.applyRunMods({ damage:2, fireRate:1.5, projectile:1.25, pierce:2 });
  player.speedMul = 1.25;
}

const engine  = new Engine(document.getElementById('c'));
const input   = new Input(engine.canvas, document.getElementById('stick'));
const hud     = new Hud(engine);
let bootStarted = false;
const revealGame = () => {
  if (bootStarted) return;
  bootStarted = true;
  hud.ready();
};
const story = new Story(({ firstRun }) => {
  if (firstRun) revealGame();
});

const lights  = buildLighting(engine.scene);
engine.key    = lights.key;
engine.onQualityChange = (q, fps) => console.info(`[verdant] ${fps}fps — quality → ${q}`);

const fx      = new Fx(engine.scene);
const guide   = new ExitGuide(engine.scene);
const boss    = new Boss(engine.scene);
const player  = new Player(engine.scene);
const enemies = new Enemies(engine.scene);
const weapon  = new Weapon(engine.scene);
const loot    = new Pickups(engine.scene);
// gems: a second, smaller pool so a green drop reads apart from the gold
const gems    = new Pickups(engine.scene, { color: 0x4ade80, size: 0.26, glow: 1.1, max: 24 });
const vault   = new Vault();
const armory = new Armory(weapon, player, input);
if (POWER_TEST){
  armory.save = () => {}; // Leave normal progression intact for later.
  for (const gun of GUNS) armory.levels[gun.id] = 5;
  armory.selected = 'plasma';
  armory.coins = 100000;
  armory.apply();
  armory.render();
  applyPowerBuffs();
}
armory.vault = vault;
armory.hud = hud;   // lets buyHeal() reflect the new HP bar immediately
const storeTutorial = new StoreTutorial(engine.scene, armory);
const floorUpgrades = new FloorUpgrades({ weapon, player, loot, vault });
vault.onChange = n => { hud.setCounts({ vault: n }); armory.updateWallet(); };
// a perk bought mid-floor applies at once; a bought shield only lands next floor
armory.onPerk = id => {
  if (id === 'revive') state.run.revives = Math.max(state.run.revives, 1);   // usable this run, not next
  applyPerks(false);
};
function applyPerks(newFloor){
  player.armor = vault.damageMul * (POWER_TEST ? .5 : 1);
  loot.valueMul = loot.valueMul / (loot.perkMul || 1) * vault.coinMul;
  loot.perkMul = vault.coinMul;
  if (newFloor) player.shield = Math.max(player.shield, vault.startShield);
  if (newFloor && POWER_TEST) player.shield = Math.max(player.shield, 10);
  /* Second Wind used to be a once-per-RUN charge, so using it on floor 3 left
     floors 4-20 with no safety net at all. It is now a once-per-FLOOR one:
     every floor entry — a fresh floor or a retry after dying — refills it,
     the same moment shield tops up above. Buying it mid-floor still goes
     through the `id === 'revive'` branch in armory.onPerk instead, which is
     usable immediately without waiting for the next floor. */
  if (newFloor) state.run.revives = vault.revives;
  hud.setRevives(state.run.revives);
}
document.getElementById('story-replay').addEventListener('click', e => {
  e.stopPropagation();
  input.keys.clear();
  input.stick = null;
  input.touchId = null;
  input.stickEl.classList.remove('on');
  player.vel.set(0, 0, 0);
  story.start(false);
});

let room = null;
const shopCamera = {position:new THREE.Vector3(), rotation:new THREE.Quaternion(), target:new THREE.Vector3()};
const shopAim = new THREE.Vector3();
let shopTime = 0;
armory.onOpen = station => {
  shopCamera.position.copy(engine.camera.position); shopCamera.rotation.copy(engine.camera.quaternion);
  shopCamera.target.set(station.x + 2.4, 3.5, station.z + 7.2);
  shopAim.set(station.x, -.25, station.z - .45); shopTime = 0;
  player.body.visible = true;
  room.store.label.visible = false;
  player.facing = .2; player.body.rotation.y = .2;
  document.getElementById('hud').classList.add('shopping');
  document.getElementById('store-progress').hidden = true;
};
armory.onClose = () => {
  room.store.label.visible = true;
  engine.camera.position.copy(shopCamera.position); engine.camera.quaternion.copy(shopCamera.rotation);
  document.getElementById('hud').classList.remove('shopping');
};
const storeAnchor=new THREE.Vector3(), storeScreen=new THREE.Vector2();
armory.onProgress = (station,visible,fraction) => {
  const el=document.getElementById('store-progress'); el.hidden=!visible;
  storeAnchor.set(station.x,2.25,station.z);
  engine.camera.updateMatrixWorld(); engine.project(storeAnchor,storeScreen);
  /* Clamp above the floor header, not just wherever the pad happens to project
     to. This is a world-tracked ring — its screen position depends on camera
     framing, which varies by room size and aspect ratio — so on a phone,
     where the header can run to ~170px tall wrapping a 4-room list, the ring
     was landing right on top of the header text with nothing to stop it. */
  const headerBottom = document.querySelector('.h.tc')?.getBoundingClientRect().bottom || 0;
  el.style.left=storeScreen.x+'px';
  el.style.top=Math.max(storeScreen.y, headerBottom + 24)+'px';
  el.style.setProperty('--progress',`${fraction*360}deg`);
  el.firstElementChild.textContent=fraction ? `${(2-fraction*2).toFixed(1)}s` : '2s';
};

const state = {
  phase: 'fight',        // fight | exit | enter | dead | escaped
  module: 0,
  budget: 0, remaining: 0, spawned: 0, spawnCd: 0,
  cleared: false, upgradeIn: null,
  hitStop: 0, biomass: 0,
  flash: 0, seal: 0, phaseT: 0,
  run: { kills: 0, coins: 0, floors: 0, t: 0, gems: 0, revives: 0 }, hold: 0, bossFight: false,
  floorDeaths: 0
};
storeTutorial.onComplete = () => {
  state.spawnCd = .65;
  hud.toast('TRAINING COMPLETE · PRUNING LASER LV 2', 2600);
};

/* ------------------------------------------------------------- modules -- */
function loadModule(i){
  // Every retry starts a new encounter, including boss targets and wildcard costs.
  floorUpgrades.clearWildcards();
  boss.onDeath = null;
  boss.despawn();
  enemies.external.length = 0;
  state.bossFight = false;
  state.holdDone = false;
  state.hold = 0;
  hud.setBoss(null);
  room?.dispose();
  armory.dwell = 0; armory.storeLatched = false;
  const m = MODULES[i];
  room = buildRoom(engine.scene, {
    w: m.w, d: m.d, layout: m.layout, seed: i * 7919 + 13,
    plan: m.plan, rooms: m.rooms, machine: m.machine,
    accent: m.accent, tint: m.tint, cove: m.cove
  });
  lights.fit(m.w, m.d);
  // frame for the largest room on the floor, not the floor itself
  const bigW = Math.max(...room.zones.map(z => z.x1 - z.x0));
  const bigD = Math.max(...room.zones.map(z => z.z1 - z.z0));
  engine.fitRoom(bigW + 3, bigD + 3, m.w, m.d);

  enemies.clear(); weapon.clear(); loot.clear(); gems.clear();
  state.module = i;
  state.zones = floorZones(m, room);
  state.activeRoom = 0;
  state.budget = m.total;
  state.remaining = m.total;
  state.spawned = 0;
  state.spawnCd = storeTutorial.active && i === 0 ? 999 : 1.5;
  state.cleared = false;
  state.upgradeIn = null;

  player.pos.copy(room.entryPos);
  player.vel.set(0, 0, 0);
  player.facing = Math.PI / 2;
  player.aim = null;
  storeTutorial.attach(room, i);
  engine.camTarget.set(
    Math.max(-engine.clampX, Math.min(engine.clampX, player.pos.x)),
    0,
    Math.max(-engine.clampZ, Math.min(engine.clampZ, player.pos.z))
  );

  room.seal(1);
  applyPerks(true);
  hud.setShield(player.shield);
  guide.setFloor(room);
  hud.minimap.setFloor(room);
  hud.setModule(i, m.name, m.total);
  hud.setFloorRooms(state.zones,0,false);
  hud.setProgress(0);
}

function restartRun(){
  floorUpgrades.reset();
  armory.resetRun();
  if (POWER_TEST) applyPowerBuffs();
  guide.disarm();
  hud.setBoon(null);
  loot.perkMul = 1;   // reset() zeroed valueMul; the perk share is rebuilt by applyPerks
  state.run = { kills: 0, coins: 0, floors: 0, t: 0, gems: 0, revives: vault.revives };
  state.hold = 0; state.holdDone = false; state.resultsShown = false;
  state.bossFight = false;
  boss.despawn();
  enemies.external.length = 0;
  hud.setBoss(null);
  player.group.position.y = 0;
  player.group.scale.setScalar(1.28);
  player.group.rotation.y = 0;
  state.biomass = 0;
  revertMercy();
  state.floorDeaths = 0;
  armory.updateWallet();
  startModule(0);
}

function startModule(i){
  loadModule(i);
  player.hp = 1; player.invuln = 1.0; player.hitFlash = 0; player.body.visible = true;
  hud.setHp(1);
  hud.setDead(false);
  state.phase = 'enter';
  state.phaseT = 0;
  state.seal = 0;
  state.flash = 1;
  state.hitStop = 0;

  // mercy: grant a small buff at 3 and 6 deaths on the same floor
  if (state.floorDeaths === 3 || state.floorDeaths === 6) applyMercy();
  else updateMercyHud();
}

/* Spawn on the perimeter, never in the player's lap and never inside geometry.
   The design rule is that a surround has to be something the player walked into. */
function spawnPoint(rooted, zone){
  for(let tries=0;tries<50;tries++){
    const x=zone.x0+Math.random()*(zone.x1-zone.x0);
    const z=zone.z0+Math.random()*(zone.z1-zone.z0);
    if(Math.hypot(x-player.pos.x,z-player.pos.z)<5)continue;
    if(room.colliders.some(c=>Math.abs(x-c.x)<c.hw+.9 && Math.abs(z-c.z)<c.hd+.9))continue;
    return [x,z];
  }
  return null;
}

const ELITE = new Set(['stalker', 'thornbeast', 'bloomer', 'seeder']);

function pickType(mix){
  let total = 0;
  for (const [, w] of mix) total += w;
  let r = Math.random() * total;
  for (const [k, w] of mix){ r -= w; if (r <= 0) return k; }
  return mix[0][0];
}

/* Difficulty curve.

   This has now been tuned twice, and the second pass mattered more than the first.

   Pass one assumed the player accumulates upgrades: ~19 of them across the tower,
   which multiplied damage about 6.3x and let the health curve climb steeply
   (4.2x at the top) while time-to-kill stayed flat.

   That assumption is dead. Floor upgrades now expire after 30 seconds, so they
   are a burst, not a stack — sustained damage is whatever the equipped gun does
   and nothing more. Re-measured against gun-only damage, the old curve pushed
   time-to-kill from 0.48s on floor 1 to 1.32s on floor 20 while the room also
   went from 12 enemies to 42. That is the "impossible" side of the line.

   So the late slope is now nearly flat (0.03/floor against 0.18 early), topping
   out at ~2.9x. Time-to-kill still rises — 0.48s to 0.91s — so enemies do get
   tougher, but the real difficulty above floor 10 is volume: 42 alive against
   32, a spawn every 0.32s against 0.42s, 180 growth against 118.

   One wrinkle worth knowing: gun damage-per-second is NOT monotonic across the
   tower. Needle Drive (floors 7-10) is 12.7/s while the pricier Violet Rail and
   Solar Plasma are 10.1 and 9.6 — they trade rate for per-shot punch. A
   monotonically rising health curve therefore cannot hold time-to-kill perfectly
   flat, and the small step up at floor 11 is that, not a bug. */
export function floorHpScale(floor, roomIndex = 0){
  return 1 + Math.min(floor, 9) * 0.18 + Math.max(0, floor - 9) * 0.03 + roomIndex * 0.08;
}
export function floorDamageScale(floor, roomIndex = 0){
  return Math.min(2.4, 1 + Math.min(floor, 9) * 0.12 + Math.max(0, floor - 9) * 0.04 + roomIndex * 0.06);
}
function scaleEnemy(e, roomIndex = state.activeRoom){
  if (!e) return e;
  // rooted spawners scale by the square root: their threat is what they make,
  // and a 60 hp Bloomer behind a screen of children is a grind, not a fight
  const hs = floorHpScale(state.module, roomIndex);
  e.maxHp = Math.max(1, Math.ceil(e.def.hp * (e.def.rooted ? Math.sqrt(hs) : hs)));
  e.hp = e.maxHp;
  e.damageScale = floorDamageScale(state.module, roomIndex);
  return e;
}

/* The biggest room on the floor, and a spot in it clear enough to stand a boss
   in. Heartroot is 4.7m across, so dropping it on the room centre without
   checking would happily bury it in a machine. */
function bossArena(){
  const rooms = room.plan.rooms;
  let best = rooms[0], bestArea = -1;
  for (const r of rooms){
    const area = (r.x1 - r.x0) * (r.z1 - r.z0);
    if (area > bestArea){ bestArea = area; best = r; }
  }
  const cx = (best.x0 + best.x1) / 2, cz = (best.z0 + best.z1) / 2;
  const rect = { x0: best.x0, x1: best.x1, z0: best.z0, z1: best.z1 };
  const clearOf = (x, z) => !room.colliders.some(c =>
    Math.abs(x - c.x) < c.hw + 3.2 && Math.abs(z - c.z) < c.hd + 3.2);
  if (clearOf(cx, cz)) return { x: cx, z: cz, rect };
  // spiral outward from the centre for the nearest spot that fits
  for (let r0 = 1; r0 <= 7; r0 += 1){
    for (let a = 0; a < 12; a++){
      const th = (a / 12) * Math.PI * 2;
      const x = cx + Math.cos(th) * r0, z = cz + Math.sin(th) * r0;
      if (x > best.x0 + 3 && x < best.x1 - 3 && z > best.z0 + 3 && z < best.z1 - 3 && clearOf(x, z))
        return { x, z, rect };
    }
  }
  return { x: cx, z: cz, rect };
}

function startBoss(){
  /* Flag the fight immediately: the wildcard panel pauses the game, and
     clearRoom() must not complete the floor while the player is choosing. */
  state.bossFight = true;
  hud.toast('HEARTROOT AWAKENS', 2200);
  audio.duck(0.5, 1.4);
  engine.addShake(0.4);

  /* The one moment in the run where the player gets to pick a plan rather than
     a stat. It happens BEFORE the boss appears so the choice is made calmly,
     and because every wildcard costs something, arriving at the fight with no
     buffs (upgrades having long expired) is now a decision instead of a gap. */
  floorUpgrades.openWildcards((card, wasWild) => {
    hud.toast(wasWild ? `WILDCARD → ${card.name}` : `${card.name} PLAYED`, 2400);
    const a = bossArena();
    /* Health is sized against GUN-ONLY damage, deliberately.

       Floor upgrades expire after 30s, so unlike every floor below it the
       player arrives at Heartroot with no stacked buffs — whatever their gun
       does, plus one wildcard, is what they have. Measured sustained damage at
       this point is roughly 9.6/s on a maxed Solar Plasma and 16.9/s on a maxed
       Needle Drive, so 520 puts the fight between about 30 and 55 seconds:
       long enough to see every pattern twice, short enough that a miss is
       recoverable rather than a restart. */
    boss.spawn(a.x, a.z, 520, a.rect);
    enemies.external.push(boss);
    boss.onDeath = () => {
      const i = enemies.external.indexOf(boss);
      if (i >= 0) enemies.external.splice(i, 1);
      state.bossFight = false;
      state.holdDone = true;
      floorUpgrades.clearWildcards();   // the bet is settled
      hud.setBoss(null);
      hud.setBoon(floorUpgrades.soonest);
      audio.clear();
      if (state.budget === 0 && enemies.alive === 0) clearRoom();
    };
    fx.ring({ x: a.x, y: 0, z: a.z }, { color: 0xff2f9a, from: 0.5, to: 14, life: 1.1 });
    engine.addShake(0.35);
  });
}

function clearRoom(){
  if (state.cleared) return;
  /* This is called on every frame the room is empty, so once the boss is up it
     must not fall through and hand the player the stairs mid-fight. Heartroot's
     onDeath clears the flag and calls back in here to finish the floor. */
  if (state.bossFight) return;
  const last = state.module + 1 >= MODULES.length;
  if (last && !state.bossFight && !state.holdDone){
    /* The roof does not just open. Clearing the growth on the last floor wakes
       the thing the station has been growing this whole time — the run ends on
       the boss rather than on a walk to a door. */
    startBoss();
    return;
  }
  state.cleared = true;
  audio.clear();
  // gems for the floor, plus the hold-out bonus on the last one
  const reward = Vault.floorReward(state.module, MODULES.length) + (state.holdDone ? 3 : 0);
  state.run.gems += reward; vault.earn(reward); hud.setCounts({ salvage: state.run.gems });
  hud.toast(`+${reward} GEM${reward > 1 ? 'S' : ''} · SEED VAULT`, 1500);
  fx.ring(room.exitPos, { color: 0x4ade80, from: 0.4, to: 6, life: 0.9 });
  engine.addShake(0.18);
  const unlock = upgrade => {
    room.unlockExit();
    guide.arm();          // stairs are open — show the way to them
    hud.toast(upgrade ? `${upgrade.name} INSTALLED · STAIRS OPEN` : 'ROOFTOP ACCESS OPEN', 2200);
  };
  /* Let the clear land first. Opening on the same frame as the last kill stomps
     the ring, the sound and the loot magnet — it read as interrupting the moment
     rather than rewarding it. */
  if (state.module + 1 < MODULES.length) state.upgradeIn = { t: 1.15, unlock };
  else unlock();
}

/* -------------------------------------------------------------- combat -- */
function fight(dt){
  const m = MODULES[state.module];
  if (m.bossArena && !state.bossFight && !state.holdDone){
    startBoss();
    return;
  }

  // -1 means "in a corridor": a room is only opened by actually walking into it
  const currentRoom = room.roomAt(player.pos.x, player.pos.z);
  if (currentRoom >= 0){
    state.zones[currentRoom].started = true;
    if (currentRoom !== state.activeRoom){
      state.activeRoom = currentRoom;
      hud.toast(state.zones[currentRoom].name, 1400);
    }
  }
  // live growth per room: what is standing there plus what has yet to spawn
  const perRoom = state.zones.map(z => z.budget);
  for (const e of enemies.list){
    if (!e.alive) continue;
    const ri = room.roomAt(e.pos.x, e.pos.z);
    if (ri >= 0) perRoom[ri]++;
  }
  hud.setFloorRooms(state.zones, currentRoom, state.cleared, perRoom);
  hud.minimap.update(dt, player, state.zones, currentRoom, state.cleared);
  hud.setThreats(enemies.list.filter(e => e.alive), player.pos);
  const zone = state.zones.find(z => z.started && z.budget > 0);
  if (zone){
    state.spawnCd -= dt;
    if (state.spawnCd <= 0 && enemies.alive < m.maxAlive){
      const n = Math.min(1 + (Math.random() < 0.5 ? 1 : 0), zone.budget);
      for (let i = 0; i < n; i++){
        const key = pickType(m.mix);
        const def = TYPES[key];
        const point = spawnPoint(!!def.rooted, zone);
        if (!point) continue;
        const [x,z] = point;
        const spawned = scaleEnemy(enemies.spawn(x, z, key), zone.index);
        if (spawned){
          state.budget--; zone.budget--;
          state.spawned++;
          audio.spawn();
          fx.ring({ x, y: 0, z }, { color: def.color, from: 0.2, to: 1.6 + def.radius, life: 0.4 });
          fx.burst({ x, y: 0.3, z }, { count: 6, color: def.color, speed: 3, size: 0.1, life: 0.4 });
        }
      }
      // Later rooms compress the quiet gaps, so entering deeper territory feels
      // immediately more dangerous even before the health scaling is noticed.
      state.spawnCd = m.interval * (m.bossArena ? 1 : Math.max(0.5, 0.9 - state.module * 0.035 - zone.index * 0.06))
        * (0.82 + Math.random() * 0.3);
    }
  }

  const kills = weapon.update(dt, player, enemies, fx, engine, room.bounds, room.colliders);
  if (kills) state.hitStop = 0.05;

  // Enemies elsewhere on the floor head for the doorway that leads toward the
  // player, instead of grinding into whatever wall is between them.
  for (const e of enemies.list){
    const here = room.roomAt(e.pos.x, e.pos.z);
    if (here === currentRoom){ e.route = null; continue; }
    const d = room.routeDoor(here, currentRoom);
    // once we're basically at the waypoint, drop it and home in directly
    e.route = (d && Math.hypot(e.pos.x - d.x, e.pos.z - d.z) > 1.0) ? d : null;
  }
  const rawDmg = enemies.update(dt, player, fx, room.colliders, room.bounds, engine, m.maxAlive + 6);
  // Children created by Bloomers and Seeders inherit the same room/floor tier
  // as normal wave spawns.
  for (const child of enemies.births){
    const childRoom = room.roomAt(child.pos.x, child.pos.z);
    scaleEnemy(child, childRoom >= 0 ? childRoom : Math.max(0, currentRoom));
  }
  // Damage events may come from several enemies at once. Use the strongest
  // currently touching floor tier rather than multiplying the whole swarm twice.
  let dmg = rawDmg * floorDamageScale(state.module, Math.max(0, currentRoom));

  /* Must run before the damage is applied below, or a beam hit would not land
     until the following frame. */
  if (state.bossFight && boss.alive){
    dmg = Math.max(dmg, boss.update(dt, player, fx, engine, room));
    hud.setBoss(boss);
  }

  // one place handles every death, however it happened: shot, detonated, or
  // walked into the player
  state.run.kills += enemies.deaths.length;
  for (const d of enemies.deaths){
    loot.drop(d, 1 + (Math.random() < 0.35 ? 1 : 0));
    // elites carry a gem now and then. Children of Bloomers/Seeders never do,
    // or a camped Bloomer would be a gem farm.
    if (ELITE.has(d.key) && !d.fromParent && Math.random() < 0.10) gems.drop(d, 1);
  }
  enemies.deaths.length = 0;
  enemies.births.length = 0;

  // the counter is what is left to kill, so a Bloomer pushing it back up is
  // exactly the feedback the player needs
  const left = state.budget + enemies.alive;
  if (left !== state.remaining){
    state.remaining = left;
    hud.setModule(state.module, m.name, left);
    hud.setProgress(Math.max(0, Math.min(1, 1 - left / m.total)));
  }
  if (state.hold > 0){
    state.hold -= dt;
    if (enemies.alive < m.maxAlive && Math.random() < dt * 2.2){
      const key = pickType(m.mix);
      const def = TYPES[key];
      const zone = state.zones[Math.max(0, currentRoom)];
      const pt = zone && spawnPoint(!!def.rooted, zone);
      if (pt && scaleEnemy(enemies.spawn(pt[0], pt[1], key), Math.max(0, currentRoom))){
        audio.spawn();
        fx.ring({ x: pt[0], y: 0, z: pt[1] }, { color: def.color, from: 0.2, to: 1.8, life: 0.4 });
      }
    }
    hud.setModule(state.module, m.name, Math.ceil(state.hold));
    if (state.hold <= 0){ state.hold = 0; state.holdDone = true; clearRoom(); }
  } else if (left === 0 && !state.cleared) clearRoom();

  // ...and wait for the pickups to finish flying in before taking the screen
  if (state.upgradeIn){
    state.upgradeIn.t -= dt;
    if (state.upgradeIn.t <= 0 && !loot.pending && !gems.pending){
      const done = state.upgradeIn.unlock;
      state.upgradeIn = null;
      floorUpgrades.open(state.module, done);
    }
  }
  /* Buff clocks only run while fighting: the stairs walk, the upgrade screen
     and the armory must not eat the 30 seconds. */
  floorUpgrades.update(dt);
  hud.setBoon(floorUpgrades.soonest);
  hud.setShield(player.shield);
  if (dmg > 0 && player.takeDamage(dmg)){
    if (player.shieldBroke){
      // a shield eating a hit has to read differently from taking one.
      // NB: branch, don't return — the rest of the frame still owes the player
      // loot pickup, the stairs check and the upgrade timer.
      player.shieldBroke = false;
      audio.tap();
      fx.ring(player.pos, { color: 0x7dd3fc, from: 0.5, to: 2.4, life: 0.34 });
      engine.addShake(0.12);
      hud.setShield(player.shield);
    } else {
      audio.hurt();
      engine.addShake(0.3);
      hud.setHp(player.hp);
      fx.ring(player.pos, { color: 0xff6b6b, from: 0.4, to: 2.2, life: 0.3 });
      if (player.hp <= 0 && state.run.revives > 0){
        // Second Wind: the suit reboots you on the spot, once per run
        state.run.revives--;
        player.hp = 0.5; player.invuln = 2.2; player.shield += 1;
        hud.setHp(player.hp); hud.setShield(player.shield); hud.setRevives(state.run.revives);
        hud.toast('SECOND WIND — SUIT REBOOTED', 2200);
        audio.clear(); engine.addShake(0.35);
        fx.ring(player.pos, { color: 0x4ade80, from: 0.5, to: 5, life: 0.7 });
        fx.burst(player.pos, { count: 26, color: 0x4ade80, speed: 8, size: 0.14, life: 0.7, up: 3 });
        for (const e of enemies.list){
          if (!e.alive) continue;
          const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, dd = Math.hypot(dx, dz) || 1;
          if (dd < 6){ e.vel.x += dx / dd * 14; e.vel.z += dz / dd * 14; }
        }
      } else if (player.hp <= 0){
        state.phase = 'dead'; state.phaseT = 0;
        state.floorDeaths++;
        updateMercyHud();
        audio.dead();
        audio.duck(0.35, 1.6);
        hud.setDead(true);
        engine.addShake(0.45);
        fx.burst(player.pos, { count: 22, color: 0xff8c42, speed: 7, size: 0.15, life: 0.7, up: 3 });
      }
    }
  }

  const got = loot.update(dt, player, state.cleared, room.bounds);
  if (got){ state.biomass += got; const coins = Math.round(got * 5 * loot.valueMul);
    state.run.coins += coins; armory.earn(coins); hud.collectCoins(coins);
    fx.burst({x:player.pos.x, y:0.65, z:player.pos.z}, {count:4, color:0xf5c518, speed:2, size:0.065, life:0.22, up:0.8}); }
  const gotGems = gems.update(dt, player, state.cleared, room.bounds);
  if (gotGems){
    state.run.gems += gotGems; vault.earn(gotGems); hud.setCounts({ salvage: state.run.gems });
    hud.toast(`+${gotGems} GEM · SEED VAULT`, 1100);
    fx.ring(player.pos, { color: 0x4ade80, from: 0.3, to: 2.4, life: 0.4 });
  }

  guide.update(dt, player.pos);

  // walking into the open doorway starts the transition
  if (state.cleared && !loot.pending && !gems.pending && Math.hypot(player.pos.x - room.stairs.x, player.pos.z - room.stairs.z) < 2.0){
    state.phase = 'exit'; state.phaseT = 0;
    guide.disarm();
    audio.door();
    audio.duck(0.3, 1.3);
  }
}

/* ------------------------------------------------------------ transition -- */
const EXIT_T = 1.0, ENTER_T = .75;

function transition(dt, dir){
  state.phaseT += dt;

  if (state.phase === 'exit'){
    // scripted walk through the doorway while the light floods in
    player.pos.x += 1.5 * dt;
    player.group.position.copy(player.pos);
    player.group.position.y = Math.min(.9,state.phaseT);
    player.vel.set(0, 0, 0);
    player.aim = null;
    player.facing += (Math.PI/2 - player.facing) * Math.min(1, 12 * dt);
    state.flash = Math.min(1, state.phaseT / EXIT_T);

    if (state.phaseT >= EXIT_T){
      const next = state.module + 1;
      if (next >= MODULES.length){
        state.phase = 'escaped'; state.phaseT = 0;
        state.run.floors++;
        hud.toast('TOWER ESCAPED — EXTRACTION COMPLETE', 3200);
        return;
      }
      state.run.floors++;
      // reset the count BEFORE reverting, so revertMercy's updateMercyHud()
      // computes off the new floor's zero rather than the old floor's tally
      state.floorDeaths = 0;
      revertMercy();
      loadModule(next);
      state.phase = 'enter'; state.phaseT = 0; state.seal = 0;
      player.invuln = 0.9;
      hud.toast(MODULES[next].name, 1700);
    }
    return;
  }

  if (state.phase === 'enter'){
    state.flash = Math.max(0,1-state.phaseT/ENTER_T);
    player.group.position.copy(player.pos);
    if(state.phaseT>=ENTER_T){
      state.phase='fight';
      state.spawnCd = storeTutorial.active && state.module === 0 ? 999 : .7;
      hud.toast(storeTutorial.active && state.module === 0 ? 'FOLLOW THE CYAN PATH TO THE ARMORY' : `FLOOR ${state.module+1} · ${MODULES[state.module].name}`, 1900);
    }
    return;
  }

  if (state.phase === 'dead'){
    if (state.phaseT > 1.7) startModule(state.module);
    return;
  }

  if (state.phase === 'escaped'){
    // lifted out on a column of light, then the tally
    const k = Math.min(1, state.phaseT / 1.6);
    state.flash = state.phaseT < 0.35 ? state.phaseT / 0.35
                                      : Math.max(0, 1 - (state.phaseT - 0.35) / 1.3);
    player.group.position.y = k * k * 7;
    player.group.scale.setScalar(1.28 * (1 - k * 0.55));
    player.group.rotation.y += dt * 3.2;
    if (state.phaseT > 1.7 && !state.resultsShown){
      state.resultsShown = true;
      hud.showResults(
        { floors: state.run.floors, kills: state.run.kills, coins: state.run.coins, seconds: state.run.t, gems: state.run.gems, assisted:assistedRun },
        () => { state.resultsShown = false; restartRun(); }
      );
    }
  }
}

/* ---------------------------------------------------------------- loop -- */
hud.setFloorCount(MODULES.length);
hud.setCounts({ vault: vault.gems, salvage: 0 });
state.run.revives = vault.revives;
armory.updateWallet();
startModule(0);
engine.follow(player.pos, player.vel, 1);

/* ------------------------------------------------------- dev shortcuts -- */
/* Jumping straight to a floor, so the late game can be played without climbing
   twenty floors to reach it.

   Deliberately gated to a local host. A shipped build on a portal must not let
   anyone skip to the ending with a query string, and a leaderboard is worthless
   if a run can start on floor 20 — so on any other origin these are simply not
   read. `?floor=20` starts you on that floor; `?boss` goes to the top floor and
   wakes Heartroot immediately.

   `?boss` also hands you an endgame loadout, because arriving with the starting
   Pruning Laser makes the fight a 90-second grind that tests nothing. */
/* Escape hatch for the black-screen case: `?nopost` renders the scene straight
   to the canvas with no post-processing. Available on any host, not just dev —
   if a player's GPU cannot present the composed frame, this is the difference
   between a playable game and nothing. */
if (new URLSearchParams(location.search).has('nopost')) engine.setPost(false);

const DEV_HOST = ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);
if (DEV_HOST){
  const q = new URLSearchParams(location.search);
  const wantsBoss = q.has('boss');
  const floorParam = Number(q.get('floor'));
  const jumpTo = wantsBoss ? MODULES.length - 1
    : Number.isFinite(floorParam) && floorParam >= 1 ? Math.min(floorParam, MODULES.length) - 1
    : -1;

  if (jumpTo >= 0){
    assistedRun = true;
    story.finish?.();
    revealGame();
    state.run.floors = jumpTo;
    startModule(jumpTo);
    /* Snap the camera onto the player straight away.

       Boot snaps the camera before this block runs, so jumping floors moves the
       player and leaves the camera on floor 1's coordinates. The per-frame
       follow would normally drag it over, but on the boss floor the wildcard
       panel pauses the game about a second in — long before the lerp arrives —
       leaving the camera staring at empty space beside the level. */
    engine.follow(player.pos, player.vel, 1);

    if (wantsBoss){
      /* Nothing here may reach localStorage. The armory persists on every earn
         and equip, so a shortcut that used the normal calls would permanently
         plant a maxed gun and 4000 coins in the player's real save. Disable the
         write for this session and set the fields in memory instead. */
      armory.save = () => {};
      const best = GUNS[GUNS.length - 1];
      armory.levels[best.id] = 5;
      armory.selected = best.id;
      armory.coins = POWER_TEST ? 100000 : 4000;
      armory.updateWallet();
      weapon.equip(best, 5);
      player.equipGun(best.id, best.color);

      /* Empty the floor and let the normal clear path wake the boss. Calling
         startBoss() directly would skip the bookkeeping the real trigger does,
         and then the thing being played would not be the thing that ships. */
      /* Keep startModule's entrance phase. It clears state.flash from 1 to 0
         before combat can open the wildcard picker. Jumping straight to fight
         leaves the opaque transition overlay covering the boss indefinitely. */
      // Use the normal arena encounter, including its zombie reinforcements.
      hud.toast('DEV · TOP FLOOR', 2000);
    }
  }
}

let t = 0;
let frames = 0;                     // read by the boot watchdog in index.html

/* Extracted from the animation loop so the whole frame can be stepped by hand —
   the only way to test the game when the host throttles requestAnimationFrame. */
function tick(raw, render = true){
  frames++;
  if (story.active){
    if (render) engine.render(t, 0);
    return;
  }
  if (floorUpgrades.paused){
    if (render) engine.render(t, 0);
    return;
  }
  if (armory.paused){
    shopTime += raw;
    const k = 1 - Math.pow(1-Math.min(1,shopTime/.65),3);
    engine.camera.position.lerpVectors(shopCamera.position,shopCamera.target,k);
    engine.camera.lookAt(shopAim);
    if (render) engine.render(t + shopTime,0);
    return;
  }
  t += raw;

  let dt = raw;
  if (state.hitStop > 0){ state.hitStop -= raw; dt = raw * 0.08; }

  const dir = input.read();
  if (input.used) hud.hideHint();

  if (state.phase === 'fight'){
    storeTutorial.update(t);
    armory.update(raw, room, state.phase);
    if (armory.paused) return;
    state.run.t += raw;
    fight(dt);
    player.update(dt, dir, room.bounds, room.colliders);
  } else {
    // a speedrun clock that stops between rooms can be gamed by dawdling there
    if (state.phase === 'exit' || state.phase === 'enter') state.run.t += raw;
    transition(raw, dir);
    hud.setThreats([], player.pos);   // don't leave arrows frozen mid-transition
  }

  fx.update(dt);
  const m = MODULES[state.module];
  audio.setIntensity(state.phase === 'fight' ? enemies.alive / Math.max(m.maxAlive, 1) : 0);
  audio.update();
  hud.setFlash(state.flash);
  hud.perf(raw, engine);
  engine.follow(player.pos, player.vel, raw);
  hud.track(player.pos);
  hud.trackEnemies(enemies.list);
  if (render) engine.render(t, raw);
}

addEventListener('keydown', e => {
  if (e.code === 'KeyB' && !e.repeat){ armory.paused ? armory.close() : armory.hintStore(); }
  if (e.code === 'KeyM') hud.setMuted(!audio.toggle());
  if (e.code === 'KeyP') hud.togglePerf();
  if (e.code === 'BracketRight') engine.setQuality(Math.min(3, engine.quality + 1));
  if (e.code === 'BracketLeft')  engine.setQuality(Math.max(0, engine.quality - 1));
});

engine.renderer.setAnimationLoop(() => tick(Math.min(engine.clock.getDelta(), 1 / 30)));
requestAnimationFrame(() => requestAnimationFrame(() => {
  if (!story.active) revealGame();
}));

window.VERDANT = {
  engine, input, player, enemies, weapon, loot, gems, vault, fx, guide, boss, hud, state, tick, audio, armory, story, storeTutorial, floorUpgrades,
  MODULES, startModule, restartRun, THREE,
  get frames(){ return frames; },
  get room(){ return room; }
};
