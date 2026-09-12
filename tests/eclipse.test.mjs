import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FluxLanes, FLUX_CHARGE, FLUX_HALF_WIDTH, inFluxLane } from '../src/game/flux-lanes.js';
import { buildEclipse, ECLIPSE_KEY } from '../src/game/eclipse.js';
import { Endless } from '../src/game/endless.js';
import { leaderboard } from '../src/game/leaderboard.js';

// A complete warning must precede every discharge, with capped simultaneous
// lanes and generous clear lanes even at the late-wave difficulty ceiling.
for (const hz of [30, 60, 120]){
  const director = new FluxLanes(), dt = 1 / hz;
  const chargeAt = new Map();
  let fires = 0;
  for (let frame = 0; frame < hz * 75; frame++){
    const events = director.update(dt, true, 30);
    for (const lane of events.charge) chargeAt.set(lane, frame * dt);
    for (const lane of events.fire){
      assert.ok(frame * dt - chargeAt.get(lane) >= FLUX_CHARGE - 1e-9, 'full warning before every shot');
      fires++;
    }
    assert.ok(director.lanes.filter(lane => lane.phase !== 'idle').length <= 2);
    assert.ok(director.lanes.every(lane => !inFluxLane(lane, { x: 0, z: 0 }, 2.4)), 'boss dais stays clear');
  }
  assert.ok(fires > 10);
  director.update(dt, false, 30);
  assert.ok(director.lanes.every(lane => lane.phase === 'idle'), 'breather cancels pending discharges');
}

const lane = { axis: 'x', offset: -7 };
assert.ok(inFluxLane(lane, { x: -7, z: 19 }));
assert.ok(!inFluxLane(lane, { x: -7 + FLUX_HALF_WIDTH + 0.01, z: 0 }));
assert.ok(inFluxLane(lane, { x: -7 + FLUX_HALF_WIDTH + 0.1, z: 0 }, 0.3));

// Only the armory label needs a canvas. The actual scene and colliders are
// constructed here using real Three.js geometry, without a renderer.
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect(){}, strokeRect(){}, fillText(){} }) }) };
const scene = new THREE.Scene(), room = buildEclipse(scene);
assert.equal(room.group.name, 'eclipse-foundry');
assert.equal(room.touchdowns.length, 8);
const walkable = (x, z, radius = 0.45) => Math.hypot(x, z) < room.bounds.r - radius
  && !room.colliders.some(c => Math.abs(x - c.x) < c.hw + radius && Math.abs(z - c.z) < c.hd + radius);
assert.ok(walkable(room.entryPos.x, room.entryPos.z), 'safe spawn');
assert.ok(walkable(room.store.x, room.store.z), 'walkable armory pad');
assert.ok(walkable(0, 0, 2.4), 'boss fits the centre');

// Flood-fill the real collision map: the shop and all enemy docks must remain
// connected to the pilot, not just have individually valid coordinates.
const key = (x, z) => `${x},${z}`, reached = new Set([key(0, 10)]), queue = [[0, 10]];
for (let i = 0; i < queue.length; i++){
  const [x, z] = queue[i];
  for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]){
    const nx = x + dx, nz = z + dz, k = key(nx, nz);
    if (reached.has(k) || !walkable(nx, nz)) continue;
    reached.add(k); queue.push([nx, nz]);
  }
}
for (const p of [room.store, ...room.touchdowns]){
  assert.ok(queue.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < 0.8), 'all important locations reachable');
}

const enemy = { alive: true, pos: { x: -7, z: 0 }, def: { radius: 0.4 } };
let hits = 0;
const ctx = {
  player: { pos: { x: -7, z: 1 } }, enemies: { list: [enemy], hit(){ hits++; } },
  fx: { ring(){}, burst(){} }, engine: { addShake(){} }, audio: {}, wave: 3,
};
room.ventsOn = true;
assert.equal(room.updateVents(5, ctx), 0, 'no damage on charge start');
assert.equal(room.updateVents(1, ctx), 0, 'no damage during warning');
assert.equal(room.updateVents(0.8, ctx), 0.2, 'discharge damages the pilot');
assert.equal(hits, 1, 'discharge also damages growth');
assert.equal(room.updateVents(0.05, ctx), 0, 'one hit per burst, independent of frame rate');
assert.equal(hits, 1);
room.animate(7, 0.05);
room.resetVents();
assert.equal(room.updateVents(0.1, ctx), 0, 'reset cannot leave a hot lane');

// Entering a still-active beam must hurt, even if its initial flash was missed.
room.lanes.reset(); ctx.player.pos.x = 0;
room.updateVents(5, ctx); room.updateVents(1.8, ctx);
ctx.player.pos.x = -7;
assert.equal(room.updateVents(0.1, ctx), 0.2);
room.ventsOn = false;
assert.equal(room.updateVents(0.1, ctx), 0);

let drawables = 0;
const resources = new Set();
room.group.traverse(o => {
  if (o.isMesh || o.isPoints || o.isSprite) drawables++;
  // Sprite geometry is owned and shared by Three.js itself, not by this room.
  if (o.geometry && !o.isSprite){
    resources.add(o.geometry);
    for (const value of o.geometry.attributes.position.array) assert.ok(Number.isFinite(value), 'finite geometry');
  }
  if (o.material){ resources.add(o.material); if (o.material.map) resources.add(o.material.map); }
});
assert.ok(drawables < 55, `bounded scenery draw calls: ${drawables}`);
const disposed = new Set();
for (const r of resources) r.addEventListener('dispose', () => disposed.add(r));
room.dispose();
assert.equal(scene.children.length, 0, 'leaving removes all scenery');
assert.equal(disposed.size, resources.size, 'leaving releases all GPU resources');

const saved = new Map(), storage = { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) };
new Endless(storage).saveBest(7);
const eclipse = new Endless(storage, ECLIPSE_KEY);
assert.equal(eclipse.best, 0, 'Heartwood record does not leak into Eclipse');
eclipse.saveBest(12);
assert.equal(new Endless(storage, ECLIPSE_KEY).best, 12);
assert.equal(new Endless(storage).best, 7);
await leaderboard.eclipse.submit({ name: 'FORGE', wave: 9, kills: 160, seconds: 220 });
assert.equal((await leaderboard.eclipse.top())[0].wave, 9);
assert.deepEqual(await leaderboard.endless.top(), [], 'no Eclipse scores in Heartwood');
assert.deepEqual(await leaderboard.top(), [], 'no Eclipse scores in tower');
assert.equal(leaderboard.eclipse.shared, false, 'runs stay on the device — there is no server to reach');
console.log(`PASS: Eclipse hazards at 30/60/120 Hz, damage, safe routes, ${drawables} scenery objects, cleanup, separate records and scores`);
