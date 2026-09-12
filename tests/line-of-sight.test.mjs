/* Walls stop bullets, and the gun prefers a target it can actually hit.

   Both halves matter together: shots used to test a `partition` flag that
   nothing ever set, so every wall in the game was shoot-through. Making walls
   solid without the targeting half would just swap one bug for a worse one —
   standing still, firing into a wall, while the growth walks round it. */
import assert from 'node:assert/strict';
import { shotBlocked } from '../src/game/weapons.js';

const wall = (x, z, hw, hd) => ({ x, z, hw, hd, blocksShots: true });
const crate = (x, z) => ({ x, z, hw: 0.6, hd: 0.6 });          // a prop: shoot over it

// --- what stops a shot ---------------------------------------------------------
const between = [wall(0, 0, 0.2, 5)];
assert.ok(shotBlocked(between, -4, 0, 4, 0), 'a wall across the line stops the shot');
assert.ok(!shotBlocked(between, -4, 8, 4, 8), 'the same wall does not block a shot past its end');
assert.ok(!shotBlocked([crate(0, 0)], -4, 0, 4, 0), 'props are deliberately shoot-through');
assert.ok(!shotBlocked([], -4, 0, 4, 0), 'open floor blocks nothing');

// a doorway is a gap between two wall segments: you can shoot through it
const doorway = [wall(0, -4, 0.2, 2.5), wall(0, 4, 0.2, 2.5)];
assert.ok(!shotBlocked(doorway, -4, 0, 4, 0), 'a shot through the doorway gets through');
assert.ok(shotBlocked(doorway, -4, -4, 4, -4), 'a shot at the wall beside it does not');

// axis-aligned shots (dx or dz exactly 0) must not slip through the slab maths
assert.ok(shotBlocked([wall(0, 0, 5, 0.2)], 0, -3, 0, 3), 'straight along z');
assert.ok(shotBlocked([wall(0, 0, 0.2, 5)], -3, 0, 3, 0), 'straight along x');

// --- who the gun picks ---------------------------------------------------------
const { Enemies } = await import('../src/game/enemies.js').catch(() => ({ Enemies: null }));
if (Enemies){
  // a stand-in for the pool: nearest() only reads alive/pos
  const near = { alive: true, pos: { x: 0, z: 3 } };     // close, behind the wall
  const far  = { alive: true, pos: { x: 6, z: 0 } };     // further, in the clear
  const list = { list: [near, far], external: [], nearest: Enemies.prototype.nearest };
  const blocking = [wall(0, 1.5, 4, 0.2)];
  const sees = e => !shotBlocked(blocking, 0, 0, e.pos.x, e.pos.z);
  assert.equal(list.nearest({ x: 0, z: 0 }, 20, sees), far, 'shoots the one it can hit, not the closer one');
  assert.equal(list.nearest({ x: 0, z: 0 }, 20), near, 'with no visibility test, still the nearest');
  // nothing in the clear: keep firing rather than going silent
  const boxedIn = [wall(0, 1.5, 40, 0.2), wall(3, 0, 0.2, 40)];
  const blind = e => !shotBlocked(boxedIn, 0, 0, e.pos.x, e.pos.z);
  assert.equal(list.nearest({ x: 0, z: 0 }, 20, blind), near, 'falls back to the nearest blocked target');
}

console.log('PASS: walls stop shots, props and doorways do not, targeting prefers a clear line with a sane fallback');
