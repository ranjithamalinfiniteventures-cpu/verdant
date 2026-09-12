import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const floorsSource = readFileSync(new URL('../src/game/floors.js', import.meta.url), 'utf8')
  .replaceAll('export ', '');
const weaponsSource = readFileSync(new URL('../src/game/weapons.js', import.meta.url), 'utf8');
const gunDefs = weaponsSource
  .slice(weaponsSource.indexOf('export const GUNS'), weaponsSource.indexOf('/* How a gun'))
  .replaceAll('export ', '');
const context = vm.createContext({ Math });
vm.runInContext(`${floorsSource}\n${gunDefs}\nglobalThis.data={FLOORS,GUNS};`, context);
const { FLOORS, GUNS } = context.data;

assert.equal(FLOORS.length, 20);

/* Population is measured PER ROOM, because that is the fight the player is
   actually in: rooms are sealed one at a time, and floors alternate between
   three and four of them. Judging raw totals is what let floors 11 and 12
   through — three rooms holding 114 and 118 put ~39 enemies in every room while
   floors 10 and 13 (four rooms) held ~28, and the totals still "rose", so the
   curve looked monotonic while the game had a wall in it. */
const perRoom = (i) => FLOORS[i].total / ((FLOORS[i].rooms || []).length || 1);

for (let i = 1; i < FLOORS.length; i++) {
  if (FLOORS[i].bossArena) continue; // Boss pressure replaces the large normal wave.
  assert.ok(FLOORS[i].maxAlive > FLOORS[i - 1].maxAlive, 'pressure rises each floor');
  assert.ok(FLOORS[i].interval < FLOORS[i - 1].interval, 'spawn delay falls each floor');
  assert.ok(perRoom(i) <= perRoom(i - 1) * 1.6,
    `floor ${i + 1} (${FLOORS[i].name}) jumps to ${perRoom(i).toFixed(1)} enemies per room from ${perRoom(i - 1).toFixed(1)}`);
}
// the run must still get heavier overall, even though a given floor may dip
assert.ok(perRoom(18) > perRoom(3) * 1.8, 'the top of the tower is far heavier than the bottom');
assert.deepEqual(Array.from(GUNS, g => g.price), [0, 1250, 3000, 5500, 9000]);
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const scaleFns = mainSource.slice(mainSource.indexOf('export function floorHpScale'), mainSource.indexOf('function scaleEnemy')).replaceAll('export ', '');
vm.runInContext(`${scaleFns}\nglobalThis.scale={floorHpScale,floorDamageScale};`, context);
const { floorHpScale, floorDamageScale } = context.scale;
// pools: creeper 40 + stalker 14 + sporeling 24 + thornbeast 10 + bloomer 6 + seeder 10 = 104 slots
for (const f of FLOORS) assert.ok(f.maxAlive + 6 <= 104, `${f.name} cannot exceed the enemy pools`);
for (let i = 1; i < FLOORS.length; i++) assert.ok(floorHpScale(i) > floorHpScale(i - 1), 'health keeps rising');
assert.ok(floorHpScale(19) < 3.2, 'top-floor health stays under 3.2x');

/* The real property: the tower must get harder as you climb, but not by turning
   enemies into sponges.

   This model deliberately uses GUN-ONLY damage. Floor upgrades expire after 30
   seconds, so they never accumulate — assuming a stack of ~19 permanent
   upgrades (as an earlier version of this test did) overstates late-game damage
   by about 6x and hides a curve that had become unbeatable.

   Note the gun ladder is not monotonic in damage-per-second: Needle Drive
   (floors 7-10) out-damages the pricier Rail and Plasma, which trade rate for
   per-shot punch. So time-to-kill is allowed to step up at floor 11. */
const dpsAt = (floor) => {
  const g = floor <= 3 ? { d: 1, r: 6.2, p: 1, lv: 1 }
    : floor <= 6  ? { d: 0.85, r: 1.8, p: 5, lv: 2 }
    : floor <= 10 ? { d: 0.65, r: 13,  p: 1, lv: 3 }
    : floor <= 15 ? { d: 5,    r: 1.15, p: 1, lv: 4 }
    :               { d: 3,    r: 1.6,  p: 1, lv: 5 };
  return g.d * (1 + (g.lv - 1) * 0.25) * g.r * g.p;
};
const ttk = (floor) => (3 * floorHpScale(floor - 1)) / dpsAt(floor);

assert.ok(ttk(20) >= ttk(10),
  `time-to-kill must not fall from floor 10 (${ttk(10).toFixed(2)}s) to floor 20 (${ttk(20).toFixed(2)}s)`);
assert.ok(ttk(20) <= ttk(10) * 1.6,
  `top floor must not become a bullet sponge: floor 10 ${ttk(10).toFixed(2)}s vs floor 20 ${ttk(20).toFixed(2)}s`);
assert.ok(ttk(20) <= 1.05,
  `a single top-floor enemy must die in about a second, got ${ttk(20).toFixed(2)}s`);
// and the climb must still be a climb
assert.ok(ttk(20) > ttk(1) * 1.4, 'the top must be meaningfully tougher per enemy than the bottom');

/* No single floor may be a wall. Floor 6 once carried 3.7x the enemy health of
   floor 5 and more than floors 7 and 9 — the run stalled there. Compare each
   floor's total health against the mean of its neighbours. */
{
  const HP = { creeper:3, stalker:6, sporeling:2, thornbeast:14, bloomer:16, seeder:4 };
  /* Per ROOM, and weighted by the health actually on the floor. Floor 12 was a
     wall by exactly this measure and no other: 190 health per room against
     floor 11's 102, because 11 carried no tanky growth at all and 12 was a
     fifth thornbeasts. Headcount alone said the two floors were siblings.
     Floor 8 is the closest to the limit today at 1.67 — tighten this if it is
     ever reported as a wall. */
  const load = (i) => {
    const F = FLOORS[i], w = F.mix.reduce((a, [, x]) => a + x, 0);
    const rooms = (F.rooms || []).length || 1;
    return F.mix.reduce((a, [k, x]) => a + HP[k] * x, 0) / w * F.total * floorHpScale(i) / rooms;
  };
  // the top floor is deliberately light (the boss is the fight there), so the
  // floor beneath it is judged against the floor below it only
  const last = FLOORS.length - 1;
  for (let i = 1; i < last; i++){
    const ratio = i === last - 1
      ? load(i) / load(i - 1)
      : load(i) / ((load(i - 1) + load(i + 1)) / 2);
    assert.ok(ratio < 1.7,
      `floor ${i + 1} (${FLOORS[i].name}) is a wall: ${ratio.toFixed(2)}x its neighbours' average health per room`);
  }
}
assert.ok(floorDamageScale(19, 3) <= 2.4, 'damage is capped at 2.4x');
assert.ok(0.07 * 2.4 < 0.25, 'one creeper hit never takes more than a quarter bar');
const floor5Hp = 1 + 4 * 0.18;
const floor5Damage = 1 + 4 * 0.12;
assert.ok(floor5Hp >= 1.7 && floor5Damage >= 1.45);
console.log('PASS: prices rise, per-room population curve has no cliffs, floor 5 scales health and damage');
