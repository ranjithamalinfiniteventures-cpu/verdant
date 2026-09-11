import { audio } from '../core/audio.js';

/* Icons are inline SVG on `currentColor`. */
const I = (body) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6"
  stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  power:  I(`<path d="M24 4.5 41 14v20L24 43.5 7 34V14z"/>
             <path d="M24 14.6 32.4 19.5v9L24 33.4 15.6 28.5v-9z" fill="currentColor" stroke="none"/>`),
  overclock: I(`<path d="M9 33a16 16 0 1 1 30 0"/>
             <path d="M27.5 10.5 15.5 27.5h7.4l-2.4 11.5 12-17h-7.4z" fill="currentColor" stroke="none"/>
             <path d="M6.5 38.5h6.5M35 38.5h6.5"/>`),
  velocity: I(`<path d="M5 16.5h11M5 24h7M5 31.5h11"/><path d="M19 24h21"/><path d="M31 15l9 9-9 9"/>`),
  split:  I(`<circle cx="9" cy="24" r="3.6" fill="currentColor" stroke="none"/>
             <path d="M17 14.5h20M17 24h25M17 33.5h20"/>`),
  pierce: I(`<circle cx="20" cy="24" r="6.5"/><circle cx="33.5" cy="24" r="6.5"/>
             <path d="M5 24h38"/><path d="M36 17.5 42.5 24 36 30.5"/>`),
  crit:   I(`<path d="M24 5v11M24 32v11M5 24h11M32 24h11M11.5 11.5l7.8 7.8M28.7 28.7l7.8 7.8M36.5 11.5l-7.8 7.8M19.3 28.7l-7.8 7.8"/>
             <circle cx="24" cy="24" r="4.4" fill="currentColor" stroke="none"/>`),
  repair: I(`<rect x="7.5" y="7.5" width="33" height="33" rx="10"/><path d="M24 15.5v17M15.5 24h17"/>`),
  shield: I(`<path d="M24 4.5 39.5 11v11.5c0 10.5-6.3 17.6-15.5 21.5C14.8 40.1 8.5 33 8.5 22.5V11z"/>
             <path d="M16.5 23.5 21.5 29l10.5-11"/>`),
  adrenaline: I(`<path d="M11 25.5 24 12.5l13 13M11 37 24 24l13 13"/>`),
  harvest: I(`<path d="M14.5 37V22.5a9.5 9.5 0 0 1 19 0V37"/><path d="M14.5 29.5h19"/>
             <path d="M10.5 37h8v-7.5h-8zM29.5 37h8v-7.5h-8z" fill="currentColor" stroke="none"/>`),
  sap:    I(`<circle cx="24" cy="24" r="14.5"/><path d="M24 16.5v15M16.5 24h15"/>`),
  wild:   I(`<rect x="10.5" y="5.5" width="27" height="37" rx="5"/>
             <path d="M19 19.5a5 5 0 1 1 5 5V28"/>
             <circle cx="24" cy="34.5" r="1.9" fill="currentColor" stroke="none"/>`),
  gamble: I(`<path d="M24 4.5 41 14v20L24 43.5 7 34V14z"/>
             <path d="M17 20.5 24 27l7-6.5" stroke-width="3"/>`),
  frenzy: I(`<path d="M26.5 5 12 26h9l-2 17 15-21h-9z" fill="currentColor" stroke="none"/>`),
  hide:   I(`<path d="M24 4.5 39.5 11v11.5c0 10.5-6.3 17.6-15.5 21.5C14.8 40.1 8.5 33 8.5 22.5V11z"/>
             <path d="M24 14v20M16 20l8-6 8 6"/>`),
  bloom:  I(`<circle cx="24" cy="24" r="5"/>
             <path d="M24 19c0-6-4-9-4-9s8-1 8 5M29 24c6 0 9-4 9-4s1 8-5 8M19 24c-6 0-9-4-9-4s-1 8 5 8M24 29c0 6 4 9 4 9s-8 1-8-5"/>`),
  lens:   I(`<circle cx="20" cy="24" r="9"/><path d="M29 24h14M36 18l6 6-6 6"/>
             <circle cx="20" cy="24" r="2.4" fill="currentColor" stroke="none"/>`),
};

/* The pool. Three are drawn each floor, so no two floors offer the same shelf.
   `max` stops an option once it has nothing left to give; `when` hides one that
   would be useless right now — being offered a heal at full health is a wasted
   slot, not a choice. */
const POOL = [
  { id:'power',      name:'AMPLIFIED CORE', amount:'+12% DAMAGE',      weight:3, max:8,
    description:'Every equipped gun hits harder.' },
  { id:'overclock',  name:'OVERCLOCK',      amount:'+10% FIRE RATE',   weight:3, max:8,
    description:'Every equipped gun fires faster.' },
  { id:'velocity',   name:'ACCELERATOR',    amount:'+12% RANGE & SPEED', weight:3, max:8,
    description:'Shots travel farther and reach targets sooner.' },
  { id:'split',      name:'SPLIT SHOT',     amount:'+1 PROJECTILE',    weight:2, max:3,
    description:'Every shot fires an extra round in a spread.' },
  { id:'pierce',     name:'PIERCING TIPS',  amount:'PASS THROUGH +1',  weight:2, max:3,
    description:'Shots carry on through one more target.' },
  { id:'crit',       name:'CRITICAL SEED',  amount:'+20% DOUBLE HITS', weight:2, max:3,
    description:'A chance for any shot to deal double damage.' },
  { id:'repair',     name:'FIELD REPAIR',   amount:'FULL HEALTH',      weight:4, max:99,
    description:'Patch the suit back to full right now.',
    when: ctx => ctx.player.hp < 0.95 },
  { id:'shield',     name:'BARK SHIELD',    amount:'+2 SHIELD',        weight:3, max:99,
    description:'Each charge soaks one hit completely.' },
  { id:'adrenaline', name:'ADRENALINE',     amount:'+10% MOVE SPEED',  weight:2, max:5,
    description:'You move faster, so you get surrounded less.' },
  { id:'harvest',    name:'WIDE HARVEST',   amount:'+70% PICKUP RANGE', weight:2, max:3,
    description:'Biomass comes to you from much farther away.' },
  { id:'sap',        name:'RICH SAP',       amount:'+30% COIN VALUE',  weight:2, max:4,
    description:'Every scrap of biomass is worth more at the armory.' },
];

/* Each entry applies the upgrade and returns how to undo it, or null when there
   is nothing to undo. FIELD REPAIR and BARK SHIELD are deliberately permanent:
   they are consumed rather than held — health you have already spent and a
   shield charge that has already soaked a hit cannot be taken back at the
   30s mark, and expiring unspent ones would just punish saving them. */
const APPLY = {
  power:      c => { const d = c.weapon.addRunUpgrade('power');     return () => c.weapon.removeRunUpgrade(d); },
  overclock:  c => { const d = c.weapon.addRunUpgrade('overclock'); return () => c.weapon.removeRunUpgrade(d); },
  velocity:   c => { const d = c.weapon.addRunUpgrade('velocity');  return () => c.weapon.removeRunUpgrade(d); },
  split:      c => { const d = c.weapon.addRunUpgrade('split');     return () => c.weapon.removeRunUpgrade(d); },
  pierce:     c => { const d = c.weapon.addRunUpgrade('pierce');    return () => c.weapon.removeRunUpgrade(d); },
  crit:       c => { const d = c.weapon.addRunUpgrade('crit');      return () => c.weapon.removeRunUpgrade(d); },
  repair:     c => { c.player.heal(1); return null; },
  shield:     c => { c.player.shield += 2; return null; },
  adrenaline: c => { c.player.speedMul *= 1.10; return () => { c.player.speedMul /= 1.10; }; },
  harvest:    c => { c.loot.magnetMul *= 1.7; return () => { c.loot.magnetMul /= 1.7; }; },
  sap:        c => { c.loot.valueMul *= 1.3; return () => { c.loot.valueMul /= 1.3; }; },
};

/* WILDCARDS — offered once, when Heartroot wakes.

   These are not floor upgrades and they are deliberately shaped differently.
   Every one is a trade: a large upside paid for with a real cost, so the choice
   is about how you want to fight the boss rather than which number goes up.
   That works here and nowhere else, because the boss is a single target with a
   long, readable fight — halving your damage for triple fire rate is a coherent
   plan against one enemy and suicide against a room of forty.

   They last the WHOLE fight rather than 30 seconds. A boss takes 35-57s to kill,
   so a 30s wildcard would evaporate halfway through and the choice would stop
   mattering exactly when it got interesting. */
const WILDCARDS = [
  { id:'gamble', icon:'gamble', name:'OVERGROWN CORE', amount:'+80% DAMAGE',
    cost:'You take 40% more damage.',
    apply: c => {
      const d = c.weapon.applyRunMods({ damage: 1.8 });
      c.player.armor *= 1.4;
      return () => { c.weapon.removeRunUpgrade(d); c.player.armor /= 1.4; };
    } },
  { id:'frenzy', icon:'frenzy', name:'SPORE FRENZY', amount:'+120% FIRE RATE',
    cost:'Each shot hits 40% softer.',
    apply: c => {
      const d = c.weapon.applyRunMods({ fireRate: 2.2, damage: 0.6 });
      return () => c.weapon.removeRunUpgrade(d);
    } },
  { id:'hide', icon:'hide', name:'THORNED HIDE', amount:'+4 SHIELD · +15% SPEED',
    cost:'You fire 20% slower.',
    apply: c => {
      const d = c.weapon.applyRunMods({ fireRate: 0.8 });
      c.player.shield += 4;
      c.player.speedMul *= 1.15;
      return () => { c.weapon.removeRunUpgrade(d); c.player.speedMul /= 1.15; };
    } },
  { id:'split', icon:'split', name:'SPLIT SEED', amount:'+2 PROJECTILES',
    cost:'Each shot hits 35% softer.',
    apply: c => {
      const d = c.weapon.applyRunMods({ pellets: 2, damage: 0.65 });
      return () => c.weapon.removeRunUpgrade(d);
    } },
  { id:'bloom', icon:'bloom', name:'LAST BLOOM', amount:'FULL HEALTH · +3 SHIELD',
    cost:'You deal 20% less damage.',
    apply: c => {
      const d = c.weapon.applyRunMods({ damage: 0.8 });
      c.player.heal(1);
      c.player.shield += 3;
      return () => c.weapon.removeRunUpgrade(d);
    } },
  { id:'lens', icon:'lens', name:'LONG LENS', amount:'PIERCE +2 · +30% REACH',
    cost:'You fire 15% slower.',
    apply: c => {
      const d = c.weapon.applyRunMods({ pierce: 2, projectile: 1.3, fireRate: 0.85 });
      return () => c.weapon.removeRunUpgrade(d);
    } },
];

/* The face-down card. Rolls one of the six at random, and pays you a quarter of
   your health back for taking the bet blind. */
const WILD = {
  id:'wild', icon:'wild', name:'WILDCARD', amount:'???',
  cost:'An unknown boon, plus a quarter of your health back.',
  wild: true,
  apply: c => {
    const pick = WILDCARDS[Math.floor(Math.random() * WILDCARDS.length)];
    const revert = pick.apply(c);
    c.player.heal(0.25);
    return { revert, rolled: pick };
  },
};

/** Seconds a stat buff stays live, counted only while actually fighting. */
export const BOON_SECONDS = 30;

export class FloorUpgrades {
  constructor(ctx){
    this.ctx = ctx;
    this.weapon = ctx.weapon;
    this.el = document.getElementById('floor-upgrade');
    this.cards = document.getElementById('floor-upgrade-cards');
    this.rerollBtn = document.getElementById('floor-upgrade-reroll');
    this.vault = ctx.vault || null;
    this.levels = {};
    this.offer = [];
    this.active = [];
    this.rerolls = 0;
    this.rerollBtn?.addEventListener('click', () => this.reroll());

    this.cards.addEventListener('pointerdown', e => {
      if (e.target.closest('button[data-upgrade]')) audio.tap();
    });
    this.cards.addEventListener('click', e => {
      const b = e.target.closest('button[data-upgrade]');
      if (b) this.choose(b.dataset.upgrade);
    });
    // 1/2/3 still select; they are simply no longer labelled on the cards
    addEventListener('keydown', e => {
      if (!this.paused) return;
      if (e.key === 'r' || e.key === 'R'){ e.preventDefault(); this.reroll(); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= this.offer.length){ e.preventDefault(); this.choose(this.offer[n - 1].id); }
    });
  }

  get paused(){ return !this.el.hidden; }

  /** Weighted draw without replacement, skipping maxed and irrelevant options. */
  draw(count = 3){
    const pool = POOL.filter(u =>
      (this.levels[u.id] || 0) < u.max && (!u.when || u.when(this.ctx)));
    const picked = [];
    const bag = pool.slice();
    while (picked.length < count && bag.length){
      let total = 0;
      for (const u of bag) total += u.weight;
      let r = Math.random() * total, i = 0;
      for (; i < bag.length; i++){ r -= bag[i].weight; if (r <= 0) break; }
      picked.push(bag.splice(Math.min(i, bag.length - 1), 1)[0]);
    }
    return picked;
  }

  /* Rerolling costs gems and gets dearer each time on the same floor, so it is
     a real decision rather than a free scroll through the pool. */
  get rerollCost(){ return 1 + this.rerolls; }

  reroll(){
    if (!this.paused || !this.vault) return false;
    if (this.mode === 'wild') return false;   // the boss hand is not negotiable
    if (!this.vault.spend(this.rerollCost)) { audio.tap(); return false; }
    this.rerolls++;
    audio.confirm();
    this.renderOffer();
    return true;
  }

  /* The boss draw: two random wildcards plus the face-down one, which is always
     on the table so the gamble is a standing option rather than a lucky roll. */
  openWildcards(onChoose){
    this.mode = 'wild';
    this.onChoose = onChoose;
    this.rerolls = 0;
    const bag = WILDCARDS.slice();
    const picked = [];
    while (picked.length < 2 && bag.length){
      picked.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    }
    // the wildcard sits in the middle, where the eye lands first
    this.offer = [picked[0], WILD, picked[1]];
    this.renderOffer();
    this.el.hidden = false;
    this.cards.querySelector('button')?.focus();
  }

  open(floorIndex, onChoose){
    this.mode = 'floor';
    this.onChoose = onChoose;
    void floorIndex;
    this.rerolls = 0;
    this.renderOffer();
    this.el.hidden = false;
    this.cards.querySelector('button')?.focus();
  }

  renderOffer(){
    // the wildcard hand is dealt once by openWildcards(); only floor draws reroll
    if (this.mode !== 'wild') this.offer = this.draw(this.vault ? this.vault.cardCount : 3);
    const title = this.el.querySelector('h2');
    if (title) title.textContent = this.mode === 'wild' ? 'PLAY A WILDCARD' : 'CHOOSE AN UPGRADE';
    this.el.classList.toggle('wild', this.mode === 'wild');
    this.cards.style.setProperty('--cards', this.offer.length);
    this.cards.dataset.cards = this.offer.length;
    if (this.rerollBtn){
      const gems = this.vault ? this.vault.gems : 0;
      this.rerollBtn.hidden = !this.vault || this.mode === 'wild';
      this.rerollBtn.disabled = gems < this.rerollCost;
      this.rerollBtn.innerHTML = `REROLL <b>◆ ${this.rerollCost}</b> <small>${gems} GEMS</small>`;
    }
    this.cards.innerHTML = this.offer.map(u => `
      <button class="floor-upgrade-card${u.wild ? ' is-wild' : ''}" data-upgrade="${u.id}">
        <span class="upgrade-icon">${ICONS[u.icon || u.id]}</span>
        <strong>${u.name}</strong>
        <em>${u.amount}</em>
        ${u.description ? `<small>${u.description}</small>` : ''}
        ${u.cost && !u.wild ? `<span class="upgrade-cost">${u.cost}</span>` : ''}
      </button>`).join('');
  }

  choose(id){
    const upgrade = this.offer.find(u => u.id === id);
    if (!this.paused || !upgrade) return;
    audio.confirm();

    if (this.mode === 'wild'){
      const res = upgrade.apply(this.ctx);
      // the face-down card returns what it rolled so the player is told
      const revert = res && res.revert ? res.revert : res;
      const rolled = res && res.rolled ? res.rolled : null;
      this.active.push({
        id: upgrade.id,
        name: rolled ? rolled.name : upgrade.name,
        t: Infinity, permanent: true, revert,
      });
      this.mode = 'floor';
      this.el.hidden = true;
      this.el.classList.remove('wild');
      const done = this.onChoose;
      this.onChoose = null;
      done?.(rolled || upgrade, !!rolled);
      return;
    }

    this.levels[id] = (this.levels[id] || 0) + 1;
    const revert = APPLY[id](this.ctx);
    /* The clock starts armed but does not run until the next floor's fight is
       actually under way. Burning the 30s on the stairs walk and the door
       animation would hand back a buff the player never got to use. */
    if (revert) this.active.push({ id, name: upgrade.name, t: BOON_SECONDS, revert });
    this.el.hidden = true;
    const done = this.onChoose;
    this.onChoose = null;
    done?.(upgrade);
  }

  /** Called each fighting frame; expires buffs whose 30s has run out. */
  update(dt){
    if (!this.active.length) return;
    for (let i = this.active.length - 1; i >= 0; i--){
      const b = this.active[i];
      if (b.permanent) continue;      // wildcards run until the boss is dead
      b.t -= dt;
      if (b.t <= 0){
        b.revert();
        this.active.splice(i, 1);
        audio.tap();
      }
    }
  }

  /** The buff with the least time left — what the HUD counts down. */
  get soonest(){
    let best = null;
    for (const b of this.active){
      if (b.permanent) continue;
      if (!best || b.t < best.t) best = b;
    }
    // nothing counting down: show the wildcard, which has no timer to show
    if (!best) for (const b of this.active) if (b.permanent) return b;
    return best;
  }

  /** Drop just the boss wildcards — called when Heartroot dies. */
  clearWildcards(){
    for (let i = this.active.length - 1; i >= 0; i--){
      if (this.active[i].permanent){ this.active[i].revert?.(); this.active.splice(i, 1); }
    }
  }

  clearBoons(){
    for (const b of this.active) b.revert();
    this.active = [];
  }

  reset(){
    this.mode = 'floor';
    this.el.classList.remove('wild');
    this.clearBoons();
    this.levels = {};
    this.offer = [];
    this.el.hidden = true;
    this.onChoose = null;
    this.weapon.resetRunUpgrades();
    this.ctx.player.shield = 0;
    this.ctx.player.speedMul = 1;
    this.ctx.loot.magnetMul = 1;
    this.ctx.loot.valueMul = 1;
  }
}
