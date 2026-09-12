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
      // Escape must remain available for the platform's fullscreen exit.
      if (this.paused && e.key === 'Escape') this.close();
    });
  }

  get paused(){ return !this.el.hidden; }

  /** @param {{mode:string, towerFloor:number, best:number, eclipseBest:number}} info */
  open({ mode, towerFloor, best, eclipseBest = 0 }){
    const towerCard = this.el.querySelector('.zone-card.tower');
    const pitCard = this.el.querySelector('.zone-card.pit');
    const eclipseCard = this.el.querySelector('.zone-card.eclipse');
    towerCard.classList.toggle('current', mode === 'tower');
    pitCard.classList.toggle('current', mode === 'endless');
    eclipseCard.classList.toggle('current', mode === 'eclipse');
    this.el.querySelector('#zc-tower-state').textContent = mode === 'tower'
      ? `YOU ARE HERE · FLOOR ${towerFloor}` : `RESUME FLOOR ${towerFloor}`;
    this.el.querySelector('#zc-pit-state').textContent = mode === 'endless'
      ? (best ? `YOU ARE HERE · BEST WAVE ${best}` : 'YOU ARE HERE') : best ? `BEST WAVE ${best}` : 'NO RUNS YET';
    this.el.querySelector('#zc-eclipse-state').textContent = mode === 'eclipse'
      ? (eclipseBest ? `YOU ARE HERE · BEST WAVE ${eclipseBest}` : 'YOU ARE HERE')
      : eclipseBest ? `BEST WAVE ${eclipseBest}` : 'NEW ZONE · ENTER';
    this.el.querySelector('#zones-note').textContent = mode === 'tower'
      ? 'Leaving the tower keeps your floor. Visiting an arena makes that tower run unranked.'
      : 'Arena coins are yours to keep. Changing arenas starts a new wave run; each zone keeps its own best.';
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
