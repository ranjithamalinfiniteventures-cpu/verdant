/* The shared leaderboard's gatekeeping: what the server will and won't write.
   A score arrives as a claim from a browser nobody controls, so these bounds
   come from what the game actually contains — see api/scores.js. */
import assert from 'node:assert/strict';
import { validate } from '../api/scores.js';
import { FLOORS } from '../src/game/floors.js';

const TOWER_KILLS = FLOORS.reduce((a, f) => a + f.total, 0);
const ok = (b, e) => { const r = validate(b, e); assert.ok(r.row, `should be accepted, got: ${r.error}`); return r.row; };
const no = (b, e, why) => assert.ok(validate(b, e).error, why);

// --- a real escape gets on the board ------------------------------------------
{
  const row = ok('tower', { name: 'ada', seconds: 1850, kills: TOWER_KILLS, coins: 4200 });
  assert.equal(row.name, 'ADA');
  assert.equal(row.board, 'tower');
  assert.equal(row.wave, 0, 'a tower run has no wave');
}
// --- and the impossible does not ----------------------------------------------
no('tower', { name: 'x', seconds: 60, kills: TOWER_KILLS }, 'nobody clears 20 floors in a minute');
no('tower', { name: 'x', seconds: 1800, kills: 12 }, 'a full escape cannot have 12 kills');
no('tower', { name: 'x', seconds: 1800, kills: 1e6 }, 'more kills than the tower holds');
no('tower', { name: 'x', seconds: -5, kills: TOWER_KILLS }, 'negative time');
no('tower', { name: 'x', seconds: 'fast', kills: TOWER_KILLS }, 'a non-number time');

// --- the pit ------------------------------------------------------------------
{
  const row = ok('endless', { name: 'bo!!<script>', seconds: 900, kills: 700, wave: 14 });
  assert.equal(row.name, 'BOSCRIPT', 'the callsign is sanitised server-side too');
  assert.equal(row.wave, 14);
}
no('endless', { name: 'x', seconds: 900, kills: 700, wave: 0 }, 'wave 0 is not a run');
no('endless', { name: 'x', seconds: 20, kills: 700, wave: 40 }, 'wave 40 in 20 seconds');
no('endless', { name: 'x', seconds: 4000, kills: 3, wave: 40 }, 'wave 40 with 3 kills');
no('endless', { name: 'x', seconds: 900, kills: 700, wave: 99999 }, 'a wave beyond the ceiling');
{
  // the rate cap is shared by both boards
  no('endless', { name: 'x', seconds: 100, kills: 5000, wave: 5 }, '50 kills a second');
}

// an anonymous submission is named, not rejected
assert.equal(ok('endless', { name: '', seconds: 900, kills: 700, wave: 14 }).name, 'PILOT');

console.log('PASS: leaderboard server rejects impossible times, kill rates, waves and counts; sanitises names');
