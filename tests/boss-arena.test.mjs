import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Boss } from '../src/game/boss.js';
import { FLOORS } from '../src/game/floors.js';
import { makePlan } from '../src/game/floorplan.js';

const floor = FLOORS.at(-1);
const plan = makePlan({ ...floor, names:floor.rooms });
assert.equal(floor.bossArena, true);
assert.equal(plan.rooms.length, 1);
assert.equal(plan.partitions.length, 0);
assert.equal(plan.roomAt(0, 0), 0);
assert.ok(floor.total > 0 && floor.maxAlive <= 8);

const boss = new Boss(new THREE.Scene());
boss.spawn(0, 0, 520, plan.rooms[0]);
boss.sweep = { t:2, dur:4 };
boss.beams.push({ angle:0 });
boss.takeHit(520);
boss.despawn();
boss.spawn(0, 0, 520, plan.rooms[0]);
assert.equal(boss.hp, 520);
assert.equal(boss.dying, 0);
assert.equal(boss.sweep, null);
assert.equal(boss.beams.length, 0);
assert.equal(boss.beamMesh.count, 0);
console.log('boss arena: one open room, bounded reinforcements, clean boss retry');
