import * as THREE from 'three';
import { rbox, cyl, mat, emissive } from '../core/geo.js';
import { audio } from '../core/audio.js';

/* ---------------------------------------------------------------- roster --
   Every type exists to force a different way of moving. If a new enemy doesn't
   change where the player wants to stand, it isn't earning its place. */

const geoCache = new Map();
const G = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); };

export const TYPES = {
  /* walks straight at you and dies fast — teaches basic spacing */
  creeper: {
    hp: 3, speed: 2.35, radius: 0.46, dmg: 0.07, cd: 0.62, knock: 3.2, max: 40,
    color: 0xd946ef,
    parts: () => [
      { geo: G('c-body', () => new THREE.IcosahedronGeometry(0.42, 0)), mat: mat(0xd946ef, 0.42, 0, { flatShading: true }), y: 0.46, wob: 1 },
      { geo: G('c-bud',  () => new THREE.ConeGeometry(0.2, 0.5, 6)),    mat: mat(0xa21caf, 0.5, 0, { flatShading: true }), y: 0.86, wob: 1.3 },
      { geo: G('c-base', () => cyl(0.34, 0.42, 0.22, 10)),              mat: mat(0x5b1666, 0.7), y: 0.11 },
    ],
    think(e, ctx){ steerAt(e, ctx.px, ctx.pz, 14); },
  },

  /* Walks you down, plants its feet, then slams an arc. This replaces a rooted
     stalk that never moved — a stationary enemy reads as scenery, and the whole
     lesson (watch the ground, not just the crowd) survives being mobile. */
  stalker: {
    hp: 6, speed: 2.9, radius: 0.5, dmg: 0.12, cd: 1.0, knock: 2.2, max: 14,
    color: 0xa855f7, reach: 3.3, windup: 0.55, cycle: 1.5,
    parts: () => [
      { geo: G('st-body', () => rbox(0.84, 0.5, 1.2, 0.2)),
        mat: mat(0xa855f7, 0.42, 0, { flatShading: true }), y: 1.04, wob: 0.5 },
      { geo: G('st-head', () => new THREE.IcosahedronGeometry(0.34, 0)),
        mat: mat(0xc084fc, 0.4, 0, { flatShading: true }), y: 1.18, z: 0.64, wob: 0.9 },
      { geo: G('st-fin',  () => new THREE.ConeGeometry(0.22, 0.62, 5)),
        mat: mat(0x7e22ce, 0.5, 0, { flatShading: true }), y: 1.5, z: -0.24 },
      // four legs on opposite phases — a diagonal gait, so it reads as walking
      { geo: G('st-leg', () => cyl(0.09, 0.14, 1.05, 6)), mat: mat(0x581c87, 0.6), y: 0.52, x: -0.36, z:  0.32, leg: 0    },
      { geo: G('st-leg', () => cyl(0.09, 0.14, 1.05, 6)), mat: mat(0x581c87, 0.6), y: 0.52, x:  0.36, z:  0.32, leg: 0.5  },
      { geo: G('st-leg', () => cyl(0.09, 0.14, 1.05, 6)), mat: mat(0x581c87, 0.6), y: 0.52, x: -0.36, z: -0.32, leg: 0.5  },
      { geo: G('st-leg', () => cyl(0.09, 0.14, 1.05, 6)), mat: mat(0x581c87, 0.6), y: 0.52, x:  0.36, z: -0.32, leg: 0    },
    ],
    think(e, ctx, dt){
      e.t -= dt;
      const d = Math.hypot(ctx.px - e.pos.x, ctx.pz - e.pos.z);
      if (e.phase === 'wind'){
        // it plants itself to swing: the pause is the tell
        e.vel.multiplyScalar(0.82);
        if (e.t <= 0){
          e.phase = 'idle'; e.t = this.cycle;
          ctx.fx.ring(e.pos, { color: 0xffffff, from: 0.4, to: this.reach, life: 0.24 });
          ctx.fx.burst(e.pos, { count: 12, color: 0xd8b4fe, speed: 9, size: 0.11, life: 0.32, up: 0.6 });
          audio.lash();
          if (d < this.reach) ctx.hitPlayer(this.dmg);
        }
        return;
      }
      steerAt(e, ctx.px, ctx.pz, 12);
      if (d < this.reach * 0.85 && e.t <= 0){
        e.phase = 'wind'; e.t = this.windup;
        ctx.fx.ring(e.pos, { color: 0xa855f7, from: this.reach * 0.3, to: this.reach, life: this.windup });
      }
    },
  },

  /* rushes, then bursts into gas — teaches you not to kill everything point-blank */
  sporeling: {
    hp: 2, speed: 4.3, radius: 0.36, dmg: 0.04, cd: 0.9, knock: 4.5, max: 24,
    color: 0xa3e635, burst: { radius: 2.3, life: 3.4 },
    parts: () => [
      { geo: G('s-body', () => new THREE.DodecahedronGeometry(0.34, 0)), mat: mat(0xa3e635, 0.45, 0, { flatShading: true }), y: 0.42, wob: 1.5 },
      { geo: G('s-base', () => cyl(0.2, 0.3, 0.18, 8)),                  mat: mat(0x4d7c0f, 0.7), y: 0.09 },
    ],
    think(e, ctx){
      steerAt(e, ctx.px, ctx.pz, 22);
      if (Math.hypot(ctx.px - e.pos.x, ctx.pz - e.pos.z) < 1.35) ctx.detonate(e);
    },
    // NB: this receives the death *record* ({x,y,z,key}), not the live enemy —
    // by the time it runs the enemy is already being recycled
    onDeath(rec, ctx){ ctx.cloud(rec, this.burst.radius, this.burst.life); },
  },

  /* winds up, then charges in a straight line — teaches sidestep, never backpedal */
  thornbeast: {
    hp: 14, speed: 1.5, radius: 0.78, dmg: 0.16, cd: 1.0, knock: 1.1, max: 10,
    color: 0xbe185d, chargeSpeed: 13.5, windup: 0.72,
    parts: () => [
      { geo: G('t-body', () => rbox(1.15, 0.9, 1.45, 0.3)),            mat: mat(0xbe185d, 0.5, 0, { flatShading: true }), y: 0.6, wob: 0.6 },
      { geo: G('t-horn', () => new THREE.ConeGeometry(0.26, 0.9, 6)),  mat: mat(0xfda4af, 0.4), y: 0.7, z: 0.85, tipForward: true },
      { geo: G('t-base', () => cyl(0.62, 0.8, 0.24, 10)),              mat: mat(0x831843, 0.72), y: 0.12 },
    ],
    think(e, ctx, dt){
      e.t -= dt;
      const d = Math.hypot(ctx.px - e.pos.x, ctx.pz - e.pos.z);
      if (e.phase === 'stalk'){
        steerAt(e, ctx.px, ctx.pz, 8, this.speed);
        if (d < 9 && e.t <= 0){
          e.phase = 'wind'; e.t = this.windup;
          e.aimX = (ctx.px - e.pos.x) / (d || 1); e.aimZ = (ctx.pz - e.pos.z) / (d || 1);
          ctx.fx.ring(e.pos, { color: 0xfb7185, from: 0.9, to: 2.6, life: this.windup });
        }
      } else if (e.phase === 'wind'){
        e.vel.set(0, 0, 0);
        // keep tracking during the wind-up so the telegraph reads, then commit
        if (e.t > 0.22){ e.aimX = (ctx.px - e.pos.x) / (d || 1); e.aimZ = (ctx.pz - e.pos.z) / (d || 1); }
        if (e.t <= 0){ e.phase = 'charge'; e.t = 0.95; audio.charge(); ctx.shake(0.12); }
      } else if (e.phase === 'charge'){
        e.vel.set(e.aimX * this.chargeSpeed, 0, e.aimZ * this.chargeSpeed);
        if (e.t <= 0){ e.phase = 'rest'; e.t = 0.85; }
      } else {
        e.vel.multiplyScalar(0.9);
        if (e.t <= 0){ e.phase = 'stalk'; e.t = 1.1; }
      }
    },
  },

  /* stationary, keeps making Creepers — teaches priority targeting */
  bloomer: {
    hp: 16, speed: 0, radius: 0.72, dmg: 0.05, cd: 1.4, knock: 0, max: 6,
    color: 0xf472b6, rooted: true, spawnEvery: 3.1, maxKids: 3, senseRange: 15,
    parts: () => [
      { geo: G('b-bulb',  () => new THREE.IcosahedronGeometry(0.62, 1)), mat: mat(0xf472b6, 0.4, 0, { flatShading: true }), y: 0.72, wob: 0.8 },
      { geo: G('b-ring',  () => new THREE.TorusGeometry(0.8, 0.16, 6, 14)), mat: mat(0x9d174d, 0.6), y: 0.2, flat: true, spin: 0.7 },
      { geo: G('b-stem',  () => cyl(0.2, 0.34, 0.5, 8)),                 mat: mat(0x831843, 0.7), y: 0.25 },
    ],
    think(e, ctx, dt){
      e.vel.set(0, 0, 0);
      // A Bloomer only blooms when it senses you. Left alone in a room you have
      // walked out of, six of them would hold the floor's alive count at the cap
      // forever and the wave director could never finish spawning.
      if (Math.hypot(ctx.px - e.pos.x, ctx.pz - e.pos.z) > this.senseRange){ e.t = Math.max(e.t, 0.4); return; }
      e.t -= dt;
      if (e.t <= 0){
        const a = Math.random() * Math.PI * 2;
        const born = ctx.child('creeper', e.pos.x + Math.cos(a) * 1.5, e.pos.z + Math.sin(a) * 1.5, e);
        e.t = born ? this.spawnEvery : 0.6;      // retry soon if we were at the cap
        if (born) ctx.fx.ring(e.pos, { color: 0xf472b6, from: 0.5, to: 2.2, life: 0.4 });
      }
    },
  },

  /* runs away and plants more — teaches you that turtling loses */
  seeder: {
    hp: 4, speed: 3.4, radius: 0.42, dmg: 0.03, cd: 1.2, knock: 3.0, max: 10,
    color: 0xc026d3, plantEvery: 2.9, flee: 7.0, maxKids: 2,
    parts: () => [
      { geo: G('sd-body', () => new THREE.ConeGeometry(0.36, 0.85, 7)),  mat: mat(0xc026d3, 0.45, 0, { flatShading: true }), y: 0.48, wob: 1.2 },
      { geo: G('sd-pod',  () => new THREE.IcosahedronGeometry(0.24, 0)), mat: emissive(0xfae8ff, 0.5), y: 1.0, wob: 1.6 },
      { geo: G('sd-base', () => cyl(0.26, 0.36, 0.18, 8)),               mat: mat(0x701a75, 0.7), y: 0.09 },
    ],
    think(e, ctx, dt){
      const dx = e.pos.x - ctx.px, dz = e.pos.z - ctx.pz;
      const d = Math.hypot(dx, dz) || 1;
      if (d < this.flee) steerAt(e, e.pos.x + dx / d * 6, e.pos.z + dz / d * 6, 16, this.speed);
      else e.vel.multiplyScalar(0.86);
      e.t -= dt;
      if (e.t <= 0){
        const born = ctx.child('creeper', e.pos.x, e.pos.z, e);
        e.t = born ? this.plantEvery : 0.7;
        if (born) ctx.fx.ring(e.pos, { color: 0xfae8ff, from: 0.3, to: 1.8, life: 0.45 });
      }
    },
  },
};

function steerAt(e, tx, tz, acc, cap){
  if(e.route){tx=e.route.x;tz=e.route.z;}
  const dx = tx - e.pos.x, dz = tz - e.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  e.steerX = dx / d; e.steerZ = dz / d;
  e.acc = acc; e.cap = cap;
}

/* ------------------------------------------------------------------ pool --
   One instanced draw call per body part per type: the whole swarm costs about
   what a handful of meshes cost. */
class Pool {
  constructor(scene, key, def){
    this.key = key; this.def = def; this.max = def.max;
    this.parts = def.parts();
    this.meshes = this.parts.map(p => {
      const m = new THREE.InstancedMesh(p.geo, p.mat.clone(), def.max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true; m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    this.free = Array.from({ length: def.max }, (_, i) => def.max - 1 - i);
    this._hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < def.max; i++){
      this.meshes.forEach(m => m.setMatrixAt(i, this._hide));
      this.meshes[0].setColorAt(i, new THREE.Color(0xffffff));
    }
    this.dirty = true;
  }
  take(){ return this.free.length ? this.free.pop() : -1; }
  give(i){ this.meshes.forEach(m => m.setMatrixAt(i, this._hide)); this.free.push(i); this.dirty = true; }
  flush(){
    if (!this.dirty) return;
    this.meshes.forEach(m => m.instanceMatrix.needsUpdate = true);
    if (this.meshes[0].instanceColor) this.meshes[0].instanceColor.needsUpdate = true;
    this.dirty = false;
  }
}

/* --------------------------------------------------------------- clouds -- */
const MAX_CLOUD = 14;
class Clouds {
  constructor(scene){
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xa3e635, transparent: true, opacity: 0.26, depthWrite: false }),
      MAX_CLOUD
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.list = Array.from({ length: MAX_CLOUD }, () => ({ life: 0, max: 1, r: 2, x: 0, z: 0, t: 0, cd: 0 }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_CLOUD; i++) this.mesh.setMatrixAt(i, this._hide);
  }
  add(pos, r, life){
    const c = this.list.find(c => c.life <= 0) || this.list[0];
    c.x = pos.x; c.z = pos.z; c.r = r; c.max = c.life = life; c.t = Math.random() * 6.28; c.cd = 0;
  }
  /** @returns damage dealt to the player this frame */
  update(dt, px, pz){
    let dmg = 0;
    for (let i = 0; i < MAX_CLOUD; i++){
      const c = this.list[i];
      if (c.life <= 0){ continue; }
      c.life -= dt; c.t += dt;
      if (c.life <= 0){ this.mesh.setMatrixAt(i, this._hide); continue; }
      const k = Math.min(c.life / c.max, 1);
      const grow = 0.55 + 0.45 * Math.min(1, (c.max - c.life) / 0.4);
      const s = c.r * grow * (0.75 + k * 0.25);
      c.cd -= dt;
      if (c.cd <= 0 && Math.hypot(px - c.x, pz - c.z) < s){ c.cd = 0.7; dmg += 0.05; }
      this._e.set(c.t * 0.3, c.t * 0.45, 0);
      this._q.setFromEuler(this._e);
      this._v.set(c.x, 0.55, c.z);
      this._s.set(s, s * 0.55, s);
      this._m.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return dmg;
  }
  clear(){
    for (let i = 0; i < MAX_CLOUD; i++){ this.list[i].life = 0; this.mesh.setMatrixAt(i, this._hide); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* -------------------------------------------------------------- manager -- */
export class Enemies {
  constructor(scene){
    this.pools = {};
    for (const [k, def] of Object.entries(TYPES)) this.pools[k] = new Pool(scene, k, def);
    this.clouds = new Clouds(scene);
    this.list = [];
    this.external = [];   // non-pooled targets (the boss); see nearest()
    this.alive = 0;
    this.deaths = [];
    this.births = [];              // enemies created by other enemies
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(); this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  spawn(x, z, key = 'creeper', fromParent = false){
    const def = TYPES[key];
    if (!def) return null;
    const slot = this.pools[key].take();
    if (slot < 0) return null;
    const e = {
      key, def, slot, alive: true, hp: def.hp, maxHp: def.hp,
      damageScale: 1, flash: 0, cd: 0, die: 0, stuck: 0,
      wob: Math.random() * 6.28, t: key === 'thornbeast' ? 1.1 : (key === 'stalker' ? 0.8 : def.spawnEvery ?? def.plantEvery ?? 0),
      phase: key === 'thornbeast' ? 'stalk' : 'idle',
      steerX: 0, steerZ: 0, acc: 0, cap: null, aimX: 0, aimZ: 1, facing: 0,
      fromParent, parent: null, kids: 0,
      pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(),
    };
    this.list.push(e);
    this.alive++;
    return e;
  }

  hit(e, dmg, dirX, dirZ, fx){
    if (!e.alive) return false;
    e.hp -= dmg;
    e.flash = 0.09;
    e.vel.x += dirX * e.def.knock;
    e.vel.z += dirZ * e.def.knock;
    if (e.hp > 0){
      audio.hit();
      fx.burst(e.pos, { count: 5, color: 0xffb3f7, speed: 4.2, size: 0.09, life: 0.26, up: 1.8 });
      return false;
    }
    this._kill(e, fx);
    return true;
  }

  _kill(e, fx){
    e.alive = false; e.die = 0.22;
    this.alive--;
    if (e.parent) e.parent.kids = Math.max(0, e.parent.kids - 1);
    this.deaths.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, fromParent: e.fromParent, key: e.key });
    audio.kill();
    fx.burst(e.pos, { count: 16, color: e.def.color, speed: 6.5, size: 0.14, life: 0.5, up: 2.4 });
    fx.burst(e.pos, { count: 8, color: 0xfef08a, speed: 3.2, size: 0.09, life: 0.35, up: 3.0 });
    fx.ring(e.pos, { color: e.def.color, from: 0.35, to: e.def.radius * 5, life: 0.32 });
  }

  /** @returns total damage dealt to the player this frame */
  update(dt, player, fx, colliders, bounds, engine, hardCap = 40){
    let dealt = 0;
    const px = player.pos.x, pz = player.pos.z;

    const ctx = {
      px, pz, fx,
      hitPlayer: (d) => { dealt += d; },
      shake: (a) => engine?.addShake(a),
      /* An unbounded spawner makes a room mathematically unclearable, so a
         parent may only ever have maxKids alive at once, and nothing may push
         the room past a hard ceiling. */
      child: (key, x, z, parent) => {
        if (this.alive >= hardCap) return null;
        if (parent && parent.kids >= (parent.def.maxKids ?? 2)) return null;
        const c = this.spawn(
          Math.max(-bounds.x, Math.min(bounds.x, x)),
          Math.max(-bounds.z, Math.min(bounds.z, z)), key, true);
        if (c){ c.parent = parent || null; if (parent) parent.kids++; this.births.push(c); }
        return c;
      },
      cloud: (pos, r, life) => this.clouds.add(pos, r, life),
      detonate: (e) => { if (e.alive) this._kill(e, fx); },
    };

    for (let i = this.list.length - 1; i >= 0; i--){
      const e = this.list[i];
      const def = e.def;

      if (!e.alive){
        e.die -= dt;
        if (e.die > 0){ this._place(e, Math.max(e.die / 0.22, 0) ** 2); }
        else { this.pools[e.key].give(e.slot); this.list.splice(i, 1); }
        continue;
      }

      if (e.flash > 0) e.flash -= dt;
      if (e.cd > 0) e.cd -= dt;
      e.wob += dt * (def.rooted ? 3.2 : 7.5);

      e.steerX = 0; e.steerZ = 0; e.acc = 0; e.cap = null;
      def.think.call(def, e, ctx, dt);
      if (!e.alive) continue;                       // think() can kill it (sporeling)

      if (e.acc){
        // separation, so a swarm spreads into a crescent instead of single file
        let sx = 0, sz = 0;
        for (const o of this.list){
          if (o === e || !o.alive) continue;
          const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z;
          const od = ox*ox + oz*oz;
          if (od < 2.2 && od > 0.0001){ const inv = 1 / Math.sqrt(od); sx += ox * inv; sz += oz * inv; }
        }
        e.vel.x += (e.steerX + sx * 0.85) * e.acc * dt;
        e.vel.z += (e.steerZ + sz * 0.85) * e.acc * dt;
        const sp = Math.hypot(e.vel.x, e.vel.z);
        const cap = (e.cap ?? def.speed) * (e.flash > 0 ? 2.4 : 1);
        if (sp > cap){ const k = cap / sp; e.vel.x *= k; e.vel.z *= k; }
      }

      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;

      if (bounds){
        let hitWall = e.pos.x <= -bounds.x || e.pos.x >= bounds.x || e.pos.z <= -bounds.z || e.pos.z >= bounds.z;
        e.pos.x = Math.max(-bounds.x, Math.min(bounds.x, e.pos.x));
        e.pos.z = Math.max(-bounds.z, Math.min(bounds.z, e.pos.z));
        // round arena: the rim is a circle, and a thornbeast charging into it
        // has to stop there exactly as it would against a straight wall
        if (bounds.r){
          const d = Math.hypot(e.pos.x, e.pos.z), lim = bounds.r - def.radius * 0.5;
          if (d > lim){ e.pos.x *= lim / d; e.pos.z *= lim / d; hitWall = true; }
        }
        if (hitWall && e.phase === 'charge'){ e.phase = 'rest'; e.t = 0.85; ctx.shake(0.1); }
      }
      if (colliders && !def.rooted){
        const R = def.radius;
        for (const c of colliders){
          const cx = e.pos.x - c.x, cz = e.pos.z - c.z;
          const ox = c.hw + R - Math.abs(cx), oz = c.hd + R - Math.abs(cz);
          if (ox > 0 && oz > 0){
            if (ox < oz){ e.pos.x = c.x + Math.sign(cx || 1) * (c.hw + R); e.vel.x = 0; }
            else        { e.pos.z = c.z + Math.sign(cz || 1) * (c.hd + R); e.vel.z = 0; }
            if (e.phase === 'charge'){ e.phase = 'rest'; e.t = 0.85; }
          }
        }
      }

      const d = Math.hypot(px - e.pos.x, pz - e.pos.z);

      // nothing stays wedged
      if (!def.rooted){
        if (Math.hypot(e.vel.x, e.vel.z) < 0.4 && d > 1.6 && e.phase !== 'wind' && e.phase !== 'rest') e.stuck += dt;
        else e.stuck = 0;
        if (e.stuck > 1.3){
          e.stuck = 0;
          const nd = Math.hypot(e.pos.x, e.pos.z) || 1;
          e.pos.x -= (e.pos.x / nd) * 1.4;
          e.pos.z -= (e.pos.z / nd) * 1.4;
          e.vel.set(0, 0, 0);
        }
      }

      if (def.cd < 900 && d < def.radius + 0.5 && e.cd <= 0){
        e.cd = def.cd;
        dealt += def.dmg;
        if (e.phase === 'charge'){ e.phase = 'rest'; e.t = 0.85; }
        if (!def.rooted){ e.vel.x -= (px - e.pos.x) / (d || 1) * 5; e.vel.z -= (pz - e.pos.z) / (d || 1) * 5; }
        fx.burst(e.pos, { count: 4, color: 0xff6b6b, speed: 3, size: 0.08, life: 0.22 });
      }

      if (e.acc || !def.rooted) e.facing = Math.atan2(px - e.pos.x, pz - e.pos.z);
      // walk phase is driven by actual movement, so legs stop when the body does
      const moved = Math.hypot(e.vel.x, e.vel.z);
      e.gaitSpeed = Math.min(1, moved / (def.speed || 1));
      e.gait = (e.gait || 0) + dt * (2.5 + e.gaitSpeed * 12);
      this._place(e, 1);
    }

    for (const d of this.deaths){
      const def = TYPES[d.key];
      if (def?.onDeath && !d._done){ d._done = true; def.onDeath.call(def, d, ctx); }
    }

    dealt += this.clouds.update(dt, px, pz);
    for (const p of Object.values(this.pools)) p.flush();
    return dealt;
  }

  _place(e, scale){
    const def = e.def, pool = this.pools[e.key];
    pool.dirty = true;
    const wobA = Math.sin(e.wob);
    const charging = e.phase === 'charge';
    const winding  = e.phase === 'wind';
    const squash = winding ? 1 + Math.sin(e.wob * 4) * 0.12 : 1;
    // parts can now sit off the centre line, so local->world needs a real rotation
    const sinF = Math.sin(e.facing), cosF = Math.cos(e.facing);
    const gait = e.gait || 0, gspd = e.gaitSpeed || 0;

    for (let pi = 0; pi < pool.parts.length; pi++){
      const p = pool.parts[pi];
      const bob = p.wob ? wobA * 0.07 * p.wob * scale : 0;
      const tilt = p.wob ? Math.cos(e.wob * 0.5) * 0.14 : 0;

      let ox = p.x || 0, oz = p.z || 0, oy = p.y + bob, legTilt = 0;
      if (p.leg !== undefined){
        // stride fore/aft, lift on the forward half, and lean into the step
        const ph = gait + p.leg * Math.PI * 2;
        oz += Math.sin(ph) * 0.34 * (0.2 + gspd * 0.8);
        oy += Math.max(0, Math.sin(ph)) * 0.17 * gspd;
        legTilt = Math.cos(ph) * 0.32 * gspd;
      }

      this._e.set(
        p.flat ? -Math.PI / 2 : tilt * 0.5 + legTilt,
        p.spin ? e.wob * p.spin : e.facing,
        p.flat ? 0 : tilt
      );
      this._q.setFromEuler(this._e);
      this._v.set(
        e.pos.x + ox * cosF + oz * sinF,
        oy * (charging ? 0.86 : 1),
        e.pos.z - ox * sinF + oz * cosF
      );
      const sc = scale * squash;
      this._s.set(sc, sc * (charging ? 0.86 : 1) * (1 - Math.abs(bob) * 1.1), sc);
      this._m.compose(this._v, this._q, this._s);
      pool.meshes[pi].setMatrixAt(e.slot, this._m);
    }
    const f = e.flash > 0 ? 1 : (winding ? 0.45 : 0);
    this._c.setRGB(1 + f * 5, 1 + f * 5, 1 + f * 5);
    pool.meshes[0].setColorAt(e.slot, this._c);
  }

  clear(){
    for (const e of this.list) this.pools[e.key].give(e.slot);
    this.list.length = 0;
    this.alive = 0;
    this.deaths.length = 0;
    this.births.length = 0;
    this.clouds.clear();
    for (const p of Object.values(this.pools)){ p.dirty = true; p.flush(); }
  }

  nearest(pos, maxDist){
    let best = null, bd = maxDist * maxDist;
    for (const e of this.list){
      if (!e.alive) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      const d = dx*dx + dz*dz;
      if (d < bd){ bd = d; best = e; }
    }
    /* Targets that are not pooled instances — currently just the boss. Kept in a
       separate list so the hot per-frame loops over `list` stay untouched. */
    for (const e of this.external){
      if (!e.alive) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      const d = dx*dx + dz*dz;
      if (d < bd){ bd = d; best = e; }
    }
    return best;
  }
}
