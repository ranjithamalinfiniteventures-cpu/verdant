import { gunIllustration } from './gun-designs.js';
import { GUNS } from './weapons.js';
import { PERKS } from './vault.js';

const KEY = 'verdant.armory.v1';
export const FIRST_UPGRADE_COST = 120;
export class Armory {
  constructor(weapon, player, input){
    this.weapon = weapon; this.player = player; this.input = input;
    this.coins = 0; this.levels = { laser:1 }; this.selected = 'laser';
    let hasSave = false;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved){
        hasSave = true;
        this.coins = Number.isSafeInteger(saved.coins) && saved.coins >= 0 ? saved.coins : 0;
        for (const g of GUNS) if (Number.isInteger(saved.levels?.[g.id])) this.levels[g.id] = Math.max(g.id === 'laser' ? 1 : 0, Math.min(5, saved.levels[g.id]));
        if (GUNS.some(g => g.id === saved.selected) && this.levels[saved.selected]) this.selected = saved.selected;
      }
    } catch {}
    // A fresh player starts with exactly one purchase to make: the first laser
    // upgrade. Existing saves keep their earned balance.
    if (!hasSave) this.coins = FIRST_UPGRADE_COST;
    this.dialog = document.getElementById('armory');
    this.cards = document.getElementById('gun-list');
    this.status = document.getElementById('armory-status');
    document.getElementById('armory-open').onclick = () => this.hintStore();
    document.getElementById('armory-close').onclick = () => this.close();
    this.dialog.addEventListener('close', () => { this.onClose?.(); this.resetInput(); document.getElementById('armory-open').focus(); });
    this.cards.addEventListener('click', e => {
      const button = e.target.closest('button[data-gun]');
      if (button) this.act(button.dataset.gun, button.dataset.action);
    });
    this.perkList = document.getElementById('perk-list');
    this.perkList?.addEventListener('click', e => {
      const button = e.target.closest('button[data-perk]');
      if (button) this.buyPerk(button.dataset.perk);
    });
    this.apply(); this.render();
  }
  get paused(){ return this.dialog.open; }
  resetInput(){
    this.input.keys.clear(); this.input.stick = null; this.input.touchId = null;
    this.input.stickEl.classList.remove('on');
    this.player.vel.set(0,0,0);
  }
  hintStore(){ document.getElementById('store-hint').textContent = `Find the cyan ARMORY pad ${this.station?.inCorridor ? 'in the corridor' : 'by the entrance'}. Stand still for 2 seconds.`; }
  update(dt, room, phase){
    const station = room.store;
    this.station = station;
    const near = Math.hypot(this.player.pos.x-station.x, this.player.pos.z-station.z) < 1.35;
    const still = Math.hypot(this.player.vel.x,this.player.vel.z) < 0.35;
    if (!near) this.storeLatched = false;
    if (phase !== 'fight' || !near || !still || this.storeLatched) this.dwell = 0;
    else this.dwell = (this.dwell || 0) + dt;
    const hint = document.getElementById('store-hint');
    hint.textContent = near ? this.storeLatched ? 'ARMORY · Step off the pad to visit again' : `ARMORY · ${still ? `Connecting ${Math.min(100,Math.floor(this.dwell / 2 * 100))}%` : 'Stand still for 2 seconds'}` : `ARMORY · Cyan pad ${station.inCorridor ? 'in the corridor' : 'beside the entrance'}`;
    this.onProgress?.(station, near && !this.storeLatched && phase === 'fight', Math.min(1,this.dwell / 2));
    if (this.dwell >= 2){ this.storeLatched = true; this.open(); }
  }
  open(){ if (!this.storeLatched || this.dwell < 2) return; this.resetInput(); this.render(); this.dialog.showModal(); this.onOpen?.(this.station); }
  close(){ this.dialog.close(); }
  save(){
    try { localStorage.setItem(KEY, JSON.stringify({ coins:this.coins, levels:this.levels, selected:this.selected })); }
    catch { this.status.textContent = 'Storage unavailable — progress lasts for this session.'; }
  }
  earn(n){ this.coins += n; this.save(); this.updateWallet(); }
  updateWallet(){
    document.getElementById('biomass').textContent = this.coins;
    document.getElementById('armory-coins').textContent = this.coins;
    const gems = document.getElementById('armory-gems');
    if (gems && this.vault) gems.textContent = this.vault.gems;
  }
  /* The Seed Vault counter: gems are the permanent economy, bought here with the
     same two-second dwell as the guns so there is one shop, not two. */
  buyPerk(id){
    if (!this.vault || !this.paused) return false;
    const ok = this.vault.buy(id);
    const p = PERKS.find(p => p.id === id);
    this.status.textContent = ok ? `${p.name} installed — level ${this.vault.level(id)}.` : 'Not enough gems. Clear floors and hunt elites.';
    if (ok) this.onPerk?.(id);
    this.render();
    return ok;
  }
  renderPerks(){
    if (!this.perkList || !this.vault) return;
    const v = this.vault;
    this.perkList.innerHTML = PERKS.map(p => {
      const l = v.level(p.id), maxed = l >= p.max, cost = v.cost(p.id);
      return `<article class="perk-card ${l ? 'owned' : ''}">
        <div class="perk-info"><h3>${p.name}</h3><small>${l ? `LV ${l} / ${p.max} · ${p.effect(l)}` : 'NOT INSTALLED'}</small><p>${p.description}</p></div>
        <button data-perk="${p.id}" ${maxed || v.gems < cost ? 'disabled' : ''}>${maxed ? 'Max level' : `${l ? 'Upgrade' : 'Install'} · ◆ ${cost}`}</button>
      </article>`;
    }).join('');
  }
  cost(id){
    const gun = GUNS.find(g => g.id === id);
    const level = this.levels[id] || 1;
    // Starter upgrades remain attainable, while premium guns stay meaningful
    // long-term purchases instead of being maxed on the floor they are bought.
    return gun.price === 0
      ? level * FIRST_UPGRADE_COST
      : Math.ceil(gun.price * (0.35 + (level - 1) * 0.15) / 10) * 10;
  }
  act(id, action){
    const g = GUNS.find(g => g.id === id); if (!g || !this.paused) return false;
    const level = this.levels[id] || 0;
    if (action === 'buy'){
      if (level || this.coins < g.price) return false;
      this.coins -= g.price; this.levels[id] = 1; this.selected = id;
    } else if (action === 'upgrade'){
      if (!level || level >= 5 || this.coins < this.cost(id)) return false;
      this.coins -= this.cost(id); this.levels[id]++;
    } else if (action === 'equip'){
      if (!level) return false;
      this.selected = id;
    } else return false;
    this.apply(); this.render();
    this.status.textContent = action === 'upgrade' ? `${g.name} upgraded to level ${this.levels[id]}.` : `${g.name} equipped.`;
    this.save();
    this.onAction?.({ id, action, level:this.levels[id], coins:this.coins });
    return true;
  }
  apply(){
    const gun = GUNS.find(g => g.id === this.selected);
    this.weapon.equip(gun, this.levels[gun.id]);
    this.player.equipGun(gun.id, gun.color);
    document.getElementById('weapon-name').textContent = `${gun.name} · LV ${this.levels[gun.id]}`;
  }
  render(){
    this.updateWallet();
    this.renderPerks();
    this.cards.innerHTML = GUNS.map(g => {
      const level = this.levels[g.id] || 0, cost = this.cost(g.id);
      const tutorialTarget = this.tutorialActive && g.id === 'laser' && level === 1 ? ' tutorial-target' : '';
      return `<article class="gun-card ${this.selected === g.id ? 'equipped' : ''}${tutorialTarget}" style="--gun:#${g.color.toString(16).padStart(6,'0')}">
        <div class="weapon-art">${gunIllustration(g.id, `#${g.color.toString(16)}`)}</div>
        <div class="gun-info"><small class="weapon-number">VD / 0${GUNS.indexOf(g)+1} · ${level ? "OWNED" : "REQUISITION"}</small><h3>${g.name}</h3><p>${g.description}</p><small>${level ? `LEVEL ${level} / 5` : 'LOCKED'} · ${g.fireRate} SHOTS/S · ${(g.damage * (1 + (Math.max(1,level)-1)*0.25)).toFixed(2)} DMG${g.pellets ? ' / PELLET' : ''}</small></div>
        <div class="gun-actions">${level ? `<button data-gun="${g.id}" data-action="equip" ${this.selected === g.id ? 'disabled' : ''}>${this.selected === g.id ? 'Equipped' : 'Equip'}</button><button data-gun="${g.id}" data-action="upgrade" ${level >= 5 || this.coins < cost ? 'disabled' : ''}>${level >= 5 ? 'Max level' : `Upgrade · ${cost} coins`}</button>` : `<button data-gun="${g.id}" data-action="buy" ${this.coins < g.price ? 'disabled' : ''}>Buy & equip · ${g.price} coins</button>`}</div>
      </article>`;
    }).join('');
  }
}
