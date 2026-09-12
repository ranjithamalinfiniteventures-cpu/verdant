/* The shared leaderboard: a Vercel function in front of a Supabase table.

   The browser never talks to Supabase directly. If it did, the anon key would
   be sitting in the bundle and anyone could paste a wave-900 row straight into
   the table from the console. So the key stays server-side in an environment
   variable, and every submission has to get past the plausibility checks below
   before it is written.

   Set up (see docs/leaderboard.md): create the table, then connect Supabase to
   the Vercel project — either through the marketplace integration or by setting
   the two variables by hand. Without them this returns 503 and
   the game quietly falls back to a device-local board, so the game is never
   broken by the leaderboard being down.

     GET  /api/scores?board=tower|endless&limit=10
     POST /api/scores?board=tower|endless   { name, seconds, kills, coins, wave }
*/
import { createHash } from 'node:crypto';
import { FLOORS } from '../src/game/floors.js';
import { waveSpec } from '../src/game/endless.js';

/* Two ways to wire this up, and both work without touching the code:
   connect Supabase from the Vercel marketplace (it injects its own variable
   names automatically), or paste the URL and service key in by hand. */
const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TABLE = 'scores';
const MAX_PER_HOUR = 30;              // per IP: a human finishes nothing like this many runs

/* What the game itself makes possible — the bounds come from the real content,
   not from guesses, so they reject the impossible without touching good runs. */
const TOWER_KILLS = FLOORS.reduce((a, f) => a + f.total, 0);   // growth in a full escape
const MAX_KILL_RATE = 8;              // kills/second, far above anything achievable
const cumulativeWaves = (n) => {      // enemies released up to the start of wave n
  let sum = 0;
  for (let i = 1; i < Math.min(n, 2000); i++) sum += waveSpec(i).count;
  return sum;
};

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 12) || 'PILOT';
const int = (v, max = 1e7) => (Number.isFinite(+v) && +v >= 0 && +v <= max ? Math.round(+v) : null);

/** @returns {{row:object}|{error:string}} */
export function validate(board, body){
  const seconds = Number(body?.seconds);
  const kills = int(body?.kills);
  const coins = int(body?.coins ?? 0);            // the pit's runs don't report coins
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) return { error: 'bad time' };
  if (kills === null || coins === null) return { error: 'bad counts' };
  if (kills > seconds * MAX_KILL_RATE) return { error: 'impossible kill rate' };

  if (board === 'tower'){
    // only a full 20-floor escape is a time, and clearing every floor means
    // killing nearly everything in the tower
    if (kills < TOWER_KILLS * 0.75) return { error: 'not a full escape' };
    if (seconds < TOWER_KILLS / MAX_KILL_RATE) return { error: 'impossibly fast' };
    return { row: { board, name: clean(body.name), seconds: Math.round(seconds * 100) / 100, kills, coins, wave: 0 } };
  }
  const wave = int(body?.wave, 2000);
  if (!wave || wave < 1) return { error: 'not a run' };
  if (seconds < wave * 4) return { error: 'impossibly fast' };
  if (kills < cumulativeWaves(wave) * 0.6) return { error: 'too few kills for the wave' };
  return { row: { board, name: clean(body.name), seconds: Math.round(seconds * 100) / 100, kills, coins, wave } };
}

const ORDER = { tower: 'seconds.asc', endless: 'wave.desc,kills.desc,seconds.asc' };
const SELECT = 'name,seconds,kills,coins,wave,at';

async function sb(path, init = {}){
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

const ipHash = (req) => createHash('sha256')
  .update(String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() + (KEY || ''))
  .digest('hex').slice(0, 32);

export default async function handler(req, res){
  res.setHeader('access-control-allow-origin', '*');          // a downloaded build can post too
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const board = req.query.board === 'endless' ? 'endless' : 'tower';
  if (!URL_BASE || !KEY) return res.status(503).json({ error: 'leaderboard not configured' });

  try {
    if (req.method === 'GET'){
      const limit = Math.min(50, Math.max(1, int(req.query.limit) || 10));
      const r = await sb(`${TABLE}?board=eq.${board}&select=${SELECT}&order=${ORDER[board]}&limit=${limit}`);
      /* Short, and no stale-while-revalidate: with SWR the CDN kept serving an
         empty board for a minute after someone submitted, so a player finished
         a run and could not find themselves on it. */
      res.setHeader('cache-control', 'public, max-age=10');
      return res.status(200).json(await r.json());
    }

    if (req.method === 'POST'){
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const check = validate(board, body);
      if (check.error) return res.status(400).json({ error: check.error });

      // a flood from one address is either a bot or someone hammering submit
      const hash = ipHash(req);
      const since = new Date(Date.now() - 3600e3).toISOString();
      const recent = await (await sb(`${TABLE}?select=id&ip_hash=eq.${hash}&at=gte.${since}&limit=${MAX_PER_HOUR + 1}`)).json();
      if (recent.length > MAX_PER_HOUR) return res.status(429).json({ error: 'too many submissions' });

      await sb(TABLE, { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ ...check.row, ip_hash: hash }) });
      const top = await (await sb(`${TABLE}?board=eq.${board}&select=${SELECT}&order=${ORDER[board]}&limit=10`)).json();
      return res.status(200).json(top);
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e){
    console.error('[scores]', e.message);
    return res.status(502).json({ error: 'leaderboard unavailable' });
  }
}
