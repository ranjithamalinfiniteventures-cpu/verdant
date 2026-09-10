/* The Seed Vault — gems.

   Coins are a run's economy: spent at the armory on guns, lost to nothing. Gems
   are the meta economy the design doc called "Seed Vault": rare, kept through
   death, and spent on permanent suit perks so a player who keeps dying on floor
   five is still getting stronger. They are also the reroll currency on the
   between-floor upgrade screen, so a bad shelf is a choice, not a sentence.

   How gems are earned (all in main.js):
     • every floor cleared      1, +1 on every third floor, doubled above floor 10, 4 on the last
     • elite kills              stalker / thornbeast / bloomer / seeder drop one
                                on a 10% chance, as a green pickup
     • the extraction hold-out  3 on surviving it */

const KEY = 'verdant.vault.v1';

export const PERKS = [
  { id: 'plating',  name: 'REINFORCED PLATING', max: 5, cost: l => 4 + l * 3,
    effect: l => `-${l * 6}% DAMAGE TAKEN`, next: l => `-${(l + 1) * 6}% DAMAGE TAKEN`,
    description: 'Thicker suit plating. Every hit does less.' },
  { id: 'shield',   name: 'BARK SPORES',        max: 3, cost: l => 6 + l * 4,
    effect: l => `+${l} SHIELD EACH FLOOR`, next: l => `+${l + 1} SHIELD EACH FLOOR`,
    description: 'Start every floor with shield charges already grown.' },
  { id: 'salvage',  name: 'SALVAGE RIG',        max: 5, cost: l => 3 + l * 2,
    effect: l => `+${l * 10}% COINS`, next: l => `+${(l + 1) * 10}% COINS`,
    description: 'Biomass is worth more at the armory. Permanently.' },
  { id: 'choice',   name: 'WIDER SHELF',        max: 1, cost: () => 12,
    effect: () => '4 UPGRADE CARDS', next: () => '4 UPGRADE CARDS',
    description: 'A fourth card on every between-floor upgrade screen.' },
  { id: 'revive',   name: 'SECOND WIND',        max: 1, cost: () => 20,
    effect: () => 'REVIVE ONCE PER RUN', next: () => 'REVIVE ONCE PER RUN',
    description: 'The suit reboots you once per run at half health.' },
];

export class Vault {
  constructor(){
    this.gems = 0;
    this.levels = {};
    this.load();
  }

  load(){
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s){
        this.gems = Number.isSafeInteger(s.gems) && s.gems >= 0 ? s.gems : 0;
        for (const p of PERKS){
          const l = s.levels?.[p.id];
          if (Number.isInteger(l)) this.levels[p.id] = Math.max(0, Math.min(p.max, l));
        }
      }
    } catch {}
  }

  save(){
    try { localStorage.setItem(KEY, JSON.stringify({ gems: this.gems, levels: this.levels })); }
    catch {}
  }

  level(id){ return this.levels[id] || 0; }

  cost(id){
    const p = PERKS.find(p => p.id === id);
    if (!p) return Infinity;
    const l = this.level(id);
    return l >= p.max ? Infinity : p.cost(l);
  }

  earn(n){
    if (!(n > 0)) return 0;
    this.gems += Math.round(n);
    this.save();
    this.onChange?.(this.gems);
    return n;
  }

  /** Spend n gems if affordable. */
  spend(n){
    if (n > this.gems) return false;
    this.gems -= n;
    this.save();
    this.onChange?.(this.gems);
    return true;
  }

  buy(id){
    const p = PERKS.find(p => p.id === id);
    if (!p) return false;
    const c = this.cost(id);
    if (c === Infinity || !this.spend(c)) return false;
    this.levels[id] = this.level(id) + 1;
    this.save();
    this.onPerk?.(id, this.levels[id]);
    return true;
  }

  /* Derived numbers the game reads each floor. Kept here so the tuning lives in
     one file with the prices that pay for it. */
  get damageMul(){ return 1 - this.level('plating') * 0.06; }
  get startShield(){ return this.level('shield'); }
  get coinMul(){ return 1 + this.level('salvage') * 0.10; }
  get cardCount(){ return 3 + this.level('choice'); }
  get revives(){ return this.level('revive'); }

  /** Gems awarded for clearing floor `i` of `n`. */
  static floorReward(i, n){
    if (i === n - 1) return 4;
    // the upper tower pays double: it is where the perks are needed
    return (1 + ((i + 1) % 3 === 0 ? 1 : 0)) * (i >= 10 ? 2 : 1);
  }
}
