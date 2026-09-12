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
import { platform, storage } from './core/platform.js';
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
import { buildArena } from './game/arena.js';
import { Endless }       from './game/endless.js';
import { buildEclipse, ECLIPSE_KEY } from './game/eclipse.js';
import { Zones }         from './ui/zones.js';
import { Grenades, NadeStock, blastCenter, BLAST_R, THROW_RANGE, GRENADE_PRICE } from './game/grenade.js';

// Opt-in local playtest loadout. Normal progression is the default.
const POWER_TEST = ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
  && new URLSearchParams(location.search).has('power')
  && !new URLSearchParams(location.search).has('normal');
let assistedRun = POWER_TEST;
const isTypingTarget = e => e.target?.matches?.('input,textarea,select,[contenteditable="true"]');

/* --------------------------------------------------------- mercy system --
   If a player dies 3 times on the same floor they get a small free buff.
   6 deaths gives a second one. Buffs are deliberately milder than a normal
   upgrade card (~60-80% of a card's value) — enough to tip the balance
   without trivialising the floor. A mercy-assisted run is flagged so it
   cannot post to the leaderboard. */
const MERCY_BUFFS = [
  { id: 'mercy-dmg',   name: 'SUIT RECALIBRATED · +8% DAMAGE', icon: 'power',
    card: 'RECALIBRATE', amount: '+8% DAMAGE', description: 'Every shot hits a little harder.',
    apply: () => weapon.applyRunMods({ damage: 1.08 }) },
  { id: 'mercy-rate',  name: 'SUIT RECALIBRATED · +8% FIRE RATE', icon: 'overclock',
    card: 'HAIR TRIGGER', amount: '+8% FIRE RATE', description: 'Your gun cycles a little faster.',
    apply: () => weapon.applyRunMods({ fireRate: 1.08 }) },
  { id: 'mercy-shield', name: 'EMERGENCY PLATING · +1 SHIELD', icon: 'shield',
    card: 'EMERGENCY PLATING', amount: '+1 SHIELD', description: 'One hit, soaked completely.',
    apply: () => { player.shield += 1; hud.setShield(player.shield); return null; } },
  { id: 'mercy-range', name: 'SUIT RECALIBRATED · +50% PICKUP RANGE', icon: 'harvest',
    card: 'LONG REACH', amount: '+50% PICKUP RANGE', description: 'Coins come to you from farther.',
    apply: () => { loot.magnetMul *= 1.5; return 'range'; } },
  { id: 'mercy-speed', name: 'SUIT RECALIBRATED · +8% SPEED', icon: 'adrenaline',
    card: 'LIGHT FEET', amount: '+8% MOVE SPEED', description: 'Easier to slip out of a surround.',
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

/* Mercy used to roll one buff at random and announce it with a toast. Now it
   deals three you haven't taken on this floor and lets you pick — being given
   a choice after a rough patch reads as help, where a random roll read as
   noise. The card panel pauses the game while it is open. */
function applyMercy(){
  const used = new Set(mercyActive.map(m => m.buff.id));
  const pool = MERCY_BUFFS.filter(b => !used.has(b.id));
  if (!pool.length) return;
  const hand = [];
  while (hand.length < 3 && pool.length) hand.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  floorUpgrades.openMercy(
    hand.map(b => ({ id: b.id, icon: b.icon, name: b.card, amount: b.amount, description: b.description })),
    (card) => {
      const buff = MERCY_BUFFS.find(b => b.id === card.id);
      if (!buff) return;
      const revertData = buff.apply();
      mercyActive.push({ buff, revertData });
      assistedRun = true;
      hud.toast(buff.name, 2400);
      updateMercyHud();
    });
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

/* Tell the portal we are loading before anything heavy starts, so its measure
   of our load time is the real one. Harmless with no portal. */
platform.init();
platform.loadingStart();
// a portal mute (an ad, or the site's own mute) beats our ♪ button
platform.onSettings(s => audio.setPlatformMute(!!s.muteAudio));

const engine  = new Engine(document.getElementById('c'));
const input   = new Input(engine.canvas, document.getElementById('stick'));
const hud     = new Hud(engine);
let bootStarted = false;
const revealGame = () => {
  if (bootStarted) return;
  bootStarted = true;
  hud.ready();
  platform.loadingStop();
};
const story = new Story(({ firstRun }) => {
  if (firstRun) revealGame();
});
/* Straight into floor 1; the story is one tap away on the STORY button, and a
   first-time player gets told so once, after the opening beat. */
if (story.firstTime) setTimeout(() => hud.toast('TAP STORY (TOP LEFT) FOR THE BACKSTORY', 4200), 2600);

const lights  = buildLighting(engine.scene);
engine.key    = lights.key;
engine.onQualityChange = (q, fps) => console.info(`[verdant] ${fps}fps — quality → ${q}`);

const fx      = new Fx(engine.scene);
const guide   = new ExitGuide(engine.scene);
const grenades = new Grenades(engine.scene);
const nades = new NadeStock();
const aim = { on: false, pointer: null, t: 0, mouse: false };   // armed, and where you last pointed
let mouse = null;                                     // last mouse position, desktop only
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
armory.onBuy = () => { learned('upgrade'); setTimeout(nextLesson, 60); };
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
  /* Grenades belong to the floor: a new floor empties the pouch, a retry of
     the same floor keeps what you bought, and both reset the two throws. The
     pit is one long 'floor' whose throws reset every wave (onWaveClear). */
  // grenades you paid for stay with you between floors; only a new run clears them
  if (newFloor){ grenades.clear(); cancelAim(); }
  updateNadeHud();
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
  setTimeout(nextLesson, 60);            // after the dialog has laid out
  shopCamera.position.copy(engine.camera.position); shopCamera.rotation.copy(engine.camera.quaternion);
  shopCamera.target.set(station.x + 2.4, 3.5, station.z + 7.2);
  shopAim.set(station.x, -.25, station.z - .45); shopTime = 0;
  player.body.visible = true;
  if (room.store.label) room.store.label.visible = false;
  player.facing = .2; player.body.rotation.y = .2;
  document.getElementById('hud').classList.add('shopping');
  document.getElementById('store-progress').hidden = true;
};
armory.onClose = () => {
  hud.clearPoint();
  setTimeout(nextLesson, 260);           // back in the fight: teach the throw
  if (room.store.label) room.store.label.visible = true;
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
  phase: 'fight',        // fight | exit | enter | dead | escaped | over (endless)
  mode: 'tower',         // tower | endless
  arenaId: 'endless',    // endless combat is shared by Heartwood and Eclipse
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
  /* Loading a tower floor IS being in the tower. Undo the pit here, once, so
     every way back — the zone panel, the overrun screen, a fresh run — lands
     with the tower's lighting, HUD and 30-second upgrades restored. */
  if (state.mode !== 'tower'){
    state.mode = 'tower';
    lights.mood('tower');
    hud.setEndlessMode(false);
    hud.hideEndlessOver();
    floorUpgrades.permanent = false;
  }
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
  /* A brand-new run starts unassisted. This flag used to be set by mercy (and
     now by visiting the pit) and never cleared, so one mercy buff quietly
     disqualified every later run in the same session from the leaderboard. */
  assistedRun = POWER_TEST;
  towerResume = null;
  floorUpgrades.permanent = false;
  floorUpgrades.reset();
  armory.resetRun();
  nades.reset();
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

/* ------------------------------------------------------------ grenades --
   Bought at the Armory: as many as you can afford, two in the pouch at a time
   (see NadeStock). Press the button (or G) to take one out, then press where
   it should land. While it is out, time runs at 30% for a couple of seconds,
   so aiming in the middle of a surround is possible on a phone. */
function updateNadeHud(){
  const btn = document.getElementById('nade-btn');
  if (!btn) return;
  btn.hidden = !nades.everBought;          // stays visible (greyed) once you own one
  document.getElementById('nade-count').textContent = nades.stock;
  btn.classList.toggle('empty', !nades.canThrow);
  btn.classList.toggle('aiming', aim.on);
}

const aimRay = new THREE.Raycaster(), aimNdc = new THREE.Vector2();
const aimGround = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), aimHit = new THREE.Vector3();
addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY };
}, { passive: true });

function canThrowNow(){
  return nades.canThrow && state.phase === 'fight' && !state.upgradeIn &&
    !armory.paused && !floorUpgrades.paused && !zones.paused && !story.active;
}
function groundAt(sx, sy){
  aimNdc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1);
  aimRay.setFromCamera(aimNdc, engine.camera);
  return aimRay.ray.intersectPlane(aimGround, aimHit) ? { x: aimHit.x, z: aimHit.z } : null;
}
/** Within throwing reach of the player, and inside the room. What the ring
    shows is exactly where it will land. */
function clampThrow(p){
  const to = { x: p.x, z: p.z };
  const dx = to.x - player.pos.x, dz = to.z - player.pos.z, d = Math.hypot(dx, dz);
  if (d > THROW_RANGE){ to.x = player.pos.x + dx / d * THROW_RANGE; to.z = player.pos.z + dz / d * THROW_RANGE; }
  const b = room.bounds;
  to.x = Math.max(-b.x + 0.5, Math.min(b.x - 0.5, to.x));
  to.z = Math.max(-b.z + 0.5, Math.min(b.z - 0.5, to.z));
  if (b.r){ const r = Math.hypot(to.x, to.z); if (r > b.r - 0.5){ to.x *= (b.r - 0.5) / r; to.z *= (b.r - 0.5) / r; } }
  return to;
}
/** The quick option: the thickest crowd in reach, or a few metres ahead. */
function autoTarget(){
  const targets = enemies.list.slice();
  if (state.bossFight && boss.alive) targets.push(boss);
  return blastCenter(targets, player.pos, THROW_RANGE) ||
    { x: player.pos.x + Math.sin(player.facing) * 6, z: player.pos.z + Math.cos(player.facing) * 6 };
}
function aimPoint(){
  // the ring follows the mouse on a desktop; on a touch screen it sits on the
  // thickest crowd until a finger says otherwise
  const p = aim.pointer ? groundAt(aim.pointer.x, aim.pointer.y)
    : mouse ? groundAt(mouse.x, mouse.y) : null;
  return clampThrow(p || autoTarget());
}
/** Take the grenade out. One press arms it; the next press on the floor throws. */
function startAim(){
  if (aim.on || !canThrowNow()) return false;
  learned('throw');
  Object.assign(aim, { on: true, pointer: null, t: 0 });
  audio.tap?.();
  updateNadeHud();
  return true;
}
/** Arm it, or put it away if it is already out. */
function toggleAim(){ if (aim.on){ cancelAim(); return true; } return startAim(); }
function cancelAim(){
  if (!aim.on) return;
  aim.on = false; aim.pointer = null;
  grenades.hideAim();
  updateNadeHud();
}
function releaseAim(to = aimPoint()){
  learned('aim');
  cancelAim();
  if (!canThrowNow() || !nades.use()) return false;
  if (!grenades.throw(player.pos, to)){ nades.stock++; return false; }   // a throw that never left
  audio.toss();
  updateNadeHud();
  return true;
}
/** Per frame while aiming: keep the ring on the target, drop it if the fight stops. */
function updateAim(){
  if (!aim.on) return;
  if (!canThrowNow()){ cancelAim(); return; }
  grenades.showAim(player.pos, aimPoint(), t);
}
/** Time runs slow while aiming, for a few seconds — then normal again, so
    aiming can't be used to pause the fight. */
function aimSlow(raw){
  if (!aim.on) return 1;
  aim.t += raw;
  return aim.t < 2.5 ? 0.3 : Math.min(1, 0.3 + (aim.t - 2.5) * 0.7);
}
// the old name, kept for the test harness: throw straight at the crowd
function throwGrenade(){ return canThrowNow() ? releaseAim(clampThrow(autoTarget())) : false; }

/* Arming and throwing, identical on a phone and a desktop: press the grenade
   button once to take it out, then press where it should land. Pressing the
   button again puts it away. A held drag was the old way and it was worse — on
   a phone your finger covered the target, and nobody expects to hold a key to
   aim a thrown weapon. */
{
  const btn = document.getElementById('nade-btn');
  btn?.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    audio.init();
    toggleAim();
  });
  btn?.addEventListener('click', e => e.stopPropagation());

  // the press that picks the spot must not also grab the movement stick, so it
  // is caught on the way down, before the canvas sees it
  addEventListener('pointerdown', e => {
    if (!aim.on || e.target !== engine.renderer.domElement) return;
    e.stopImmediatePropagation(); e.preventDefault();
    aim.pointer = { x: e.clientX, y: e.clientY };
    releaseAim();
  }, true);
  addEventListener('contextmenu', e => { if (aim.on){ e.preventDefault(); cancelAim(); } });
}

/* Scaled to the floor (or wave) so it stays a panic button all the way up:
   it clears a crowd of ordinary growth outright and badly hurts an elite. */
function explodeGrenade(at){
  const E = state.mode === 'endless';
  const scale = E ? (endless.spec ? endless.spec.hpScale : 1) : floorHpScale(state.module, Math.max(0, state.activeRoom));
  const dmg = 12 * scale;
  for (const e of enemies.list){
    if (!e.alive) continue;
    const dx = e.pos.x - at.x, dz = e.pos.z - at.z, d = Math.hypot(dx, dz);
    if (d > BLAST_R + e.def.radius) continue;
    const fall = d < BLAST_R * 0.6 ? 1 : 0.55;           // full in the middle, half at the edge
    const nx = dx / (d || 1), nz = dz / (d || 1);
    enemies.hit(e, dmg * fall, nx, nz, fx);
    if (e.alive && !e.def.rooted){ e.vel.x += nx * 9; e.vel.z += nz * 9; }
  }
  if (state.bossFight && boss.alive && Math.hypot(boss.pos.x - at.x, boss.pos.z - at.z) < BLAST_R + boss.def.radius)
    boss.takeHit(E ? 45 * (1 + Math.max(0, endless.wave / 10 - 1) * 0.5) : 45, fx);
  fx.ring({ x: at.x, y: 0.1, z: at.z }, { color: 0xffb066, from: 0.4, to: BLAST_R * 2.1, life: 0.45 });
  fx.ring({ x: at.x, y: 0.1, z: at.z }, { color: 0xffffff, from: 0.2, to: BLAST_R * 1.2, life: 0.22 });
  fx.burst({ x: at.x, y: 0.5, z: at.z }, { count: 34, color: 0xff8c42, speed: 11, size: 0.2, life: 0.7, up: 7, grav: 9 });
  fx.burst({ x: at.x, y: 0.5, z: at.z }, { count: 16, color: 0xfff1c2, speed: 6, size: 0.26, life: 0.4, up: 4 });
  engine.addShake(0.36);
  state.hitStop = Math.max(state.hitStop, 0.06);
  audio.boom();
  if (E) room.pulse?.();                                   // the pit's floor ripples with it
}

armory.nades = nades;
/* ---------------------------------------------------------------- tutor --
   A first run teaches four things, each one exactly when the player can act on
   it, each with a hand on the thing to press:

     upgrade  → in the shop, on the laser's upgrade button
     buy      → in the shop, on the grenade, once they can afford one
     throw    → in the fight, on the grenade button
     aim      → still in the fight, on an actual enemy

   Every step remembers itself, so none of it ever appears twice, and a step
   whose moment has not arrived simply waits: the grenade lesson does not fire
   while the player is broke, because a hand pointing at a button they cannot
   press teaches the wrong thing. */
const TAUGHT_KEY = 'verdant.taught.v2';
const taught = (() => {
  try { return new Set(JSON.parse(storage.getItem(TAUGHT_KEY) || '[]')); } catch { return new Set(); }
})();
let teaching = null, lessonCd = 0;
function learned(step){
  if (!taught.has(step)){
    taught.add(step);
    try { storage.setItem(TAUGHT_KEY, JSON.stringify([...taught])); } catch {}
  }
  if (teaching === step){ teaching = null; hud.clearPoint(); }
}
function teach(step, target, text, opts){
  if (taught.has(step) || teaching === step) return false;
  if (!hud.pointAt(target, text, opts)) return false;
  teaching = step;
  return true;
}
/** Pick the next lesson that fits the moment. Called when the state changes. */
function nextLesson(){
  if (state.mode !== 'tower' || state.module !== 0) return;      // floor 1 only
  if (armory.paused){
    if (!taught.has('upgrade') && armory.levels.laser === 1 && armory.coins >= armory.cost('laser'))
      return teach('upgrade', 'button[data-gun="laser"][data-action="upgrade"]', 'TAP TO UPGRADE YOUR LASER');
    if (taught.has('upgrade') && !taught.has('buy') && armory.coins >= GRENADE_PRICE && nades.canBuy)
      return teach('buy', 'button[data-grenade]', 'BUY A GRENADE');
    return;
  }
  if (aim.on && !taught.has('aim')) return;                       // handled per frame below
  if (!taught.has('throw') && nades.stock > 0)
    return teach('throw', '#nade-btn', 'PRESS HERE — OR PRESS G', { side: 'left' });
}
/* While the grenade is out, the hand follows the nearest growth: "that is what
   you press". It is the only lesson that points into the world rather than at
   the HUD. */
function teachAim(){
  if (taught.has('aim') || !aim.on) return;
  const foe = enemies.list.find(e => e.alive) || (state.bossFight && boss.alive ? boss : null);
  if (!foe) return;
  teach('aim', () => {
    const v = new THREE.Vector3(foe.pos.x, 0.8, foe.pos.z);
    const out = new THREE.Vector2();
    engine.camera.updateMatrixWorld();
    engine.project(v, out);
    return { x: out.x, y: out.y };
  }, 'NOW PRESS AN ENEMY');
}

armory.nades = nades;
armory.onGrenade = () => { updateNadeHud(); learned('buy'); nextLesson(); };

/* ------------------------------------------------------ the endless pit --
   A second zone next to the tower: one round arena, waves until you fall.
   It borrows the whole combat loop (fight() branches on state.mode where the
   two differ) and swaps the room for buildArena(), the floor budget for the
   Endless wave director, and the floor header for a wave readout. */
const arenaDirectors = {
  endless: new Endless(storage),
  eclipse: new Endless(storage, ECLIPSE_KEY),
};
let endless = arenaDirectors.endless;
const arenaName = () => state.arenaId === 'eclipse' ? 'ECLIPSE FOUNDRY' : 'HEARTWOOD PIT';
let towerResume = null;          // where the tower run was when you left for the pit

const zones = new Zones({ onPick: zone => zone === 'tower' ? leaveEndless() : enterEndless(zone) });
document.getElementById('zones-open').addEventListener('click', e => { e.stopPropagation(); openZones(); });

function openZones(){
  if (zones.paused || floorUpgrades.paused || armory.paused || story.active) return;
  if (state.phase !== 'fight' && state.phase !== 'enter') return;   // not mid-death, exit or results
  const towerFloor = (state.mode === 'tower' ? state.module : (towerResume ? towerResume.module : 0)) + 1;
  zones.open({ mode: state.mode === 'tower' ? 'tower' : state.arenaId, towerFloor,
    best: arenaDirectors.endless.best, eclipseBest: arenaDirectors.eclipse.best });
}

function enterEndless(arenaId = 'endless'){
  if (arenaId !== 'endless' && arenaId !== 'eclipse') return;
  if (state.mode === 'tower') towerResume = { module: state.module, run: { ...state.run }, biomass: state.biomass };
  state.arenaId = arenaId;
  endless = arenaDirectors[arenaId];
  state.mode = 'endless';
  restartEndless();
}

function restartEndless(){
  state.mode = 'endless';
  floorUpgrades.reset();
  floorUpgrades.permanent = true;          // upgrades stack for the whole pit run
  armory.resetRun();
  guide.disarm();
  hud.setBoon(null);
  state.floorDeaths = 0;
  revertMercy();
  loot.perkMul = 1;
  state.run = { kills: 0, coins: 0, floors: 0, t: 0, gems: 0, revives: vault.revives };
  state.overShown = false; state.newBest = false;
  endless.reset();
  loadArena();
  player.group.position.y = 0; player.group.scale.setScalar(1.28); player.group.rotation.y = 0;
  player.hp = 1; player.invuln = 1.0; player.hitFlash = 0; player.body.visible = true;
  hud.setHp(1); hud.setDead(false); hud.hideEndlessOver(); hud.hideResults();
  state.phase = 'enter'; state.phaseT = 0; state.flash = 1; state.hitStop = 0;
  armory.updateWallet();
  engine.follow(player.pos, player.vel, 1);
}

function loadArena(){
  floorUpgrades.clearWildcards();
  boss.onDeath = null; boss.despawn();
  enemies.external.length = 0;
  state.bossFight = false; state.holdDone = false; state.hold = 0;
  hud.setBoss(null);
  room?.dispose();
  armory.dwell = 0; armory.storeLatched = false;
  room = state.arenaId === 'eclipse' ? buildEclipse(engine.scene) : buildArena(engine.scene);
  lights.mood(state.arenaId === 'eclipse' ? 'eclipse' : 'heartwood');
  lights.fit(room.R * 2, room.R * 2);
  // an open pit wants the widest framing the camera allows
  engine.fitRoom(40, 28, room.R * 2, room.R * 2);
  engine.arenaView = state.arenaId === 'eclipse';
  enemies.clear(); weapon.clear(); loot.clear(); gems.clear();
  state.zones = room.zones; state.activeRoom = 0;
  state.budget = 0; state.remaining = 0; state.spawned = 0; state.spawnCd = 0;
  state.cleared = false; state.upgradeIn = null;
  player.pos.copy(room.entryPos);
  player.vel.set(0, 0, 0);
  player.facing = Math.PI;                 // facing into the pit
  player.aim = null;
  storeTutorial.attach(room, -1);          // clears any floor-1 route; the pit has none
  engine.camTarget.set(0, 0, Math.max(-engine.clampZ, Math.min(engine.clampZ, player.pos.z)));
  applyPerks(true);
  hud.setShield(player.shield);
  guide.setFloor(room);
  hud.setEndlessMode(true, state.arenaId);
  updateEndlessHud();
}

function leaveEndless(){
  hud.hideEndlessOver();
  floorUpgrades.permanent = false;
  floorUpgrades.reset();
  const resume = towerResume;
  towerResume = null;
  if (!resume){ restartRun(); return; }
  loot.perkMul = 1;
  startModule(resume.module);              // loadModule flips lighting and HUD back
  state.run = { ...resume.run, revives: vault.revives };
  state.biomass = resume.biomass || 0;
  // a tower run broken up by a trip to the pit is not a ranked run
  assistedRun = true;
  hud.toast(`BACK IN THE TOWER · FLOOR ${resume.module + 1}`, 2200);
  engine.follow(player.pos, player.vel, 1);
}

function updateEndlessHud(){
  const breather = endless.phase === 'breather';
  const total = endless.spec ? endless.spec.count : 0;
  const left = endless.toSpawn + enemies.alive + (state.bossFight && boss.alive ? 1 : 0);
  hud.setEndless({ wave: endless.wave, left, total, best: Math.max(endless.best, endless.wave),
    breather, timer: endless.timer, name: arenaName() });
}

function onWaveStart(){
  const s = endless.spec;
  room.pulse();
  room.setDanger(Math.min(1, (s.n - 1) / 20));
  room.ventsOn = s.n >= 3;                 // the vents wake once you have your feet
  hud.waveBanner(s, state.arenaId);
  if (state.arenaId === 'eclipse' && s.n === 3) hud.toast('AMBER LANES DISCHARGE · LURE GROWTH INTO THEM', 4000);
  audio.door?.();
  engine.addShake(s.boss ? 0.45 : 0.2);
  if (!s.boss) return;
  // Heartroot rises from the dais, and the heart seed goes dark while it lives
  boss.spawn(0, 0, s.bossHp, room.rect);
  enemies.external.push(boss);
  state.bossFight = true;
  room.setSeed(false);
  boss.onDeath = () => {
    const i = enemies.external.indexOf(boss);
    if (i >= 0) enemies.external.splice(i, 1);
    state.bossFight = false;
    hud.setBoss(null);
    room.setSeed(true);
    room.pulse();
    state.run.gems += 3; vault.earn(3); hud.setCounts({ salvage: state.run.gems });
    hud.toast('HEARTROOT FALLS · +3 GEMS', 2400);
    audio.clear();
  };
}

function onWaveClear(){
  const n = endless.cleared;
  // a little back between waves keeps a run going; the scaling still wins
  player.heal(0.15); hud.setHp(player.hp);
  const bonus = 10 + n * 6;
  state.run.coins += bonus; armory.earn(bonus); hud.collectCoins(bonus);
  hud.toast(`WAVE ${n} CLEARED · +${bonus} COINS`, 2200);
  audio.clear();
  room.pulse();
  room.ventsOn = false;
  room.resetVents();
  updateNadeHud();
  if (endless.upgradeDue) state.upgradeIn = { t: 1.1, unlock: () => {} };
}

/* The growth crawls out of where the roots stab into the pit — never in your
   lap, never inside a crystal. Rooted spawners open up in the middle ring. */
function arenaSpawnPoint(rooted){
  const td = room.touchdowns;
  for (let tries = 0; tries < 40; tries++){
    let x, z;
    if (rooted){
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 10;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } else {
      const t = td[Math.floor(Math.random() * td.length)];
      const len = Math.hypot(t.x, t.z), inward = 1.5 + Math.random() * 1.8;
      x = t.x - (t.x / len) * inward + (Math.random() - 0.5) * 1.8;
      z = t.z - (t.z / len) * inward + (Math.random() - 0.5) * 1.8;
    }
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < (rooted ? 7 : 8)) continue;
    if (Math.hypot(x, z) > room.bounds.r - 0.6) continue;
    if (room.colliders.some(c => Math.abs(x - c.x) < c.hw + 0.9 && Math.abs(z - c.z) < c.hd + 0.9)) continue;
    return [x, z];
  }
  return null;
}

function scaleEndless(e){
  if (!e || !endless.spec) return e;
  const hs = endless.spec.hpScale;
  e.maxHp = Math.max(1, Math.ceil(e.def.hp * (e.def.rooted ? Math.sqrt(hs) : hs)));
  e.hp = e.maxHp;
  return e;
}

function endlessSpawn(n){
  const s = endless.spec;
  let made = 0;
  for (let i = 0; i < n; i++){
    let key = pickType(s.mix);
    const pt = arenaSpawnPoint(!!TYPES[key].rooted);
    if (!pt) continue;
    let e = enemies.spawn(pt[0], pt[1], key);
    // a type's pool can run dry at high waves — fall back rather than stall
    if (!e && key !== 'creeper'){ key = 'creeper'; e = enemies.spawn(pt[0], pt[1], key); }
    if (!e) continue;
    scaleEndless(e);
    made++;
    const def = TYPES[key];
    audio.spawn();
    fx.ring({ x: pt[0], y: 0, z: pt[1] }, { color: def.color, from: 0.2, to: 1.8 + def.radius, life: 0.45 });
    fx.burst({ x: pt[0], y: 0.4, z: pt[1] }, { count: 8, color: 0xff5db1, speed: 4, size: 0.12, life: 0.5, up: 3 });
  }
  endless.spawned(made);
}

function endlessDeath(){
  state.phase = 'over'; state.phaseT = 0;
  state.newBest = endless.saveBest(endless.wave);
  room.ventsOn = false;
  audio.dead();
  audio.duck(0.35, 1.6);
  hud.setDead(true);
  engine.addShake(0.45);
  fx.burst(player.pos, { count: 22, color: 0xff8c42, speed: 7, size: 0.15, life: 0.7, up: 3 });
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
/* Enemy health stops growing after floor 10. Everything above it gets harder
   through numbers, mix and room pressure instead — the +0.03 a floor it used to
   add was small enough to be invisible as a difficulty knob but large enough to
   push time-to-kill past what the guns keep up with, since gun DPS is not
   monotonic (see the note above). Room depth still scales: the last room of a
   floor is the hard one, by design. */
const COIN_PER_UNIT = 7;

export function floorHpScale(floor, roomIndex = 0){
  return 1 + Math.min(floor, 9) * 0.18 + roomIndex * 0.08;
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
  const E = state.mode === 'endless';
  if (!E && m.bossArena && !state.bossFight && !state.holdDone){
    startBoss();
    return;
  }

  // -1 means "in a corridor": a room is only opened by actually walking into it
  const currentRoom = E ? 0 : room.roomAt(player.pos.x, player.pos.z);
  if (E){
    // the pit: the wave director decides, main.js does the spawning and effects
    const ev = endless.update(dt, enemies.alive, state.bossFight && boss.alive);
    if (ev.start) onWaveStart();
    if (ev.spawn) endlessSpawn(ev.spawn);
    if (ev.clear) onWaveClear();
    hud.setThreats(enemies.list.filter(e => e.alive), player.pos);
  } else {
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
  }   // end tower-only floor/zone spawning

  const kills = weapon.update(dt, player, enemies, fx, engine, room.bounds, room.colliders);
  if (kills) state.hitStop = 0.05;
  for (const blast of grenades.update(dt)) explodeGrenade(blast);

  // Enemies elsewhere on the floor head for the doorway that leads toward the
  // player, instead of grinding into whatever wall is between them.
  for (const e of enemies.list){
    const here = room.roomAt(e.pos.x, e.pos.z);
    if (here === currentRoom){ e.route = null; continue; }
    const d = room.routeDoor(here, currentRoom);
    // once we're basically at the waypoint, drop it and home in directly
    e.route = (d && Math.hypot(e.pos.x - d.x, e.pos.z - d.z) > 1.0) ? d : null;
  }
  const rawDmg = enemies.update(dt, player, fx, room.colliders, room.bounds, engine,
    (E ? (endless.spec ? endless.spec.maxAlive : 20) : m.maxAlive) + 6);
  // Children created by Bloomers and Seeders inherit the same room/floor tier
  // as normal wave spawns.
  for (const child of enemies.births){
    if (E){ scaleEndless(child); continue; }
    const childRoom = room.roomAt(child.pos.x, child.pos.z);
    scaleEnemy(child, childRoom >= 0 ? childRoom : Math.max(0, currentRoom));
  }
  // Damage events may come from several enemies at once. Use the strongest
  // currently touching floor tier rather than multiplying the whole swarm twice.
  let dmg = rawDmg * (E ? (endless.spec ? endless.spec.dmgScale : 1) : floorDamageScale(state.module, Math.max(0, currentRoom)));
  // the pit's spore vents: they hit you and the growth alike, on a telegraph
  if (E) dmg = Math.max(dmg, room.updateVents(dt, { player, enemies, fx, engine, audio, wave: endless.wave }));

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
  if (E) updateEndlessHud();
  else {
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
  }   // end tower-only floor counter

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
      audio.hurt(player.hp);          // the voice tightens as health drops
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
      } else if (player.hp <= 0 && E){
        endlessDeath();
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

  const sweep = state.cleared || (E && endless.phase === 'breather');
  const got = loot.update(dt, player, sweep, room.bounds);
  /* 7 a unit, not 5. At five, a perfect 20-floor run paid ~12.5k while owning
     the four guns alone costs 18.75k before a single upgrade, heal or grenade —
     the economy could not fund the power curve it was balanced against, which
     is most of why the middle floors bit. */
  if (got){ state.biomass += got; const coins = Math.round(got * COIN_PER_UNIT * loot.valueMul);
    state.run.coins += coins; armory.earn(coins); hud.collectCoins(coins);
    fx.burst({x:player.pos.x, y:0.65, z:player.pos.z}, {count:4, color:0xf5c518, speed:2, size:0.065, life:0.22, up:0.8}); }
  const gotGems = gems.update(dt, player, sweep, room.bounds);
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
        platform.happytime();            // 20 floors: the one moment that earns it
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
      if (state.mode === 'endless'){
        hud.toast(`${arenaName()} · SURVIVE`, 1900);
        return;
      }
      state.spawnCd = storeTutorial.active && state.module === 0 ? 999 : .7;
      hud.toast(storeTutorial.active && state.module === 0 ? 'FOLLOW THE CYAN PATH TO THE ARMORY' : `FLOOR ${state.module+1} · ${MODULES[state.module].name}`, 1900);
    }
    return;
  }

  // the pit: SIGNAL LOST for a beat, then the overrun screen
  if (state.phase === 'over'){
    if (state.phaseT > 1.5 && !state.overShown){
      state.overShown = true;
      hud.setDead(false);
      hud.showEndlessOver({
        wave: endless.wave, best: endless.best, newBest: state.newBest,
        kills: state.run.kills, seconds: state.run.t, coins: state.run.coins, gems: state.run.gems,
        assisted: POWER_TEST,
        arenaId: state.arenaId,
      }, () => restartEndless(), () => leaveEndless());
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
        () => { state.resultsShown = false; restartRun(); },
        // straight from the results into the wave arenas, which is where a
        // finished tower run naturally wants to go next
        () => { state.resultsShown = false; restartRun(); openZones(); }
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

/* Dev jumps and the playtest loadout are for a dev server only. An empty
   hostname means file:// — a downloaded build opened straight from disk — and
   used to count as dev, which handed every such player floor-skipping and the
   assist loadout. */
const DEV_HOST = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
if (DEV_HOST){
  const q = new URLSearchParams(location.search);

  /* ?maxed — every gun at level 5 and a full wallet, for judging whether a
     floor is hard because of the floor or because of the loadout. It writes to
     the save like a normal purchase would, so it sticks until you clear it
     (?maxed=0 puts you back to a starting laser). Kept behind DEV_HOST. */
  if (q.has('maxed')){
    const off = q.get('maxed') === '0';
    for (const g of GUNS) armory.levels[g.id] = off ? (g.id === 'laser' ? 1 : 0) : 5;
    armory.selected = off ? 'laser' : (q.get('gun') && GUNS.some(g => g.id === q.get('gun')) ? q.get('gun') : 'plasma');
    armory.coins = off ? 0 : 99999;
    armory.apply(); armory.save(); armory.render();
    hud.toast(off ? 'LOADOUT RESET · LASER LV 1' : 'ALL GUNS LV 5 · TEST LOADOUT', 2600);
  }
  const wantsBoss = q.has('boss');
  const floorParam = Number(q.get('floor'));
  const jumpTo = wantsBoss ? MODULES.length - 1
    : Number.isFinite(floorParam) && floorParam >= 1 ? Math.min(floorParam, MODULES.length) - 1
    : -1;

  // ?endless — straight into the Heartwood Pit
  if (q.has('endless') || q.has('eclipse')){
    story.finish?.();
    revealGame();
    enterEndless(q.has('eclipse') ? 'eclipse' : 'endless');
  }

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
  /* The portal must know when the fight is actually live — it is what keeps an
     ad from landing in the middle of one. Every early return below is a pause. */
  platform.setPlaying(state.phase === 'fight' && !story.active
    && !floorUpgrades.paused && !zones.paused && !armory.paused);
  if (story.active){
    if (render) engine.render(t, 0);
    return;
  }
  if (floorUpgrades.paused || zones.paused){
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
  dt *= aimSlow(raw);

  const dir = input.read();
  if (input.used) hud.hideHint();

  if (state.phase === 'fight'){
    storeTutorial.update(t);
    armory.update(raw, room, state.phase);
    if (armory.paused) return;
    state.run.t += raw;
    fight(dt);
    player.update(dt, dir, room.bounds, room.colliders);
    updateAim();
    if (aim.on) teachAim();
    /* Poll for the next lesson rather than relying on the exact order of dialog
       events: whichever way the player got here, if a lesson is due and nothing
       is on screen, it appears within half a second. */
    lessonCd -= raw;
    if (lessonCd <= 0){ lessonCd = 0.5; if (!teaching && !taught.has('aim')) nextLesson(); }
  } else {
    cancelAim();
    // a speedrun clock that stops between rooms can be gamed by dawdling there
    if (state.phase === 'exit' || state.phase === 'enter') state.run.t += raw;
    transition(raw, dir);
    hud.setThreats([], player.pos);   // don't leave arrows frozen mid-transition
  }

  fx.update(dt);
  if (state.mode === 'endless') room.animate(t, dt);   // floor ripples, veins, vents, spores
  const m = MODULES[state.module];
  const cap = state.mode === 'endless' ? (endless.spec ? endless.spec.maxAlive : 20) : m.maxAlive;
  audio.setIntensity(state.phase === 'fight' ? enemies.alive / Math.max(cap, 1) : 0);
  audio.update();
  hud.setFlash(state.flash);
  hud.perf(raw, engine);
  engine.follow(player.pos, player.vel, raw);
  hud.track(player.pos);
  hud.trackEnemies(enemies.list);
  if (render) engine.render(t, raw);
}

addEventListener('keydown', e => {
  if (!isTypingTarget(e) && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if (isTypingTarget(e)) return;
  if (e.code === 'KeyB' && !e.repeat){ armory.paused ? armory.close() : armory.hintStore(); }
  // Q swaps to the next gun you own, without a trip to the pad
  if (e.code === 'KeyQ' && !e.repeat && !armory.paused){
    const next = armory.cycleGun();
    if (next) hud.toast(`${next.name} · LV ${armory.levels[next.id]}`, 1400);
  }
  if (e.code === 'KeyM') hud.setMuted(!audio.toggle());
  if (e.code === 'KeyZ' && !e.repeat){ zones.paused ? zones.close() : openZones(); }
  // G takes the grenade out and puts it away; the click on the floor throws it
  if ((e.code === 'KeyG' || e.code === 'Space') && !e.repeat){
    if (toggleAim()) e.preventDefault();
  }
  // Escape is reserved by CrazyGames for leaving fullscreen. Cancel our local
  // aim too, but let the browser/platform keep its default action.
  if (e.code === 'Escape' && aim.on){ cancelAim(); }
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
  get endless(){ return endless; }, zones, enterEndless, leaveEndless, restartEndless, grenades, nades, platform, storage, throwGrenade, aim, startAim, releaseAim, cancelAim, aimPoint,
  get frames(){ return frames; },
  get room(){ return room; }
};
