import * as THREE from 'three';

/* The frag grenade — the one thing in VERDANT the player aims.

   Everything else is automatic, and the difficulty testing showed what that
   costs: almost every death is a surround that kills you in about two seconds,
   with nothing to press. The grenade is that button.

   Grenades are bought at the Armory on the floor where you'll use them (in the
   pit, between waves), and at most two can be thrown per floor. You pick the
   spot: drag from the button (or aim with the mouse), with time slowed while
   you do. A quick double-press throws at the thickest crowd instead. */

export const BLAST_R = 4.2;          // metres
export const THROW_RANGE = 10;
export const GRENADES_PER_FLOOR = 2;
export const GRENADE_PRICE = 80;     // coins, each
const FLIGHT = 0.55;                 // seconds in the air
const FUSE = 0.22;                   // seconds lying on the floor, blinking
const ARC_DOTS = 14;

/* The per-floor rules, kept apart from the rendering so they can be tested.

     - Bought on the floor: you can stock at most two, and never more than the
       throws you have left this floor (so you can't buy a grenade you can't use).
     - Two throws per floor attempt.
     - Unused grenades carry over if you die and retry the SAME floor — losing
       coins you just spent to one bad death would feel like a punishment — and
       are lost when you move to a new floor (or a new wave in the pit). */
export class NadeStock {
  constructor(){ this.stock = 0; this.uses = 0; this.floorKey = null; }
  /** A floor (or wave) starts. Same key = a retry: unused stock is kept. */
  enterFloor(key){
    if (key !== this.floorKey){ this.stock = 0; this.floorKey = key; }
    this.uses = 0;
  }
  reset(){ this.stock = 0; this.uses = 0; this.floorKey = null; }
  get canBuy(){ return this.stock + this.uses < GRENADES_PER_FLOOR; }
  buy(){ if (!this.canBuy) return false; this.stock++; return true; }
  get canThrow(){ return this.stock > 0 && this.uses < GRENADES_PER_FLOOR; }
  use(){ if (!this.canThrow) return false; this.stock--; this.uses++; return true; }
  get left(){ return GRENADES_PER_FLOOR - this.uses; }
}

/**
 * Where to throw: the point that catches the most living enemies in the blast,
 * among enemies within throwing range. Pure, so it can be tested headless.
 * @returns {{x:number, z:number, count:number}|null}
 */
export function blastCenter(list, from, range = THROW_RANGE, radius = BLAST_R){
  const near = [];
  for (const e of list){
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z);
    if (d <= range) near.push(e);
  }
  if (!near.length) return null;
  let best = null;
  // every enemy is a candidate centre; score by how many others it would catch,
  // weighting the elites a little so a crowd round a thornbeast wins a tie
  for (const c of near){
    let score = 0, count = 0;
    for (const o of near){
      if (Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) <= radius * 0.9){
        count++;
        score += o.def && o.def.hp >= 6 ? 1.4 : 1;
      }
    }
    if (!best || score > best.score) best = { x: c.pos.x, z: c.pos.z, count, score };
  }
  return { x: best.x, z: best.z, count: best.count };
}

export class Grenades {
  constructor(scene){
    this.scene = scene;
    const geo = new THREE.IcosahedronGeometry(0.2, 1);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.45, metalness: 0.5,
      emissive: 0xff5a1f, emissiveIntensity: 0.6 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 4);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    // the landing marker: a ring on the floor showing exactly what will be hit
    this.ring = new THREE.InstancedMesh(new THREE.RingGeometry(0.92, 1.0, 48),
      new THREE.MeshBasicMaterial({ color: 0xff8c42, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 4);
    this.ring.frustumCulled = false;
    this.ring.count = 0;
    this.ring.renderOrder = 3;
    scene.add(this.ring);
    this.live = [];

    // aiming: the blast ring where it will land, a faint circle for how far you
    // can throw, and a dotted arc from your hand so the throw reads as a lob
    // normal blending, not additive: additive washes out on the tower's pale floors
    const hot = { color: 0xff6a12, transparent: true, depthWrite: false, toneMapped: false };
    this.aim = new THREE.Group();
    this.aim.visible = false;
    this.aim.renderOrder = 4;
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ ...hot, opacity: 0.95 }));
    this.aimFill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ ...hot, opacity: 0.2 }));
    this.aimDot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ ...hot, opacity: 1 }));
    this.range = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 96), new THREE.MeshBasicMaterial({ ...hot, color: 0xffd2a8, opacity: 0.35 }));
    for (const m of [this.aimRing, this.aimFill, this.aimDot, this.range]){
      m.rotation.x = -Math.PI / 2; m.renderOrder = 4; m.frustumCulled = false; this.aim.add(m);
    }
    this.aimRing.scale.setScalar(BLAST_R); this.aimFill.scale.setScalar(BLAST_R);
    this.range.scale.setScalar(THROW_RANGE);
    this.arc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ ...hot, opacity: 0.9 }), ARC_DOTS);
    this.arc.frustumCulled = false; this.arc.renderOrder = 4;
    this.aim.add(this.arc);
    scene.add(this.aim);

    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(); this._flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  }

  throw(from, to){
    if (this.live.length >= 4) return false;
    this.live.push({ fx: from.x, fz: from.z, tx: to.x, tz: to.z, t: 0, spin: Math.random() * 6 });
    return true;
  }

  /** @returns {Array<{x:number, z:number}>} blasts that went off this frame */
  update(dt){
    const out = [];
    let n = 0;
    for (let i = this.live.length - 1; i >= 0; i--){
      const g = this.live[i];
      g.t += dt;
      if (g.t >= FLIGHT + FUSE){ out.push({ x: g.tx, z: g.tz }); this.live.splice(i, 1); }
    }
    for (const g of this.live){
      const k = Math.min(1, g.t / FLIGHT);
      // a lob: ease out across the floor, a parabola up and down
      const x = g.fx + (g.tx - g.fx) * k, z = g.fz + (g.tz - g.fz) * k;
      const y = 0.25 + 4 * k * (1 - k) * 2.6;
      this._p.set(x, y, z);
      this._q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), g.t * 12 + g.spin);
      this._s.setScalar(1);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(n, this._m);
      // the telegraph ring grows to the exact blast radius, faster once it lands
      const ringK = k < 1 ? k * 0.7 : 0.7 + Math.min(1, (g.t - FLIGHT) / FUSE) * 0.3;
      this._p.set(g.tx, 0.06, g.tz);
      this._s.setScalar(BLAST_R * ringK);
      this._m.compose(this._p, this._flat, this._s);
      this.ring.setMatrixAt(n, this._m);
      n++;
    }
    this.mesh.count = n;
    this.ring.count = n;
    // blink while it lies on the floor
    const blink = this.live.some(g => g.t > FLIGHT) ? (Math.sin(performance.now() / 40) > 0 ? 3.2 : 0.4) : 0.6;
    this.mat.emissiveIntensity = blink;
    if (n){ this.mesh.instanceMatrix.needsUpdate = true; this.ring.instanceMatrix.needsUpdate = true; }
    return out;
  }

  /** Draw the aim: where it lands (to), from where you stand (from). */
  showAim(from, to, t){
    this.aim.visible = true;
    const pulse = 1 + Math.sin(t * 9) * 0.035;
    this.aimRing.position.set(to.x, 0.07, to.z); this.aimRing.scale.setScalar(BLAST_R * pulse);
    this.aimFill.position.set(to.x, 0.065, to.z);
    this.aimDot.position.set(to.x, 0.075, to.z);
    this.range.position.set(from.x, 0.06, from.z);
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const h = Math.min(2.6, 0.8 + dist * 0.25);
    for (let i = 0; i < ARC_DOTS; i++){
      // dots crawl along the arc so it reads as motion, not a static line
      const k = ((i + (t * 2.2) % 1) / ARC_DOTS);
      this._p.set(from.x + (to.x - from.x) * k, 0.9 + 4 * k * (1 - k) * h - k * 0.8, from.z + (to.z - from.z) * k);
      this._s.setScalar(1 - k * 0.35);
      this._m.compose(this._p, this._q.identity(), this._s);
      this.arc.setMatrixAt(i, this._m);
    }
    this.arc.instanceMatrix.needsUpdate = true;
  }
  hideAim(){ this.aim.visible = false; }

  clear(){ this.live.length = 0; this.mesh.count = 0; this.ring.count = 0; this.hideAim(); }
}
