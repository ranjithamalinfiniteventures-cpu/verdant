/* Floor map. Deliberately a 2D canvas rather than a second camera: a minimap
   rendered in 3D means drawing the whole floor twice every frame, which is
   exactly the kind of cost a low-end phone cannot absorb. This costs nothing on
   the GPU and a fraction of a millisecond on the CPU, throttled to 12 Hz. */

const PAD = 6;

export class Minimap {
  constructor(parent){
    const wrap = document.createElement('div');
    wrap.id = 'minimap';
    const c = document.createElement('canvas');
    wrap.appendChild(c);
    parent.appendChild(wrap);

    this.wrap = wrap;
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.room = null;
    this.acc = 0;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this._resize();
    addEventListener('resize', () => { this._resize(); this.dirty = true; });
  }

  _resize(){
    const w = this.wrap.clientWidth || 150, h = this.wrap.clientHeight || 104;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;
    this.dirty = true;
  }

  setFloor(room){
    this.room = room;
    const b = room.bounds;
    // fit the floor into the panel, preserving aspect
    const sx = (this.w - PAD * 2) / (b.x * 2 + 2);
    const sy = (this.h - PAD * 2) / (b.z * 2 + 2);
    this.s = Math.min(sx, sy);
    this.ox = this.w / 2;
    this.oy = this.h / 2;
    this.dirty = true;
  }

  /** world -> panel pixels */
  px(x){ return this.ox + x * this.s; }
  py(z){ return this.oy + z * this.s; }

  update(dt, player, zones, activeRoom, cleared){
    if (!this.room) return;
    this.acc += dt;
    if (this.acc < 1 / 12 && !this.dirty) return;
    this.acc = 0; this.dirty = false;
    this.draw(player, zones, activeRoom, cleared);
  }

  draw(player, zones, activeRoom, cleared){
    const g = this.ctx, r = this.room, plan = r.plan;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);

    // corridor first, so rooms sit on top of it
    if (plan.corridor){
      const c = plan.corridor;
      g.fillStyle = 'rgba(120,160,175,.16)';
      g.fillRect(this.px(c.x0), this.py(c.z0), (c.x1 - c.x0) * this.s, (c.z1 - c.z0) * this.s);
    }

    plan.rooms.forEach((rm, i) => {
      const x = this.px(rm.x0), y = this.py(rm.z0);
      const w = (rm.x1 - rm.x0) * this.s, h = (rm.z1 - rm.z0) * this.s;
      const z = zones[i];
      const explored = z && z.started;
      g.fillStyle = explored ? (i === activeRoom ? 'rgba(96,196,214,.42)' : 'rgba(120,170,185,.22)')
                             : 'rgba(255,255,255,.05)';
      g.fillRect(x, y, w, h);
      g.strokeStyle = explored ? 'rgba(190,235,245,.75)' : 'rgba(255,255,255,.22)';
      g.lineWidth = i === activeRoom ? 1.6 : 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      // remaining growth in a room you've opened
      if (explored && z.budget > 0){
        g.fillStyle = 'rgba(232,121,249,.95)';
        g.font = '700 8px ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(String(z.budget), x + w / 2, y + h / 2 + 3);
      }
    });

    // doorways
    g.fillStyle = 'rgba(210,245,255,.8)';
    for (const l of plan.links){
      g.beginPath();
      g.arc(this.px(l.x), this.py(l.z), 1.7, 0, Math.PI * 2);
      g.fill();
    }

    // armory
    if (r.store){
      g.fillStyle = '#5ef2e0';
      g.fillRect(this.px(r.store.x) - 2.5, this.py(r.store.z) - 2.5, 5, 5);
    }

    // stairs — dim until the floor is clear, then it is the thing to head for
    const sx = this.px(r.stairs.x), sy = this.py(r.stairs.z);
    g.fillStyle = cleared ? '#4ade80' : 'rgba(245,197,24,.55)';
    g.beginPath();
    g.moveTo(sx, sy - 4); g.lineTo(sx + 3.6, sy + 2.4); g.lineTo(sx - 3.6, sy + 2.4);
    g.closePath(); g.fill();

    // player, with a facing tick
    const pxp = this.px(player.pos.x), pyp = this.py(player.pos.z);
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(pxp, pyp);
    g.lineTo(pxp + Math.sin(player.facing) * 6, pyp + Math.cos(player.facing) * 6);
    g.stroke();
    g.fillStyle = '#ff8c42';
    g.beginPath(); g.arc(pxp, pyp, 2.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke();
  }
}
