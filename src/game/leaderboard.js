/* Best-runs board — this device only.

   It used to post to a server of ours (a Vercel function in front of Supabase).
   That was dropped deliberately: a global board is a database to keep alive, a
   free tier that pauses itself after a quiet week, an IP to hash, and a privacy
   notice to show — all so a game with no players yet could display an empty
   list. Your own best runs do the same job for the player and cost nothing.

   If this ever wants to be global again, the portal has its own leaderboard tied
   to real accounts; use that rather than running a database. The shape below
   (one backend behind two boards) is unchanged, so it is a small change.

   Nothing here leaves the machine. */

import { storage } from '../core/platform.js';

const NAME_KEY = 'verdant.pilot';
const MAX = 50;

/* Two boards. The tower ranks the fastest full escape; the Heartwood Pit ranks
   the deepest wave reached (ties go to more kills, then the quicker run). Each
   keeps its own list. */
const BOARDS = {
  tower:   { key: 'verdant.leaderboard.v1',
             sort: (a, b) => a.seconds - b.seconds },
  endless: { key: 'verdant.leaderboard.endless.v1',
             sort: (a, b) => (b.wave - a.wave) || (b.kills - a.kills) || (a.seconds - b.seconds) },
  // Different hazards make these scores incomparable with Heartwood's.
  eclipse: { key: 'verdant.leaderboard.eclipse.v1',
             sort: (a, b) => (b.wave - a.wave) || (b.kills - a.kills) || (a.seconds - b.seconds) },
};

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 12);

class LocalBackend {
  constructor(board){ this.key = BOARDS[board].key; this.sort = BOARDS[board].sort; }
  read(){
    try { const r = JSON.parse(storage.getItem(this.key) || '[]'); return Array.isArray(r) ? r : []; }
    catch { return []; }
  }
  async top(limit = 10){ return this.read().sort(this.sort).slice(0, limit); }
  async submit(entry){
    let rows = this.read();
    rows.push(entry);
    rows.sort(this.sort);
    rows = rows.slice(0, MAX);
    try { storage.setItem(this.key, JSON.stringify(rows)); } catch {}
    return rows;
  }
}

const backendFor = (board) => new LocalBackend(board);

async function safeTop(backend, limit){
  try { return await backend.top(limit); }
  catch (e){ console.warn('[verdant] leaderboard unavailable:', e.message); return null; }
}

function waveBoard(board){
  return {
    backend: backendFor(board),
    get shared(){ return false; },
    async top(limit = 10){ return safeTop(this.backend, limit); },
    async submit({ name, wave, kills, seconds, assisted = false }){
      if (assisted || !Number.isFinite(wave) || wave < 1) return null;
      const entry = {
        name: leaderboard.setName(name), wave: wave | 0, kills: kills | 0,
        seconds: Math.round((seconds || 0) * 100) / 100, at: Date.now(),
      };
      try { return { rows: await this.backend.submit(entry), entry }; }
      catch (e){ console.warn('[verdant] could not submit:', e.message); return { rows: null, entry }; }
    },
  };
}

export const leaderboard = {
  backend: backendFor('tower'),
  /** Always false: these runs are yours, on this machine. */
  get shared(){ return false; },

  getName(){
    try { return storage.getItem(NAME_KEY) || ''; } catch { return ''; }
  },
  setName(n){
    const c = clean(n) || 'PILOT';
    try { storage.setItem(NAME_KEY, c); } catch {}
    return c;
  },

  async top(limit = 10){ return safeTop(this.backend, limit); },

  /** Only a full escape counts — a death is not a time. */
  async submit({ name, seconds, kills, coins, floors, required = 20, assisted = false }){
    if (assisted || floors < required || !Number.isFinite(seconds) || seconds <= 0) return null;
    const entry = {
      name: this.setName(name), seconds: Math.round(seconds * 100) / 100,
      kills, coins, at: Date.now(),
    };
    try { return { rows: await this.backend.submit(entry), entry }; }
    catch (e){ console.warn('[verdant] could not submit:', e.message); return { rows: null, entry }; }
  },

  /** The Heartwood Pit: the deepest wave reached. */
  endless: waveBoard('endless'),
  eclipse: waveBoard('eclipse'),

  format(sec){
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  },
};
