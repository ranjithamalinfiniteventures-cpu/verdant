/* Fastest-escape leaderboard.

   A leaderboard is a shared-storage problem, not a UI problem. This ships with a
   local backend so it genuinely works today (your own runs, on this device), and
   a remote backend behind the same interface so pointing it at a real server is
   a one-line change and nothing above it has to move.

   To go global: stand up an endpoint that accepts
       POST <url>   { name, seconds, kills, coins, at }
       GET  <url>?limit=20  ->  [ { name, seconds, kills, coins, at }, ... ]
   then set REMOTE_URL below. Anything works — a tiny Node/Express route, a
   Cloudflare Worker + KV, Supabase, Firebase. Validate on the server: never
   trust a time posted by a browser you don't control. */

const REMOTE_URL = null;          // ← set this to share scores between players
const KEY = 'verdant.leaderboard.v1';
const NAME_KEY = 'verdant.pilot';
const MAX = 50;

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 12);

class LocalBackend {
  async top(limit = 10){
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
    return rows.sort((a, b) => a.seconds - b.seconds).slice(0, limit);
  }
  async submit(entry){
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
    rows.push(entry);
    rows.sort((a, b) => a.seconds - b.seconds);
    rows = rows.slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch {}
    return rows;
  }
}

class RemoteBackend {
  constructor(url){ this.url = url; }
  async top(limit = 10){
    const r = await fetch(`${this.url}?limit=${limit}`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`leaderboard ${r.status}`);
    return await r.json();
  }
  async submit(entry){
    const r = await fetch(this.url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry),
    });
    if (!r.ok) throw new Error(`leaderboard ${r.status}`);
    return await this.top(10);
  }
}

export const leaderboard = {
  backend: REMOTE_URL ? new RemoteBackend(REMOTE_URL) : new LocalBackend(),
  /** true when scores are shared; false when they are only this device's */
  get shared(){ return !!REMOTE_URL; },

  getName(){
    try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
  },
  setName(n){
    const c = clean(n) || 'PILOT';
    try { localStorage.setItem(NAME_KEY, c); } catch {}
    return c;
  },

  async top(limit = 10){
    try { return await this.backend.top(limit); }
    catch (e){ console.warn('[verdant] leaderboard unavailable:', e.message); return null; }
  },

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

  format(sec){
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  },
};
