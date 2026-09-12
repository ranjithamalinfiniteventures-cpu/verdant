import * as THREE from 'three';
import { audio } from '../core/audio.js';

const EMPTY = [];   // boss-less callers (and tests) pass no `external` list
const MAX_BOLTS = 56;

export const GUNS = [
  { id:'laser', name:'PRUNING LASER', price:0, damage:1, fireRate:6.2, range:9.2, boltSpeed:46, spread:0.035, color:0x9ff5ff, scale:[1,1,1.35], recoil:0.16, description:'Precise cyan streaks · crisp sliding recoil' },
  { id:'scatter', name:'EMBER SCATTER', price:1250, damage:0.85, fireRate:1.8, range:7, boltSpeed:34, spread:0.38, pellets:5, color:0xffa34d, scale:[1.4,1.4,0.45], recoil:0.32, description:'Five fiery pellets · heavy barrel kick' },
  { id:'rapid', name:'NEEDLE DRIVE', price:3000, damage:0.65, fireRate:13, range:8.5, boltSpeed:52, spread:0.09, color:0xa3ff82, scale:[0.65,0.65,0.8], recoil:0.1, description:'Rapid green needles · spinning barrel' },
  { id:'rail', name:'VIOLET RAIL', price:5500, damage:5.8, fireRate:1.35, range:13, boltSpeed:85, spread:0, pierce:true, color:0xd8a4ff, scale:[0.85,0.85,3], recoil:0.28, description:'Piercing violet lance · charging pulse' },
  { id:'plasma', name:'SOLAR PLASMA', price:9000, damage:3.6, fireRate:1.9, range:9, boltSpeed:23, spread:0, splash:2.1, color:0xffdc66, scale:[3,3,0.32], recoil:0.25, description:'Pulsing gold orbs · expanding impact ring' }
];
export const PRUNING_LASER = GUNS[0];

/* How a gun *feels*, separate from what it does. Same stats with a different
   feel profile read as completely different weapons in the hand. */
const FEEL = {
  laser:   { flash:  7, shake: 0.030, ring: 0,
             muzzle: { count:  5, size: 0.11, speed:  6, life: 0.14, spread: 0.8 },
             impact: { count:  5, size: 0.07, speed:  5, life: 0.16 } },
  scatter: { flash: 17, shake: 0.170, ring: 1.1,
             muzzle: { count: 18, size: 0.17, speed: 12, life: 0.28, spread: 1.6 },
             impact: { count:  8, size: 0.10, speed:  6, life: 0.20 } },
  rapid:   { flash:  4, shake: 0.010, ring: 0,
             muzzle: { count:  3, size: 0.07, speed:  5, life: 0.09, spread: 0.6 },
             impact: { count:  3, size: 0.05, speed:  4, life: 0.12 } },
  rail:    { flash: 24, shake: 0.260, ring: 2.0,
             muzzle: { count: 11, size: 0.10, speed: 17, life: 0.30, spread: 0.22 },
             impact: { count: 13, size: 0.10, speed:  9, life: 0.30 } },
  plasma:  { flash: 15, shake: 0.130, ring: 1.3,
             muzzle: { count: 10, size: 0.18, speed:  4, life: 0.30, spread: 1.2 },
             impact: { count: 11, size: 0.14, speed:  5, life: 0.34 } },
};
const feelOf = id => FEEL[id] || FEEL.laser;

/* Does a wall stand between these two points? A 2D slab clip per collider,
   written without allocating: it runs for a handful of candidate targets every
   frame. Only colliders flagged `blocksShots` (walls) count. */
export function shotBlocked(colliders, x0, z0, x1, z1){
  const dx = x1 - x0, dz = z1 - z0;
  for (let i = 0; i < colliders.length; i++){
    const c = colliders[i];
    if (!c.blocksShots) continue;
    let t0 = 0, t1 = 1;
    // x slab
    if (Math.abs(dx) < 1e-6){
      if (x0 < c.x - c.hw || x0 > c.x + c.hw) continue;
    } else {
      let ta = (c.x - c.hw - x0) / dx, tb = (c.x + c.hw - x0) / dx;
      if (ta > tb){ const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    // z slab
    if (Math.abs(dz) < 1e-6){
      if (z0 < c.z - c.hd || z0 > c.z + c.hd) continue;
    } else {
      let ta = (c.z - c.hd - z0) / dz, tb = (c.z + c.hd - z0) / dz;
      if (ta > tb){ const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}

/* Auto-fire: the player never aims. The weapon picks the nearest target in range
   and the character turns to face it, which is what frees the whole input budget
   for movement. */
export class Weapon {
  constructor(scene, spec = PRUNING_LASER){
    this.baseSpec = spec;
    this.baseLevel = 1;
    this.runMods = { damage:1, fireRate:1, projectile:1, pellets:0, pierce:0, crit:0 };
    this.spec = spec;
    this.cd = 0;

    // At this camera height a thin bolt is invisible. It has to be fat and
    // over-bright so bloom picks it up and the shot actually reads as a shot.
    const geo = new THREE.BoxGeometry(0.17, 0.17, 1.7);
    this.boltGeo = geo;
    this.plasmaGeo = new THREE.IcosahedronGeometry(0.17, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_BOLTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);

    this.bolts = Array.from({ length: MAX_BOLTS }, () => ({
      alive: false, life: 0, hit: new Set(), pos: new THREE.Vector3(), dir: new THREE.Vector3()
    }));

    // one pulsed light for every shot — sells the muzzle far better than a sprite
    this.flash = new THREE.PointLight(0x9ff5ff, 0, 5.5, 2);
    scene.add(this.flash);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 0, 1);
    this._hide = new THREE.Matrix4().makeScale(0, 0, 0);
    this._muzzle = new THREE.Vector3();
    this._boltScale = new THREE.Vector3(1, 1, 1.35);
    for (let i = 0; i < MAX_BOLTS; i++) this.mesh.setMatrixAt(i, this._hide);
  }

  equip(spec, level = 1){
    this.clear();
    this.baseSpec = spec;
    this.baseLevel = level;
    this.applyStats();
    this.mesh.geometry = spec.id === 'plasma' ? this.plasmaGeo : this.boltGeo;
    this.mesh.material.color.set(spec.color);
    this.flash.color.set(spec.color);
    this._boltScale.set(...spec.scale);
    this.cd = 0;
  }

  applyStats(){
    const spec = this.baseSpec;
    this.spec = {
      ...spec,
      damage: spec.damage * (1 + (this.baseLevel - 1) * 0.25) * this.runMods.damage,
      fireRate: spec.fireRate * this.runMods.fireRate,
      range: spec.range * this.runMods.projectile,
      boltSpeed: spec.boltSpeed * this.runMods.projectile,
      // a gun with one barrel still splits once SPLIT SHOT is taken
      pellets: (spec.pellets || 1) + this.runMods.pellets > 1
        ? (spec.pellets || 1) + this.runMods.pellets : undefined,
      spread: spec.spread || (this.runMods.pellets ? 0.22 : 0),
      pierceBudget: (spec.pierce ? 99 : 0) + this.runMods.pierce
    };
  }

  /* Floor upgrades are temporary now, so applying one has to be exactly
     undoable. Returning a delta rather than snapshotting the whole mod block
     keeps two overlapping buffs independent: reverting the first must not roll
     back the second. Multiplicative fields divide out, additive ones subtract.
     `crit` records the delta it actually got after its clamp, so expiring at
     the cap gives back only what it added. */
  addRunUpgrade(id){
    const m = this.runMods;
    const d = { damage:1, fireRate:1, projectile:1, pellets:0, pierce:0, crit:0 };
    if (id === 'power')     d.damage     = 1.12;
    if (id === 'overclock') d.fireRate   = 1.10;
    if (id === 'velocity')  d.projectile = 1.12;
    if (id === 'split')     d.pellets    = 1;
    if (id === 'pierce')    d.pierce     = 1;
    if (id === 'crit')      d.crit       = Math.min(0.6, m.crit + 0.2) - m.crit;
    m.damage     *= d.damage;
    m.fireRate   *= d.fireRate;
    m.projectile *= d.projectile;
    m.pellets    += d.pellets;
    m.pierce     += d.pierce;
    m.crit       += d.crit;
    this.applyStats();
    return d;
  }

  /* Apply an arbitrary set of stat deltas and return them, so the caller can
     hand the same object back to removeRunUpgrade later. The boss wildcards use
     this: they are one-off combinations rather than entries in the upgrade
     table, but they have to be exactly as reversible. */
  applyRunMods(d){
    const full = {
      damage:     d.damage     ?? 1,
      fireRate:   d.fireRate   ?? 1,
      projectile: d.projectile ?? 1,
      pellets:    d.pellets    ?? 0,
      pierce:     d.pierce     ?? 0,
      crit:       d.crit       ?? 0,
    };
    const m = this.runMods;
    m.damage     *= full.damage;
    m.fireRate   *= full.fireRate;
    m.projectile *= full.projectile;
    m.pellets    += full.pellets;
    m.pierce     += full.pierce;
    m.crit       += full.crit;
    this.applyStats();
    return full;
  }

  removeRunUpgrade(d){
    if (!d) return;
    const m = this.runMods;
    m.damage     /= d.damage;
    m.fireRate   /= d.fireRate;
    m.projectile /= d.projectile;
    m.pellets    -= d.pellets;
    m.pierce     -= d.pierce;
    m.crit        = Math.max(0, m.crit - d.crit);
    this.applyStats();
  }

  resetRunUpgrades(){
    this.runMods = { damage:1, fireRate:1, projectile:1, pellets:0, pierce:0, crit:0 };
    this.applyStats();
  }

  /** @returns {number} kills this frame */
  update(dt, player, enemies, fx, engine, bounds, colliders = []){
    const S = this.spec;
    this.cd -= dt;
    this.flash.intensity *= Math.pow(0.0005, dt);

    /* Prefer something we can actually hit. Without this, a wall between you
       and the nearest growth means standing there shooting the wall while it
       walks around; the fallback keeps the gun firing when nothing is clear,
       because a silent gun reads as a broken one. */
    const target = enemies.nearest(player.pos, S.range,
      e => !shotBlocked(colliders, player.pos.x, player.pos.z, e.pos.x, e.pos.z));
    player.aim = target ? target.pos : null;

    if (target && this.cd <= 0){
      this.cd = 1 / S.fireRate;

      player.group.updateMatrixWorld(true);
      player.muzzle.getWorldPosition(this._muzzle);

      const dx = target.pos.x - this._muzzle.x;
      const dz = target.pos.z - this._muzzle.z;
      const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * S.spread;

      for (let j = 0; j < (S.pellets || 1); j++){
        const b = this.bolts.find(b => !b.alive);
        if (!b) break;
        const angle = a + (S.pellets ? (j / (S.pellets - 1) - 0.5) * S.spread : 0);
        b.alive = true; b.life = S.range / S.boltSpeed; b.hit.clear();
        b.pierce = S.pierceBudget || 0;
        b.pos.copy(this._muzzle);
        b.dir.set(Math.sin(angle), 0, Math.cos(angle));
      }

      const F = feelOf(S.id);
      this.flash.position.copy(this._muzzle);
      this.flash.intensity = F.flash;
      fx.burst(this._muzzle, {
        count: F.muzzle.count, color: S.color, speed: F.muzzle.speed,
        size: F.muzzle.size, life: F.muzzle.life,
        grav: 0, up: 0.2, spread: F.muzzle.spread, dir: { x: Math.sin(a), z: Math.cos(a) }
      });
      // a blast ring at the muzzle is what makes the heavy guns feel heavy
      if (F.ring) fx.ring(this._muzzle, { color: S.color, from: 0.25, to: F.ring, life: 0.22 });
      audio.gun(S.id);
      engine.addShake(F.shake);
      player.recoil = S.recoil;
    }

    let kills = 0;
    const steps = Math.max(2, Math.ceil(S.boltSpeed * dt / 0.25));
    const step = S.boltSpeed * dt / steps;

    for (let i = 0; i < MAX_BOLTS; i++){
      const b = this.bolts[i];
      if (!b.alive){ continue; }

      b.life -= dt;
      let dead = b.life <= 0;

      for (let s = 0; s < steps && !dead; s++){
        b.pos.addScaledVector(b.dir, step);
        if(colliders.some(c => c.blocksShots && Math.abs(b.pos.x-c.x)<c.hw+.08 && Math.abs(b.pos.z-c.z)<c.hd+.08)){dead=true;break;}

        for (const e of enemies.list){
          if (!e.alive || b.hit.has(e)) continue;
          const dx = e.pos.x - b.pos.x, dz = e.pos.z - b.pos.z;
          if (dx*dx + dz*dz < (e.def.radius + 0.09) ** 2){
            b.hit.add(e);
            const crit = this.runMods.crit > 0 && Math.random() < this.runMods.crit;
            if (crit) fx.ring(b.pos, { color: 0xffffff, from: 0.15, to: 1.1, life: 0.2 });
            if (enemies.hit(e, S.damage * (crit ? 2 : 1), b.dir.x, b.dir.z, fx)){
              kills++;
              engine.addShake(0.09);
            }
            const FI = feelOf(S.id).impact;
            fx.burst(b.pos, {
              count: FI.count, color: 0xffffff, speed: FI.speed, size: FI.size, life: FI.life,
              grav: 2, up: 0.6, spread: 1.6, dir: { x: -b.dir.x, z: -b.dir.z }
            });
            audio.impactFor(S.id);
            if (S.splash){
              fx.ring(b.pos, { color:S.color, from:0.2, to:S.splash, life:0.4 });
              for (const other of enemies.list){
                if (other !== e && other.alive && Math.hypot(other.pos.x-b.pos.x, other.pos.z-b.pos.z) < S.splash)
                  if (enemies.hit(other, S.damage * 0.65, b.dir.x, b.dir.z, fx)) kills++;
              }
            }
            if (b.pierce > 0) b.pierce--; else dead = true;
            if (dead) break;
          }
        }
        /* Non-pooled targets (the boss). Separate loop so the pooled path above
           stays exactly as it was; `external` is empty on every normal floor. */
        for (const x of enemies.external || EMPTY){
          if (!x.alive || b.hit.has(x)) continue;
          const ddx = x.pos.x - b.pos.x, ddz = x.pos.z - b.pos.z;
          if (ddx*ddx + ddz*ddz < (x.def.radius + 0.09) ** 2){
            b.hit.add(x);
            const crit = this.runMods.crit > 0 && Math.random() < this.runMods.crit;
            if (crit) fx.ring(b.pos, { color: 0xffffff, from: 0.15, to: 1.1, life: 0.2 });
            if (x.takeHit(S.damage * (crit ? 2 : 1), fx)){
              kills++;
              engine.addShake(0.4);
            }
            const FX = feelOf(S.id).impact;
            fx.burst(b.pos, {
              count: FX.count, color: 0xffffff, speed: FX.speed, size: FX.size, life: FX.life,
              grav: 2, up: 0.6, spread: 1.6, dir: { x: -b.dir.x, z: -b.dir.z }
            });
            audio.impactFor(S.id);
            // the boss is one solid mass: piercing does not carry through it
            dead = true;
            break;
          }
        }
        if (dead) break;
        if (Math.abs(b.pos.x) > bounds.x + 1 || Math.abs(b.pos.z) > bounds.z + 1) dead = true;
        if (bounds.r && Math.hypot(b.pos.x, b.pos.z) > bounds.r + 1.2) dead = true;   // the round pit's rim
      }

      if (dead){
        b.alive = false;
        this.mesh.setMatrixAt(i, this._hide);
        continue;
      }

      this._q.setFromUnitVectors(this._up, b.dir);
      this._v.set(b.pos.x, b.pos.y, b.pos.z);
      if (S.id === 'plasma') this._boltScale.setScalar(2.7 + Math.sin(b.life * 45) * 0.5);
      this._m.compose(this._v, this._q, this._boltScale);
      this.mesh.setMatrixAt(i, this._m);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    return kills;
  }

  clear(){
    for (let i = 0; i < MAX_BOLTS; i++){
      this.bolts[i].alive = false;
      this.mesh.setMatrixAt(i, this._hide);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
