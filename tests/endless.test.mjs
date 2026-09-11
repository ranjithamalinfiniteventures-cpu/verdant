/* The Heartwood Pit's wave director: the difficulty curve, the unlock order,
   the boss and surge rhythm, and the breather -> fight -> clear state machine. */
import assert from 'node:assert/strict';
import { waveSpec, Endless, ENDLESS_KEY } from '../src/game/endless.js';

// --- the curve ---------------------------------------------------------------
for (let n = 2; n <= 40; n++){
  const a = waveSpec(n - 1), b = waveSpec(n);
  assert.ok(b.hpScale > a.hpScale, `health must keep rising (wave ${n})`);
  assert.ok(b.dmgScale >= a.dmgScale, `damage never falls (wave ${n})`);
  assert.ok(b.interval <= a.interval, `spawns never slow down (wave ${n})`);
  if (!a.boss && !b.boss) assert.ok(b.count > a.count, `normal waves grow (wave ${n})`);
}
assert.ok(waveSpec(40).dmgScale <= 2.6, 'contact damage is capped');
assert.ok(waveSpec(1).interval >= 0.8 && waveSpec(99).interval >= 0.24, 'spawn delay has a floor');

// every enemy pool together holds 104; the cap plus spawner children must fit
for (let n = 1; n <= 60; n++) assert.ok(waveSpec(n).maxAlive + 6 <= 104, `wave ${n} fits the pools`);

// --- the cast ----------------------------------------------------------------
const types = n => waveSpec(n).mix.map(([k]) => k);
assert.deepEqual(types(1), ['creeper'], 'wave 1 is creepers only');
assert.ok(types(2).includes('sporeling') && !types(2).includes('stalker'));
assert.ok(types(3).includes('stalker'));
assert.ok(!types(7).includes('bloomer') && types(8).includes('bloomer'), 'bloomers join at 8');
assert.equal(types(8).length, 6, 'the full cast is in by wave 8');
assert.equal(waveSpec(6).debut, 'thornbeast');
assert.equal(waveSpec(4).debut, null, 'no newcomer on wave 4');

// --- the rhythm --------------------------------------------------------------
for (const n of [10, 20, 30]) assert.ok(waveSpec(n).boss && waveSpec(n).bossHp > 0, `wave ${n} is a boss wave`);
assert.ok(waveSpec(20).bossHp > waveSpec(10).bossHp, 'later Heartroots are tougher');
for (const n of [5, 15, 25]) assert.ok(waveSpec(n).surge && !waveSpec(n).boss, `wave ${n} is a surge`);
{
  // a surge leans on elites compared with the waves either side
  const eliteShare = n => {
    const m = waveSpec(n).mix, tot = m.reduce((a, [, w]) => a + w, 0);
    return m.filter(([k]) => k !== 'creeper' && k !== 'sporeling').reduce((a, [, w]) => a + w, 0) / tot;
  };
  assert.ok(eliteShare(15) > eliteShare(14) * 1.5, 'surge waves are elite-heavy');
}
assert.ok(waveSpec(10).count < waveSpec(9).count, 'a boss wave is a small escort, not a full wave on top');

// --- the state machine -------------------------------------------------------
const store = new Map();
const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const d = new Endless(storage);
assert.equal(d.phase, 'breather');
let ev = d.update(1.0, 0);
assert.ok(!ev.start, 'the first breather runs before wave 1');
ev = d.update(3.0, 0);
assert.ok(ev.start && d.wave === 1 && d.phase === 'fight', 'wave 1 starts after the breather');

// spawns come out, never more than the cap allows
let spawned = 0;
for (let i = 0; i < 400 && d.toSpawn > 0; i++){
  const r = d.update(0.1, 0);
  assert.ok(r.spawn <= d.spec.maxAlive, 'never asks for more than the cap');
  d.spawned(r.spawn); spawned += r.spawn;
}
assert.equal(spawned, waveSpec(1).count, 'the whole wave is spawned');

// a full room holds spawning back
const d2 = new Endless(storage);
d2.update(4, 0);
assert.equal(d2.update(1, d2.spec.maxAlive).spawn, 0, 'no spawns while at the cap');

// nothing clears while enemies are alive, or while the boss lives
assert.ok(!d.update(0.1, 3).clear, 'not clear with enemies standing');
assert.ok(!d.update(0.1, 0, true).clear, 'not clear while the boss lives');
ev = d.update(0.1, 0);
assert.ok(ev.clear && d.cleared === 1 && d.phase === 'breather', 'clear when the room is empty');

// a failed spawn is retried, not lost
const d3 = new Endless(storage);
d3.update(4, 0);
const before = d3.toSpawn;
d3.update(1, 0); d3.spawned(0);
assert.equal(d3.toSpawn, before, 'toSpawn only drops by what actually spawned');

// upgrades after every second wave
d.cleared = 1; assert.ok(!d.upgradeDue);
d.cleared = 2; assert.ok(d.upgradeDue);
d.cleared = 3; assert.ok(!d.upgradeDue);

// --- best wave persists --------------------------------------------------------
assert.equal(d.saveBest(7), true);
assert.equal(d.saveBest(5), false, 'a worse wave is not a best');
assert.equal(JSON.parse(store.get(ENDLESS_KEY)).best, 7);
assert.equal(new Endless(storage).best, 7, 'best survives a reload');
assert.equal(new Endless({ getItem: () => '{broken', setItem(){} }).best, 0, 'a corrupt save reads as zero');

console.log('PASS: endless curve, cast unlocks, boss/surge rhythm, wave state machine, best-wave persistence');
