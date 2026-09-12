import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { Minimap } from './minimap.js';
import { leaderboard } from '../game/leaderboard.js';
import { platform } from '../core/platform.js';

const $ = id => document.getElementById(id);

export class Hud {
  constructor(engine){
    this.engine = engine;
    this.el = {
      hud: $('hud'), boot: $('boot'), bar: $('bar').firstElementChild,
      php: $('php'), phpFill: $('phpfill'), hint: $('hint'),
      xpFill: $('xpfill'), xpLabel: $('xplabel'), pips: $('pips'), rem: $('rem'),
      biomass: $('biomass'), vault: $('vault'), salvage: $('salvage'),
      toast: $('toast'), dead: $('dead'), flash: $('flash'), perf: $('perf'), snd: $('snd'),
      threats: $('threats')
    };
    this.p = new THREE.Vector2();
    this.anchor = new THREE.Vector3();
    this.ndc = new THREE.Vector3();
    this.arrows = [];

    this.floorCount = 3;   // replaced by setFloorCount() once the tower is known

    this.el.snd.addEventListener('click', e => {
      e.stopPropagation();
      this.setMuted(!audio.toggle());
      if (audio.enabled) audio.confirm();
    });
    this.setMuted(!audio.enabled);
    this.minimap = new Minimap(this.el.hud);
    this.setModule(0, 'CRYO BAY', 0);
  }

  /** How many floors the tower has — drives the pip strip and the label. */
  setFloorCount(n){
    this.floorCount = n;
    this.el.pips.textContent = '';
    for (let i = 0; i < n; i++) this.el.pips.appendChild(document.createElement('b'));
  }

  setModule(index, name, remaining){
    [...this.el.pips.children].forEach((b, i) => {
      b.className = i < index ? 'd' : i === index ? 'n' : '';
    });
    this.el.xpLabel.textContent = `FLOOR ${index + 1} / ${this.floorCount} · ${name}`;
    this.el.rem.innerHTML = `GROWTH REMAINING&nbsp;&nbsp;${remaining}`;
  }

  /* Naming the room each straggler is in is half the answer to "where are the
     last three?" — the arrows give the other half. */
  setFloorRooms(zones, active, cleared, counts){
    if (!this.floorRooms){this.floorRooms=document.createElement('div');this.floorRooms.className='floor-rooms';this.el.rem.parentElement.appendChild(this.floorRooms);}
    const text = zones.map((z, i) => {
      const mark = i === active ? '▸ ' : '';
      if (!z.started) return `${mark}${z.name} · UNEXPLORED`;
      const n = counts ? counts[i] : null;
      return n == null ? `${mark}${z.name}` : `${mark}${z.name} ${n}`;
    }).join('   /   ') + (cleared ? ' · STAIRS ↑ OPEN' : ` · CLEAR ALL ${zones.length} ROOMS`);
    if(this.floorRooms.textContent!==text)this.floorRooms.textContent=text;
  }

  /* Edge arrows for growth that is off screen. Rooms are far wider than the
     9.2 m weapon reach, so without these the last few enemies are a hunt with
     no information. Nearest first, capped, so a full room isn't a ring of
     arrows. */
  setThreats(list, playerPos){
    const cam = this.engine.camera;
    const W = innerWidth, H = innerHeight;
    const cx = W / 2, cy = H / 2;
    const margin = Math.max(26, Math.min(W, H) * 0.055);
    const halfW = Math.max(10, cx - margin), halfH = Math.max(10, cy - margin);

    const off = [];
    for (const e of list){
      this.ndc.set(e.pos.x, 0.6, e.pos.z).project(cam);
      const behind = this.ndc.z > 1;
      let nx = this.ndc.x, ny = this.ndc.y;
      if (behind){ nx = -nx; ny = -ny; }
      // a little inside the frame still counts as visible, so arrows don't
      // flicker on and off along the edge
      if (!behind && Math.abs(nx) < 0.94 && Math.abs(ny) < 0.94) continue;
      const px = (nx * 0.5 + 0.5) * W, py = (-ny * 0.5 + 0.5) * H;
      const dx = px - cx, dy = py - cy;
      const scale = Math.min(halfW / (Math.abs(dx) || 1e-6), halfH / (Math.abs(dy) || 1e-6));
      off.push({
        x: cx + dx * scale, y: cy + dy * scale,
        a: Math.atan2(dy, dx), color: e.def.color,
        d: Math.hypot(e.pos.x - playerPos.x, e.pos.z - playerPos.z),
      });
    }
    off.sort((a, b) => a.d - b.d);
    const show = off.slice(0, 8);

    while (this.arrows.length < show.length){
      const el = document.createElement('div');
      el.className = 'threat';
      this.el.threats.appendChild(el);
      this.arrows.push(el);
    }
    for (let i = 0; i < this.arrows.length; i++){
      const el = this.arrows[i], t = show[i];
      if (!t){ el.style.opacity = 0; continue; }
      // nearer reads bigger and brighter, so the arrows rank themselves
      const k = Math.max(0.55, Math.min(1.25, 22 / (t.d + 8)));
      el.style.color = '#' + t.color.toString(16).padStart(6, '0');
      el.style.opacity = Math.max(0.4, Math.min(0.95, k));
      el.style.transform = `translate(${t.x}px,${t.y}px) translate(-50%,-50%) rotate(${t.a}rad) scale(${k})`;
    }
  }

  setProgress(f){ this.el.xpFill.style.width = (6 + f * 94) + '%'; }
  /** Shield charges live above the health bar, so you can see what you bought. */
  setShield(n){
    const el = this.el.shield || (this.el.shield = document.getElementById('phpshield'));
    if (this._shieldShown === n) return;
    this._shieldShown = n;
    el.textContent = '';
    for (let i = 0; i < n; i++) el.appendChild(document.createElement('b'));
  }

  setHp(f){ this.el.phpFill.style.width = Math.max(0, f) * 100 + '%'; }

  /** Boss health, or null to hide the bar. */
  setBoss(boss){
    const el = this.el.bossbar || (this.el.bossbar = document.getElementById('bossbar'));
    if (!el) return;
    if (!boss || !boss.alive){
      if (!el.hidden){ el.hidden = true; this._bossFrac = -1; }
      return;
    }
    el.hidden = false;
    const f = boss.hpFrac;
    if (this._bossFrac !== f){
      this._bossFrac = f;
      el.querySelector('i').style.width = (f * 100) + '%';
      // the ghost trails behind, so a big hit reads as a chunk taken off
      el.querySelector('u').style.width = (f * 100) + '%';
    }
  }

  /** The floor upgrade currently running, and how long it has left. */
  setBoon(boon){
    const el = this.el.boon || (this.el.boon = document.getElementById('boon'));
    if (!el) return;
    if (!boon){
      if (!el.hidden){ el.hidden = true; this._boonName = null; this._boonSecs = -1; }
      return;
    }
    el.hidden = false;
    if (this._boonName !== boon.name){
      this._boonName = boon.name;
      el.querySelector('span').textContent = boon.name;
    }
    // a wildcard runs until the boss dies, so there is no number to show
    const secs = boon.permanent ? -1 : Math.max(0, Math.ceil(boon.t));
    if (this._boonSecs !== secs){
      this._boonSecs = secs;
      const b = el.querySelector('b');
      b.textContent = boon.permanent ? '' : secs;
      b.hidden = boon.permanent;
      el.classList.toggle('low', !boon.permanent && secs <= 5);
      el.classList.toggle('wild', !!boon.permanent);
    }
  }
  /* Mercy used to announce itself only through a toast — and that toast got
     silently overwritten 0.75s later by the ordinary floor-name toast, so it
     effectively never showed. This is a persistent badge instead: it counts
     down while dying repeatedly on the current floor, then names the buff
     once one lands, with no dependency on catching a toast in time.
     @param info {null | {until:number} | {names:string[]}} */
  setMercy(info){
    const el = this.el.mercy || (this.el.mercy = document.getElementById('mercy'));
    if (!el) return;
    if (!info){
      if (!el.hidden){ el.hidden = true; this._mercyKey = null; }
      return;
    }
    const key = info.names ? 'on:' + info.names.join(',') : 'cd:' + info.until;
    if (this._mercyKey === key) return;
    this._mercyKey = key;
    el.hidden = false;
    el.classList.toggle('active', !!info.names);
    el.querySelector('span').textContent = info.names
      ? `MERCY ACTIVE · ${info.names.join(' · ')}`
      : `${info.until} MORE DEATH${info.until === 1 ? '' : 'S'} HERE → FREE BONUS`;
  }

  /* ------------------------------------------------ the endless pit -- */

  /** Switch the HUD between the tower and the pit. */
  setEndlessMode(on, arenaId = 'endless'){
    this.el.hud.classList.toggle('endless', !!on);
    this.el.hud.classList.toggle('eclipse', !!on && arenaId === 'eclipse');
    this._endlessKey = null;
  }

  /** The wave readout that stands in for the floor header in the pit. */
  setEndless({ wave, left, total, best, breather, timer, name = 'HEARTWOOD PIT' }){
    const label = breather
      ? (wave ? `WAVE ${wave} CLEARED · NEXT IN ${Math.max(1, Math.ceil(timer))}` : `FIRST WAVE IN ${Math.max(1, Math.ceil(timer))}`)
      : `${name} · WAVE ${wave}`;
    const rem = breather ? `BEST WAVE&nbsp;&nbsp;${best}` : `GROWTH LEFT&nbsp;&nbsp;${left}&nbsp;&nbsp;·&nbsp;&nbsp;BEST&nbsp;&nbsp;${best}`;
    const key = label + '|' + rem;
    if (key !== this._endlessKey){
      this._endlessKey = key;
      this.el.xpLabel.textContent = label;
      this.el.rem.innerHTML = rem;
    }
    this.setProgress(breather ? 1 : total ? Math.max(0, Math.min(1, 1 - left / total)) : 0);
  }

  /** The big centred call-out when a wave starts. */
  waveBanner(spec, arenaId = 'endless'){
    const el = document.getElementById('wave-banner');
    if (!el) return;
    const NAMES = { sporeling: 'SPORELINGS', stalker: 'STALKERS', seeder: 'SEEDERS', thornbeast: 'THORNBEASTS', bloomer: 'BLOOMERS' };
    el.classList.toggle('boss', !!spec.boss);
    const eclipse = arenaId === 'eclipse';
    document.getElementById('wb-eyebrow').textContent = spec.boss ? (eclipse ? 'REACTOR BREACH' : 'THE PIT STIRS') : spec.surge ? 'SURGE' : 'INCOMING';
    document.getElementById('wb-title').textContent = `WAVE ${spec.n}`;
    document.getElementById('wb-sub').textContent = spec.boss ? 'HEARTROOT RISES'
      : spec.surge ? 'ELITES INBOUND'
      : spec.debut && NAMES[spec.debut] ? `${NAMES[spec.debut]} ${eclipse ? 'BREACH THE FOUNDRY' : 'JOIN THE PIT'}` : '';
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('on'));
    clearTimeout(this._wbT);
    this._wbT = setTimeout(() => {
      el.classList.remove('on');
      setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 420);
    }, 2300);
  }

  /* Signed in on the portal? Then that name is the callsign — platforms that
     provide an identity require it to be used rather than asking for another
     one. The field turns into a label; everywhere else it stays editable. */
  async applyPortalName(inputEl){
    const user = await platform.user();
    if (!user) return;
    inputEl.value = user.name;
    inputEl.readOnly = true;
    inputEl.title = 'Your CrazyGames name';
    inputEl.classList.add('locked');
  }

  /* Point a hand at something, with a caption.

     `target` is a CSS selector, an element, or a function returning screen
     coordinates — the last one is how it points at an enemy in the world. The
     selector form is re-resolved every frame, because the shop rebuilds its
     cards with innerHTML whenever you buy something, which destroys the element
     the hand was pointing at.

     A <dialog> opened with showModal() lives in the browser's top layer, above
     everything else on the page, so pointing INSIDE the shop means moving the
     hand into that dialog or it hides behind it. */
  pointAt(target, text, { side = 'auto' } = {}){
    const hint = document.getElementById('tap-hint');
    if (!hint) return false;
    document.getElementById('tap-hint-text').textContent = text || '';
    const resolve = () => {
      if (typeof target === 'function') return target();
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el || el.hidden || el.disabled) return null;
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.45, el, w: r.width };
    };
    let misses = 0;
    const place = () => {
      const at = resolve();
      /* The shop replaces its cards with innerHTML on every purchase, so the
         element the hand points at briefly does not exist. Giving up on the
         first miss made the lesson vanish the moment the player interacted. */
      if (!at){
        if (++misses > 30){ this.clearPoint(); return; }
        this._pointRaf = requestAnimationFrame(place);
        return;
      }
      misses = 0;
      const host = at.el?.closest?.('dialog[open]') || document.getElementById('hud');
      if (hint.parentElement !== host) host.appendChild(hint);
      const leftward = side === 'left' || (side === 'auto' && at.x > innerWidth * 0.55);
      hint.classList.toggle('left', leftward);
      /* Measure where left:0/top:0 actually lands, then correct. The shop is a
         <dialog> with a backdrop filter, which makes it the containing block for
         position:fixed — so "fixed" coordinates inside it are not viewport
         coordinates, and the hand landed 341px below the button it meant. This
         works wherever the hint is parented, without knowing why. */
      hint.style.left = '0px'; hint.style.top = '0px';
      const base = hint.getBoundingClientRect();
      hint.style.left = Math.round(at.x - base.left - (at.w ? at.w * 0.38 : 0)) + 'px';
      hint.style.top = Math.round(at.y - base.top) + 'px';
      this._pointRaf = requestAnimationFrame(place);
    };
    hint.hidden = false;
    cancelAnimationFrame(this._pointRaf);
    place();
    return !hint.hidden;
  }
  clearPoint(){
    const hint = document.getElementById('tap-hint');
    cancelAnimationFrame(this._pointRaf);
    this._pointRaf = 0;
    if (hint) hint.hidden = true;
  }

  /* The pit's board: deepest wave first, ties to more kills. */
  /** `rows` skips the re-fetch: after a submit we already hold the fresh board,
      and re-reading can return a cached one without the run just posted. */
  async renderEndlessBoard(mine, rows, arenaId = 'endless'){
    const list = document.getElementById('eo-list');
    if (!list) return;
    const board = leaderboard[arenaId];
    rows = rows || await board.top(8);
    if (this._overArena !== arenaId) return;
    // after the fetch: `shared` only knows the server is there once it has answered
    document.getElementById('eo-scope').textContent = board.shared ? 'GLOBAL' : 'THIS DEVICE';
    list.textContent = '';
    if (!rows || !rows.length){
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = rows ? 'No runs on the board yet — put the first one up.' : 'Leaderboard unreachable.';
      list.appendChild(li);
      return;
    }
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      if (mine && r.at === mine.at && r.name === mine.name) li.className = 'me';
      const rank = document.createElement('b'); rank.textContent = `${i + 1}.`;
      const nm = document.createElement('span'); nm.textContent = r.name;
      const w = document.createElement('i'); w.textContent = `WAVE ${r.wave} · ${r.kills} KILLS`;
      li.append(rank, nm, w);
      list.appendChild(li);
    });
  }

  showEndlessOver(stats, onAgain, onTower){
    const $$ = id => document.getElementById(id);
    const arenaId = stats.arenaId === 'eclipse' ? 'eclipse' : 'endless';
    this._overArena = arenaId;
    document.querySelector('.eo-eyebrow').textContent = arenaId === 'eclipse' ? 'ECLIPSE FOUNDRY' : 'HEARTWOOD PIT';
    $$('eo-wave').textContent = stats.wave;
    const best = $$('eo-best');
    best.textContent = stats.newBest ? `NEW BEST · WAVE ${stats.best}` : `BEST WAVE ${stats.best}`;
    best.classList.toggle('new', !!stats.newBest);
    $$('eo-kills').textContent = stats.kills;
    const m = Math.floor(stats.seconds / 60), sec = Math.floor(stats.seconds % 60);
    $$('eo-time').textContent = `${m}:${String(sec).padStart(2, '0')}`;
    $$('eo-coins').textContent = stats.coins;
    $$('eo-gems').textContent = stats.gems;
    // callsign + submit, one entry per run
    const name = $$('eo-name'), submit = $$('eo-submit');
    name.value = leaderboard.getName();
    this.applyPortalName(name);
    const eligible = !stats.assisted && stats.wave >= 1;
    submit.disabled = !eligible;
    submit.textContent = stats.assisted ? 'TEST RUN · NOT RANKED' : 'SUBMIT WAVE';
    submit.onclick = async () => {
      if (!eligible || submit.disabled) return;
      submit.disabled = true;
      submit.textContent = 'SUBMITTED';
      const res = await leaderboard[arenaId].submit({ name: name.value, wave: stats.wave, kills: stats.kills,
        seconds: stats.seconds, assisted: stats.assisted });
      await this.renderEndlessBoard(res && res.entry, res && res.rows, arenaId);
    };
    this.renderEndlessBoard(null, null, arenaId);
    $$('eo-again').onclick = () => { this.hideEndlessOver(); onAgain(); };
    $$('eo-tower').onclick = () => { this.hideEndlessOver(); onTower(); };
    const over = $$('endless-over');
    over.hidden = false;
    over.classList.add('on');
    setTimeout(() => $$('eo-again').focus(), 60);
  }

  hideEndlessOver(){
    const over = document.getElementById('endless-over');
    if (!over) return;
    over.classList.remove('on');
    over.hidden = true;
  }

  /** Second Wind charges left this run; the row hides when the perk isn't owned. */
  setRevives(n){
    const row = document.getElementById('revive-row');
    if (!row) return;
    row.hidden = !(n > 0);
    document.getElementById('medkit').textContent = n;
  }
  setCounts({ biomass, vault, salvage }){
    if (biomass != null) this.el.biomass.textContent = biomass;
    if (vault   != null) this.el.vault.textContent   = vault;
    if (salvage != null) this.el.salvage.textContent = salvage;
  }

  /* pin the health bar under the character every frame */
  track(worldPos){
    this.anchor.set(worldPos.x, 0.02, worldPos.z);
    this.engine.project(this.anchor, this.p);
    this.el.php.style.transform = `translate(-50%,0) translate(${this.p.x}px,${this.p.y + 10}px)`;
    this.el.php.style.left = '0px';
    this.el.php.style.top  = '0px';
  }

  collectCoins(amount){
    if (!this.coinPop){
      this.coinPop = document.createElement('div'); this.coinPop.className = 'coin-pop';
      this.el.biomass.parentElement.appendChild(this.coinPop);
    }
    this.coinStreak = (this.coinStreak || 0) + amount;
    this.coinPop.textContent = `+${this.coinStreak} COINS`;
    this.coinPop.getAnimations().forEach(a => a.cancel());
    this.coinPop.animate([{opacity:1,transform:'translateY(0)'},{opacity:1,offset:0.65,transform:'translateY(-4px)'},{opacity:0,transform:'translateY(-14px)'}], {duration:1100,fill:'forwards'});
    this.el.biomass.getAnimations().forEach(a => a.cancel());
    this.el.biomass.animate([{transform:'scale(1.22)',color:'#ffe99d'},{transform:'scale(1)',color:'#ffffff'}], {duration:240});
    clearTimeout(this.coinTimer);
    this.coinTimer = setTimeout(() => { this.coinStreak = 0; }, 1100);
  }

  trackEnemies(enemies){
    this.enemyBars ||= [];
    let count = 0;
    // Refresh camera matrices before projecting HUD anchors.
    this.engine.camera.updateMatrixWorld();
    for (const e of enemies){
      if (!e.alive) continue;
      let bar = this.enemyBars[count];
      if (!bar){
        bar = document.createElement('div'); bar.className = 'enemy-hp';
        bar.appendChild(document.createElement('i'));
        this.el.hud.appendChild(bar); this.enemyBars.push(bar);
      }
      this.anchor.set(e.pos.x, e.key === 'lasher' ? 2.7 : e.def.radius * 2 + 0.75, e.pos.z);
      this.engine.project(this.anchor, this.p);
      bar.hidden = this.p.x < 0 || this.p.x > innerWidth || this.p.y < 0 || this.p.y > innerHeight;
      bar.style.transform = `translate(${this.p.x - 17}px,${this.p.y}px)`;
      bar.firstElementChild.style.transform = `scaleX(${Math.max(0, Math.min(1, e.hp / (e.maxHp || e.def.hp)))})`;
      count++;
    }
    for (let i = count; i < this.enemyBars.length; i++) this.enemyBars[i].hidden = true;
  }

  /* Toasts used to just overwrite each other: whichever call landed last won,
     with no regard for whether the previous one had anything left to say. That
     silently ate the mercy-bonus toast on every death retry — it fires, then
     the ordinary "FLOOR 6 · NAME" toast stomps it 0.75s later, well before its
     own 2.8s were up. Now a toast queues behind whatever is already showing
     instead of cutting it off. */
  toast(text, ms = 1900){
    this._toastQ = this._toastQ || [];
    if (this.el.toast.classList.contains('on')){
      this._toastQ.push({ text, ms });
      return;
    }
    this._showToast(text, ms);
  }

  _showToast(text, ms){
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      this.el.toast.classList.remove('on');
      const next = this._toastQ && this._toastQ.shift();
      if (next) setTimeout(() => this._showToast(next.text, next.ms), 260);   // a beat of blank between messages
    }, ms);
  }

  /* Press P for a frame-time readout — the only way to get a real number off
     a machine I can't profile from here. */
  perf(dt, engine){
    this._pa = (this._pa || 0) + dt; this._pn = (this._pn || 0) + 1;
    if (this._pa < 0.4) return;
    const fps = Math.round(this._pn / this._pa);
    const ms = (this._pa / this._pn * 1000).toFixed(1);
    this._pa = 0; this._pn = 0;
    this.el.perf.textContent = `${fps} FPS · ${ms}ms · Q${engine.quality} · ${Math.round(innerWidth * engine.renderer.getPixelRatio())}px`;
  }

  setMuted(on){
    this.el.snd.classList.toggle('off', on);
    this.el.snd.setAttribute('aria-label', on ? 'Turn sound on' : 'Mute sound');
    this.el.snd.setAttribute('aria-pressed', String(!on));
    this.el.snd.title = on ? 'Sound off · click to enable (M)' : 'Sound on · click to mute (M)';
  }

  togglePerf(){ this.el.perf.classList.toggle('on'); }

  setFlash(v){ this.el.flash.style.opacity = v; }

  /** Render the board; `mine` highlights the row just submitted. */
  async renderBoard(mine, rows){
    const list = document.getElementById('rs-list');
    rows = rows || await leaderboard.top(10);
    document.getElementById('rs-scope').textContent =
      leaderboard.shared ? 'GLOBAL' : 'THIS DEVICE';
    list.textContent = '';
    if (!rows || !rows.length){
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = rows ? 'No completed escapes yet — set the first time.'
                            : 'Leaderboard unreachable.';
      list.appendChild(li);
      return;
    }
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      if (mine && r.at === mine.at && r.name === mine.name) li.className = 'me';
      const rank = document.createElement('b'); rank.textContent = `${i + 1}.`;
      const nm = document.createElement('span'); nm.textContent = r.name;
      const t = document.createElement('i'); t.textContent = leaderboard.format(r.seconds);
      li.append(rank, nm, t);
      list.appendChild(li);
    });
  }

  showResults(stats, onAgain, onArenas){
    const $$ = id => document.getElementById(id);
    $$('rs-floors').textContent = stats.floors;
    $$('rs-kills').textContent  = stats.kills;
    $$('rs-coins').textContent  = stats.coins;
    if ($$('rs-gems')) $$('rs-gems').textContent = stats.gems ?? 0;
    const m = Math.floor(stats.seconds / 60), sec = Math.floor(stats.seconds % 60);
    $$('rs-time').textContent = `${m}:${String(sec).padStart(2,'0')}`;
    const name = $$('rs-name');
    const submit = $$('rs-submit');
    name.value = leaderboard.getName();
    this.applyPortalName(name);
    // only a full escape is a time worth ranking
    const eligible = !stats.assisted && stats.floors >= this.floorCount;
    submit.disabled = !eligible;
    submit.textContent = stats.assisted ? 'TEST RUN · NOT RANKED' : eligible ? 'SUBMIT TIME' : 'FINISH THE TOWER';
    submit.onclick = async () => {
      if (!eligible) return;
      submit.disabled = true;
      submit.textContent = 'SUBMITTED';
      const res = await leaderboard.submit({ ...stats, name: name.value, required: this.floorCount });
      await this.renderBoard(res && res.entry, res && res.rows);
    };
    this.renderBoard(null);

    const btn = $$('rs-again');
    btn.onclick = () => { this.hideResults(); onAgain(); };
    const pit = $$('rs-pit');
    if (pit){
      pit.hidden = !onArenas;
      pit.onclick = () => { this.hideResults(); onArenas?.(); };
    }
    const results = document.getElementById('results');
    results.hidden = false;
    results.classList.add('on');
  }
  hideResults(){
    const results = document.getElementById('results');
    if (!results) return;
    results.classList.remove('on');
    results.hidden = true;
  }

  setDead(on){ this.el.dead.classList.toggle('on', on); }

  ready(){
    this.el.bar.style.width = '100%';
    setTimeout(() => {
      this.el.boot.classList.add('gone');
      this.el.hud.classList.add('on');
    }, 340);
  }

  hideHint(){
    if (this._hinted) return;
    this._hinted = true;
    setTimeout(() => { this.el.hint.style.opacity = 0; }, 900);
  }
}
