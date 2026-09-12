/* Fastest-escape leaderboard.

   A leaderboard is a shared-storage problem, not a UI problem. This ships with a
   local backend so it genuinely works today (your own runs, on this device), and
   a remote backend behind the same interface so pointing it at a real server is
   a one-line change and nothing above it has to move.

   The shared board is api/scores.js — a Vercel function in front of Supabase,
   which does the validating, because a score posted by a browser you don't
   control is a claim, not a fact. See docs/leaderboard.md.

   Both backends run together: every run is written to this device either way,
   and the shared board is used when it answers. If it is missing (a downloaded
   build with no server), slow, or broken, the board silently becomes a local
   one — a leaderboard outage must never cost someone their run. */

import { storage } from '../core/platform.js';

/* Same origin on the deployed site; the absolute URL lets a downloaded or
   portal-hosted build reach the same board (the function allows cross-origin).
   Change this if the deployment moves. */
const API = 'https://verdant-black.vercel.app/api/scores';
const REMOTE_URL = (() => {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;   // node, file://
  return /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname) ? '/api/scores' : API;
})();
let remoteDownUntil = 0;          // after a failure, stop hammering it for a minute
const remoteUp = () => !!REMOTE_URL && Date.now() >= remoteDownUntil;
const NAME_KEY = 'verdant.pilot';
const MAX = 50;

/* Two boards. The tower ranks the fastest full escape; the Heartwood Pit ranks
   the deepest wave reached (ties go to more kills, then the quicker run). Each
   keeps its own local list; a remote server gets `?board=` to tell them apart. */
const BOARDS = {
  tower:   { key: 'verdant.leaderboard.v1',
             sort: (a, b) => a.seconds - b.seconds },
  endless: { key: 'verdant.leaderboard.endless.v1',
             sort: (a, b) => (b.wave - a.wave) || (b.kills - a.kills) || (a.seconds - b.seconds) },
  // Different hazards make these scores incomparable with Heartwood. Keep a
  // dedicated device board until the hosted database supports this arena.
  eclipse: { key: 'verdant.leaderboard.eclipse.v1', localOnly: true,
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

class RemoteBackend {
  constructor(url, board){ this.url = url; this.board = board; }
  async top(limit = 10){
    const r = await fetch(`${this.url}?board=${this.board}&limit=${limit}`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`leaderboard ${r.status}`);
    return await r.json();
  }
  async submit(entry){
    const r = await fetch(`${this.url}?board=${this.board}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry),
    });
    if (!r.ok) throw new Error(`leaderboard ${r.status}`);
    /* The POST answers with the fresh top ten straight from the database. Use
       it: re-reading through the CDN can hand back a cached board that does not
       have the run we just wrote. */
    return await r.json();
  }
}

/* The shared board when it answers, this device when it doesn't. */
class Backend {
  constructor(board){
    this.local = new LocalBackend(board);
    this.remote = REMOTE_URL && !BOARDS[board].localOnly ? new RemoteBackend(REMOTE_URL, board) : null;
  }
  down(e){
    remoteDownUntil = Date.now() + 60e3;
    console.warn('[verdant] shared leaderboard unavailable, using this device:', e.message);
  }
  async top(limit = 10){
    if (this.remote && remoteUp()){
      try { return await this.remote.top(limit); } catch (e){ this.down(e); }
    }
    return this.local.top(limit);
  }
  async submit(entry){
    await this.local.submit(entry);            // your own runs are kept here regardless
    if (this.remote && remoteUp()){
      try { return await this.remote.submit(entry); } catch (e){ this.down(e); }
    }
    return this.local.top(10);
  }
}

const backendFor = (board) => new Backend(board);

async function safeTop(backend, limit){
  try { return await backend.top(limit); }
  catch (e){ console.warn('[verdant] leaderboard unavailable:', e.message); return null; }
}

function waveBoard(board){
  return {
    backend: backendFor(board),
    get shared(){ return !!this.backend.remote && remoteUp(); },
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
  /** true when scores are shared; false when they are only this device's.
      Read after a top()/submit(), so a dead server shows as THIS DEVICE. */
  get shared(){ return remoteUp(); },

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
