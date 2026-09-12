/* The endless wave director for the Heartwood Pit.

   Pure logic — no scene, no DOM — so the whole difficulty curve can be tested
   without a browser. main.js asks it each frame what should happen (start a
   wave, spawn N, the wave is clear) and does the actual spawning and effects.

   The shape of a run:
     - A short breather, then a wave. Clear it and the next one comes.
     - New enemy types join as the waves climb, so wave 1 is creepers only and
       the full cast is in by wave 8.
     - Every 5th wave is a SURGE: the same count, but weighted hard toward elites.
     - Every 10th wave, Heartroot rises from the dais with an escort.
     - Health keeps climbing and never levels off. The run always ends — the
       only question is which wave. */

export const ENDLESS_KEY = 'verdant.endless.v1';

// [type, first wave it appears, weight as a function of the wave]
const CAST = [
  ['creeper',    1, ()  => 5],
  ['sporeling',  2, (n) => 2 + n * 0.08],
  ['stalker',    3, (n) => 1 + n * 0.10],
  ['seeder',     5, (n) => 1 + n * 0.05],
  ['thornbeast', 6, (n) => 0.8 + n * 0.07],
  ['bloomer',    8, (n) => 0.5 + n * 0.03],
];
const ELITE = new Set(['stalker', 'seeder', 'thornbeast', 'bloomer']);

export function waveSpec(n){
  const boss = n % 10 === 0;
  const surge = !boss && n % 5 === 0;
  let mix = CAST.filter(([, first]) => n >= first).map(([k, , w]) => [k, +w(n).toFixed(2)]);
  if (surge) mix = mix.map(([k, w]) => [k, +(ELITE.has(k) ? w * 1.9 : w * 0.5).toFixed(2)]);
  return {
    n, boss, surge, mix,
    // the type that joins the pit on this wave, for the banner
    debut: (CAST.find(([, first]) => first === n) || [null])[0],
    // a boss wave is Heartroot plus a small escort, not a full wave on top
    count: boss ? Math.round(8 + n * 0.8) : Math.round(10 + n * 4 + n * n * 0.1),
    maxAlive: boss ? Math.min(16, 8 + Math.round(n * 0.4)) : Math.min(44, Math.round(10 + n * 2.1)),
    interval: Math.max(0.24, 0.9 - n * 0.035),
    // steepens after 15: late waves are meant to end runs
    hpScale: 1 + n * 0.13 + Math.max(0, n - 15) * 0.05,
    dmgScale: Math.min(2.6, 1 + n * 0.065),
    bossHp: boss ? Math.round(420 * (1 + (n / 10 - 1) * 0.9)) : 0,
  };
}

export class Endless {
  constructor(storage = globalThis.localStorage, key = ENDLESS_KEY){
    this.storage = storage;
    this.key = key;
    this.best = 0;
    try { this.best = Math.max(0, JSON.parse(storage?.getItem(this.key) || '{}').best | 0); } catch {}
    this.reset();
  }

  reset(){
    this.wave = 0;          // the wave in progress, or the one just finished
    this.cleared = 0;       // how many waves have been cleared this run
    this.phase = 'breather';
    this.timer = 3.2;       // first breather is short: you came here to fight
    this.spec = null;
    this.toSpawn = 0;
    this.spawnCd = 0;
  }

  /** @returns {{start:boolean, spawn:number, clear:boolean}} */
  update(dt, alive, bossAlive = false){
    const out = { start: false, spawn: 0, clear: false };
    if (this.phase === 'breather'){
      this.timer -= dt;
      if (this.timer <= 0){
        this.wave++;
        this.spec = waveSpec(this.wave);
        this.toSpawn = this.spec.count;
        this.spawnCd = 0.7;
        this.phase = 'fight';
        out.start = true;
      }
      return out;
    }
    this.spawnCd -= dt;
    if (this.toSpawn > 0 && this.spawnCd <= 0 && alive < this.spec.maxAlive){
      const extra = (Math.random() < 0.45 ? 1 : 0) + (this.wave > 8 && Math.random() < 0.3 ? 1 : 0);
      out.spawn = Math.min(this.toSpawn, 1 + extra, this.spec.maxAlive - alive);
      this.spawnCd = this.spec.interval * (0.8 + Math.random() * 0.4);
    }
    if (this.toSpawn === 0 && alive === 0 && !bossAlive){
      this.phase = 'breather';
      this.timer = 5.5;
      this.cleared = this.wave;
      out.clear = true;
    }
    return out;
  }

  /** main.js reports how many actually spawned; a failed spawn is retried. */
  spawned(k){ this.toSpawn = Math.max(0, this.toSpawn - k); }

  /** An upgrade is offered after every second wave cleared. */
  get upgradeDue(){ return this.cleared > 0 && this.cleared % 2 === 0; }

  /** @returns {boolean} true if this is a new best */
  saveBest(wave){
    if (wave <= this.best) return false;
    this.best = wave;
    try { this.storage?.setItem(this.key, JSON.stringify({ best: wave })); } catch {}
    return true;
  }
}
