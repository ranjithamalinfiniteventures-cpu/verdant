import { buildGun } from './gun-designs.js';
import * as THREE from 'three';
import { rbox, mat, emissive, PAL, blobTexture } from '../core/geo.js';
import { audio } from '../core/audio.js';

const MAX_SPEED = 7.6;   // m/s
const ACCEL     = 62;
const DRAG      = 0.0009; // per-second retention factor when there is no input
const TURN      = 16;     // facing responsiveness

export class Player {
  constructor(scene){
    this.pos = new THREE.Vector3(0, 0, 4);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.hp = 1;
    this.speedMul = 1;
    this.shield = 0;      // hits absorbed before health is touched
    this.armor = 1;       // incoming damage multiplier, from Seed Vault plating
    this.t = 0;
    this.aim = null;        // set by the weapon each frame
    this.recoil = 0;
    this.invuln = 0;
    this.hitFlash = 0;
    this.mats = [];

    const g = new THREE.Group();
    g.scale.setScalar(1.28);
    this.group = g;
    this.body  = new THREE.Group();   // bobs and leans; g only translates
    g.add(this.body);

    const suit  = mat(0x232b36, 0.6);
    const dark  = mat(0x1b222b, 0.7);
    const skin  = mat(PAL.orange, 0.55);
    const glass = mat(0x7dd3fc, 0.22, 0.1, { emissive: 0x38bdf8, emissiveIntensity: 0.55 });

    // each part gets its own material so a damage flash can tint the player
    // without touching every prop that shares the cached one
    const put = (geo, m, x, y, z) => {
      const mine = m.clone();
      this.mats.push({ m: mine, base: mine.emissive.clone() });
      const mesh = new THREE.Mesh(geo, mine);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.body.add(mesh);
      return mesh;
    };

    // legs
    this.legL = put(rbox(0.24, 0.46, 0.26, 0.08), dark, -0.17, 0.23, 0);
    this.legR = put(rbox(0.24, 0.46, 0.26, 0.08), dark,  0.17, 0.23, 0);
    // torso + chest band
    put(rbox(0.66, 0.72, 0.46, 0.13), suit, 0, 0.80, 0);
    put(rbox(0.68, 0.16, 0.48, 0.05), skin, 0, 0.76, 0);
    // backpack
    put(rbox(0.46, 0.5, 0.26, 0.09), dark, 0, 0.86, -0.31);
    // helmet + visor
    put(rbox(0.46, 0.4, 0.44, 0.14), skin, 0, 1.36, 0);
    put(rbox(0.30, 0.18, 0.06, 0.03), glass, 0, 1.36, 0.23);
    this.gunModels = new Map();
    this.equipGun('laser', 0x9ff5ff);

    // contact shadow — grounds the character even where the sun shadow is soft
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.95 })
    );
    blob.rotation.x = -Math.PI/2;
    blob.position.y = 0.015;
    blob.renderOrder = 2;
    g.add(blob);
    this.blob = blob;

    scene.add(g);
  }

  equipGun(id, color){
    if (this.gun) this.body.remove(this.gun);
    if (!this.gunModels.has(id)) this.gunModels.set(id, buildGun(id, color));
    const model = this.gunModels.get(id);
    this.gun = model.group; this.muzzle = model.muzzle; this.gunRotor = model.rotor; this.gunStyle = id;
    this.gun.position.set(0.36, 0.86, 0.26);
    this.body.add(this.gun);
  }

  heal(fraction){ this.hp = Math.min(1, this.hp + fraction); }

  takeDamage(amount){
    if (this.invuln > 0 || this.hp <= 0) return false;
    // a shield charge eats the whole hit, so it is worth having against a big one
    if (this.shield > 0){
      this.shield--;
      this.invuln = 0.55;
      this.hitFlash = 0.3;
      this.shieldBroke = true;
      return true;
    }
    this.hp = Math.max(0, this.hp - amount * this.armor);
    this.invuln = 0.55;
    this.hitFlash = 0.3;
    return true;
  }

  update(dt, dir, bounds, colliders){
    this.t += dt;
    if (this.invuln > 0) this.invuln -= dt;

    // screen-space input -> world (camera looks down -Z, so screen-up is -Z)
    const ax = dir.x, az = -dir.y;
    const moving = dir.lengthSq() > 0.0001;

    if (moving){
      this.vel.x += ax * ACCEL * dt;
      this.vel.z += az * ACCEL * dt;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const cap = MAX_SPEED * this.speedMul;
      if (sp > cap){ const k = cap / sp; this.vel.x *= k; this.vel.z *= k; }
    } else {
      const k = Math.pow(DRAG, dt);
      this.vel.x *= k; this.vel.z *= k;
    }

    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -bounds.x, bounds.x);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -bounds.z, bounds.z);
    // kill residual velocity when we're pinned against a wall
    if (Math.abs(this.pos.x) === bounds.x) this.vel.x = 0;
    if (Math.abs(this.pos.z) === bounds.z) this.vel.z = 0;
    // a round arena clamps to its circle, and only the outward part of the
    // velocity is killed — so you slide round the rim instead of sticking to it
    if (bounds.r){
      const d = Math.hypot(this.pos.x, this.pos.z);
      if (d > bounds.r){
        const nx = this.pos.x / d, nz = this.pos.z / d;
        this.pos.x = nx * bounds.r; this.pos.z = nz * bounds.r;
        const out = this.vel.x * nx + this.vel.z * nz;
        if (out > 0){ this.vel.x -= out * nx; this.vel.z -= out * nz; }
      }
    }

    // push out of props along whichever axis is the shallower overlap, so the
    // player slides along a crate instead of catching on it
    if (colliders){
      const R = 0.38;
      for (const c of colliders){
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
        const ox = c.hw + R - Math.abs(dx), oz = c.hd + R - Math.abs(dz);
        if (ox > 0 && oz > 0){
          if (ox < oz){ this.pos.x = c.x + Math.sign(dx || 1) * (c.hw + R); this.vel.x = 0; }
          else        { this.pos.z = c.z + Math.sign(dz || 1) * (c.hd + R); this.vel.z = 0; }
        }
      }
    }

    this.group.position.copy(this.pos);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    const ratio = speed / (MAX_SPEED * this.speedMul);

    // face the target if the weapon has one, otherwise face where we're going.
    // This is the whole point of auto-fire: movement and aim are decoupled.
    const want = this.aim
      ? Math.atan2(this.aim.x - this.pos.x, this.aim.z - this.pos.z)
      : null;
    if (want !== null || speed > 0.35){
      const w = want !== null ? want : Math.atan2(this.vel.x, this.vel.z);
      let d = w - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, TURN * dt);
    }
    this.body.rotation.y = this.facing;

    /* Run cycle. The phase is ACCUMULATED rather than derived from t*speed —
       otherwise changing pace jumps the legs, and a footstep can never be tied
       to the moment a foot actually plants. */
    this.stepPhase = (this.stepPhase || 0) + dt * 13 * ratio;
    const cyc = this.stepPhase;
    // one step per half cycle, exactly when a foot is down
    const half = Math.floor(cyc / Math.PI);
    if (ratio > 0.22 && half !== this._lastStep){
      if (this._lastStep !== undefined) audio.step(ratio, half & 1);
      this._lastStep = half;
    }
    this.body.position.y = Math.abs(Math.sin(cyc)) * 0.07 * ratio;
    this.body.rotation.x = ratio * 0.10;
    this.legL.position.z =  Math.sin(cyc) * 0.19 * ratio;
    this.legR.position.z = -Math.sin(cyc) * 0.19 * ratio;
    this.legL.position.y = 0.23 + Math.max(0, Math.sin(cyc)) * 0.06 * ratio;
    this.legR.position.y = 0.23 + Math.max(0, -Math.sin(cyc)) * 0.06 * ratio;

    this.blob.scale.setScalar(1 - ratio * 0.06);

    // recoil kicks the gun back, damage flashes the whole suit
    this.recoil = Math.max(0, this.recoil - dt * 2.4);
    this.gun.position.z = 0.26 - this.recoil * 0.9;
    this.gun.rotation.z = 0;
    this.gunRotor.rotation.z = this.gunStyle === 'rapid' ? this.t * 35 : 0;
    this.gun.rotation.x = this.gunStyle === 'scatter' ? -this.recoil * 1.1 : 0;
    const charge = this.gunStyle === 'plasma' ? 1 + Math.sin(this.t * 12) * 0.04 : 1;
    this.gun.scale.setScalar(charge);

    if (this.hitFlash > 0){
      this.hitFlash -= dt;
      const f = Math.max(this.hitFlash, 0) / 0.3;
      for (const { m, base } of this.mats){
        m.emissive.setRGB(base.r + f * 1.6, base.g + f * 0.12, base.b + f * 0.12);
      }
    }
    // blink while invulnerable so the player can see the grace window
    this.body.visible = !(this.invuln > 0 && Math.floor(this.t * 22) % 2 === 0);
  }
}
