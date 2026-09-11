import * as THREE from 'three';
import { emissive, PAL } from '../core/geo.js';
import { audio } from '../core/audio.js';

const MAX = 90, MAGNET = 4.2, GRAB = 0.55;   // MAGNET is scaled by magnetMul

/* Biomass. Drifts, then snaps to the player once they're close — the snap is
   what makes clearing a room feel like it paid out. */
export class Pickups {
  constructor(scene, { color = PAL.gold, size = 0.19, glow = 0.7, max = MAX } = {}){
    this.max = max;
    this.mesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(size, 0),
      emissive(color, glow), max
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.magnetMul = 1;
    this.valueMul = 1;

    this.list = Array.from({ length: max }, () => ({
      alive: false, value: 1, age: 0, homing: false, speed: 0, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0
    }));
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this._hide);
  }

  drop(pos, n = 1){
    for (let k = 0; k < n; k++){
      const p = this.list.find(p => !p.alive);
      if (!p){
        // Keep the reward when a crowded room fills the visual pool.
        this.list[0].value += n - k;
        return;
      }
      const a = Math.random() * Math.PI * 2, s = 1.4 + Math.random() * 1.6;
      p.alive = true; p.value = 1; p.age = 0; p.homing = false; p.speed = 0; p.t = Math.random() * 6.28;
      p.x = pos.x; p.y = 0.6; p.z = pos.z;
      p.vx = Math.sin(a) * s; p.vy = 3.2 + Math.random() * 1.4; p.vz = Math.cos(a) * s;
    }
  }

  get pending(){ return this.list.some(p => p.alive); }

  /** Collected reward units; each unit is worth five coins. */
  update(dt, player, sweep = false, bounds = null){
    let got = 0, dirty = false;
    for (let i = 0; i < this.max; i++){
      const p = this.list[i];
      if (!p.alive) continue;
      dirty = true;
      p.age += dt;
      p.t += dt * (p.homing ? 12 : 3.4);
      const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      // Once caught by the magnet, a pickup keeps following even while running.
      if (p.age > 0.16 && (sweep || d < MAGNET * this.magnetMul)) p.homing = true;
      if (p.homing){
        p.speed = Math.min(sweep ? 26 : 20, p.speed + 55 * dt);
        const step = Math.min(d, p.speed * dt);
        if (d <= GRAB + step){
          p.alive = false; got += p.value;
          this.mesh.setMatrixAt(i, this._hide);
          continue;
        }
        p.x += dx / d * step; p.z += dz / d * step;
        p.y += (0.65 - p.y) * (1 - Math.exp(-12 * dt));
      } else {
        p.vy -= 11 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.28){ p.y = 0.28; p.vy *= -0.34; }
        const drag = Math.exp(-3 * dt);
        p.vx *= drag; p.vz *= drag;
        if (bounds){
          p.x = Math.max(-bounds.x, Math.min(bounds.x, p.x));
          p.z = Math.max(-bounds.z, Math.min(bounds.z, p.z));
          // in the round pit a coin must not come to rest out behind the rim
          if (bounds.r){
            const d = Math.hypot(p.x, p.z);
            if (d > bounds.r){ p.x *= bounds.r / d; p.z *= bounds.r / d; }
          }
        }
      }
      this._e.set(p.t * 0.7, p.t, 0);
      this._q.setFromEuler(this._e);
      this._v.set(p.x, p.y + Math.sin(p.t) * 0.05, p.z);
      this._s.setScalar(p.homing ? 1 + Math.sin(p.t * 2) * 0.12 : 1);
      this._m.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
    if (got) audio.pickup(); // One rising chime per batch, not overlapping voices.
    return got;
  }

  clear(){
    for (let i = 0; i < this.max; i++){
      this.list[i].alive = false;
      this.mesh.setMatrixAt(i, this._hide);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
