/* Grenade targeting, the per-floor grenade rules, and the Heartwood Pit leaderboard. */
import assert from 'node:assert/strict';

// the leaderboard reads localStorage at call time — give it one
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };

const { blastCenter, NadeStock, BLAST_R, THROW_RANGE, GRENADES_PER_FLOOR } = await import('../src/game/grenade.js');
const { leaderboard } = await import('../src/game/leaderboard.js');

const e = (x, z, hp = 3, alive = true) => ({ alive, pos: { x, z }, def: { hp } });
const me = { x: 0, z: 0 };

// --- targeting -----------------------------------------------------------------
assert.equal(blastCenter([], me), null, 'nothing to hit: no target');
assert.equal(blastCenter([e(THROW_RANGE + 3, 0)], me), null, 'out of reach is ignored');
assert.equal(blastCenter([e(2, 2, 3, false)], me), null, 'the dead are ignored');

{
  // a lone creeper to the left, a pack of four to the right: the pack wins
  const list = [e(-5, 0), e(6, 0), e(6.8, 0.6), e(6.2, -0.8), e(7.1, 0.2)];
  const t = blastCenter(list, me);
  assert.ok(t.x > 5 && t.count === 4, `aims at the pack (got x=${t.x}, count=${t.count})`);
}
{
  // equal crowds, but one is round a thornbeast: elites break the tie
  const list = [e(-6, 0), e(-6.5, 0.5), e(6, 0, 14), e(6.5, 0.5)];
  assert.ok(blastCenter(list, me).x > 0, 'a crowd round an elite wins the tie');
}
{
  // everything caught is actually inside the blast
  const list = [e(3, 3), e(3.5, 3.2), e(2.8, 3.9), e(-7, -2)];
  const t = blastCenter(list, me);
  const caught = list.filter(o => Math.hypot(o.pos.x - t.x, o.pos.z - t.z) <= BLAST_R);
  assert.ok(caught.length >= t.count, 'the count it reports is really inside the radius');
}
assert.equal(GRENADES_PER_FLOOR, 2, 'two throws per floor');

// --- bought per floor, two throws per floor ------------------------------------
{
  const n = new NadeStock();
  n.enterFloor(3);
  assert.ok(!n.canThrow, 'nothing to throw until you buy');
  assert.ok(n.buy() && n.buy(), 'two can be bought');
  assert.ok(!n.buy(), 'a third cannot — the floor only allows two');
  assert.ok(n.use() && !n.buy(), 'one thrown, one in the pouch: still no room to buy');
  assert.ok(n.use() && !n.canThrow && !n.use(), 'two thrown: done for the floor');
  assert.ok(!n.canBuy, 'and none can be bought after two throws');

  n.enterFloor(3);                     // died, retrying the same floor
  assert.equal(n.uses, 0, 'a retry gives the throws back');
  n.buy();
  n.enterFloor(3);
  assert.equal(n.stock, 1, 'unthrown grenades survive a retry of the same floor');
  n.enterFloor(4);
  assert.equal(n.stock, 0, 'a new floor empties the pouch — buy again');

  n.enterFloor('pit'); n.buy(); n.buy(); n.use(); n.use();
  assert.ok(!n.canThrow, 'two per wave in the pit');
  n.buy(); assert.equal(n.stock, 0, 'no buying past the wave limit either');
  n.enterFloor('pit');                 // next wave
  assert.ok(n.canBuy && n.uses === 0, 'a new wave resets the throws');
  n.reset();
  assert.equal(n.stock + n.uses, 0, 'a new run starts empty');
}

// --- the pit's leaderboard -----------------------------------------------------
const board = leaderboard.endless;
assert.deepEqual(await board.top(), [], 'starts empty');
assert.equal(await board.submit({ name: 'x', wave: 0, kills: 5, seconds: 30 }), null, 'wave 0 is not a run');
assert.equal(await board.submit({ name: 'x', wave: 9, kills: 5, seconds: 30, assisted: true }), null, 'assisted runs are not ranked');

await board.submit({ name: 'ada', wave: 7, kills: 200, seconds: 300 });
await board.submit({ name: 'bo', wave: 12, kills: 350, seconds: 520 });
await board.submit({ name: 'cy', wave: 12, kills: 410, seconds: 600 });
const res = await board.submit({ name: 'd<script>!!', wave: 3, kills: 40, seconds: 90 });
const top = await board.top();
assert.deepEqual(top.map(r => r.name), ['CY', 'BO', 'ADA', 'DSCRIPT'], 'deepest wave first, ties to more kills');
assert.equal(res.entry.name, 'DSCRIPT', 'callsigns are sanitised');

// the tower's fastest-escape board is separate and unchanged
assert.deepEqual(await leaderboard.top(), [], 'the tower board is not polluted by pit runs');
assert.equal(await leaderboard.submit({ name: 'z', seconds: 900, kills: 1, coins: 1, floors: 12 }), null,
  'an unfinished tower is still not a time');

console.log('PASS: grenade targeting (packs, elites, reach, the dead), per-floor buying + 2-throw cap, pit leaderboard ranking + rules, boards kept separate');
