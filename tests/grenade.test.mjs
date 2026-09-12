/* Grenade targeting, the per-floor grenade rules, and the Heartwood Pit leaderboard. */
import assert from 'node:assert/strict';

// the leaderboard reads localStorage at call time — give it one
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };

const { blastCenter, NadeStock, BLAST_R, THROW_RANGE, CARRY_CAP, GRENADE_PRICE } = await import('../src/game/grenade.js');
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
assert.equal(CARRY_CAP, 2, 'the pouch holds two');
assert.equal(GRENADE_PRICE, 150, 'and each one is a real purchase');

// --- the pouch, not a quota -----------------------------------------------------
/* The limit is what you can carry and what you can pay, never a per-floor
   allowance: on a floor that is going badly the one tool that can save you must
   not be switched off. */
{
  const n = new NadeStock();
  assert.ok(!n.canThrow, 'nothing to throw until you buy');
  assert.ok(n.buy() && n.buy(), 'two fit in the pouch');
  assert.ok(!n.buy(), 'a third does not');
  assert.equal(n.room, 0, 'no room left');

  assert.ok(n.use(), 'throw one');
  assert.equal(n.room, 1, 'which makes room for one more');
  assert.ok(n.buy(), 'and you may buy it right away — no floor quota');
  assert.ok(!n.buy(), 'still capped at two');

  // as many as the wallet allows, across a long run
  let bought = 2;
  for (let i = 0; i < 20; i++){ if (n.use() && n.buy()) bought++; }
  assert.ok(bought > 10, `a run can get through many grenades (got ${bought})`);

  // floors do not touch the pouch; only a new run does
  n.reset();
  assert.equal(n.stock, 0, 'a new run starts empty');
  assert.equal(n.everBought, false, 'and forgets you ever had one');
  assert.ok(!n.use(), 'an empty pouch throws nothing');
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

console.log('PASS: grenade targeting (packs, elites, reach, the dead), pouch cap of two with unlimited buying, pit leaderboard ranking + rules, boards kept separate');
