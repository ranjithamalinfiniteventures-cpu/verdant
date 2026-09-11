import { audio } from '../core/audio.js';

/* The zone select: the tower, or the Heartwood Pit. Opened from the portal
   tile in the top-left HUD (or Z). It pauses the game while it is open, the
   same way the upgrade panel does. Built as a list of cards so a second tower
   can be added later without redesigning the screen. */
export class Zones {
  constructor({ onPick }){
    this.onPick = onPick;
    this.el = document.getElementById('zones');
    this.openBtn = document.getElementById('zones-open');
    this.el.querySelector('#zones-close').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', e => {
      if (e.target.closest('.zone-card')) audio.tap();
    });
    this.el.addEventListener('click', e => {
      const card = e.target.closest('.zone-card');
      if (card){ this.pick(card.dataset.zone); return; }
      if (e.target === this.el) this.close();          // tap outside the panel
    });
    addEventListener('keydown', e => {
      if (this.paused && e.key === 'Escape'){ e.preventDefault(); this.close(); }
    });
  }

  get paused(){ return !this.el.hidden; }

  /** @param {{mode:string, towerFloor:number, best:number}} info */
  open({ mode, towerFloor, best }){
    const towerCard = this.el.querySelector('.zone-card.tower');
    const pitCard = this.el.querySelector('.zone-card.pit');
    towerCard.classList.toggle('current', mode === 'tower');
    pitCard.classList.toggle('current', mode === 'endless');
    this.el.querySelector('#zc-tower-state').textContent = mode === 'tower'
      ? `YOU ARE HERE · FLOOR ${towerFloor}` : `RESUME FLOOR ${towerFloor}`;
    this.el.querySelector('#zc-pit-state').textContent = mode === 'endless'
      ? (best ? `YOU ARE HERE · BEST WAVE ${best}` : 'YOU ARE HERE') : best ? `BEST WAVE ${best}` : 'NO RUNS YET';
    this.el.querySelector('#zones-note').textContent = mode === 'tower'
      ? 'Leaving the tower keeps your floor. A tower run that visits the pit is not ranked.'
      : 'Coins you earn in the pit are yours to spend in the tower.';
    this.mode = mode;
    this.el.hidden = false;
    audio.init();
    (mode === 'tower' ? pitCard : towerCard).focus();
  }

  close(){
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.openBtn?.focus?.();
  }

  pick(zone){
    audio.confirm();
    this.close();
    // picking the zone you are already in just closes the panel
    if (zone !== this.mode) this.onPick(zone);
  }
}
