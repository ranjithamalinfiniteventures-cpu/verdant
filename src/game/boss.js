import * as THREE from 'three';
import { audio } from '../core/audio.js';

/* HEARTROOT — the thing at the top of the tower.

   Design notes, because the shape of this fight is deliberate:

   The floors below are a crowd problem: lots of small things converging, solved
   by positioning and sustained fire. A boss that was just a big enemy with a
   large health bar would be the same problem again, only slower. So Heartroot
   does not chase and does not touch you. It sits in the middle of the room and
   fills space with beams, which turns the fight into a movement puzzle — the
   safe ground moves, and you have to read the telegraph and be somewhere else.

   Every beam is telegraphed as a thin bright line for ~0.8s before it fires. A
   hit is therefore always a read you lost, never a surprise, which is what makes
   a heavy-damage attack fair. Fire time is short (~0.3s), so standing in the
   wrong place costs one hit rather than melting you.

   Cost: the body is ~1.2k triangles across 6 draw calls, and every beam —
   telegraph and live — is one instance of a shared unit box, so the whole attack
   layer is a single extra draw call no matter how many beams are on screen. */

const MAX_BEAMS   = 24;
const TELEGRAPH   = 0.82;   // seconds a beam warns before it fires
const FIRE_TIME   = 0.30;   // seconds it is actually lethal
const FADE_TIME   = 0.20;
const BEAM_LEN    = 40;     // long enough to cross any room on the floor
const BEAM_HALF_W = 0.55;   // hit half-width; the visual is drawn a touch wider

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const EPS = 1e-6;
const ease  = t => t * t * (3 - 2 * t);

export class Boss {
  constructor(scene){
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.alive = false;
    this.external = true;          // marks this as a non-pooled weapon target
    this.pos = new THREE.Vector3();
    this.def = { radius: 2.35, color: 0xff5db1 };
    this.hp = this.maxHp = 1;
    this.flash = 0;
    this.t = 0;
    this.phase = 1;
    this.beams = [];
    this.dying = 0;
    this.onDeath = null;
    this.intro = 0;

    this._build();
    this._buildBeams();
  }

  /* ------------------------------------------------------------- visuals -- */

  _build(){
    const g = this.group;

    // squat root bulb, wider than tall so it reads as rooted from a top-down camera
    this.bulbMat = new THREE.MeshStandardMaterial({
      color: 0x5b2c52, roughness: 0.62, metalness: 0.05,
      emissive: 0xff5db1, emissiveIntensity: 0.18,
    });
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(2.15, 22, 14), this.bulbMat);
    this.bulb.scale.set(1, 0.78, 1);
    this.bulb.position.y = 1.5;
    this.bulb.castShadow = true;
    g.add(this.bulb);

    // the core is the tell: it brightens and swells as an attack charges
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xffe3f4, emissive: 0xff2f9a, emissiveIntensity: 2.2,
      roughness: 0.3, toneMapped: true,
    });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.92, 18, 12), this.coreMat);
    this.core.position.y = 1.62;
    g.add(this.core);

    // petals fold open while charging and clap shut on the shot
    this.petals = [];
    const petalGeo = new THREE.ConeGeometry(0.62, 2.5, 5);
    this.petalMat = new THREE.MeshStandardMaterial({
      color: 0x8e3f78, roughness: 0.5, metalness: 0.08,
      emissive: 0xff5db1, emissiveIntensity: 0.35,
    });
    for (let i = 0; i < 6; i++){
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 6) * Math.PI * 2;
      const m = new THREE.Mesh(petalGeo, this.petalMat);
      m.position.set(0, 2.5, 1.35);
      m.castShadow = true;
      pivot.add(m);
      pivot.position.y = 0.6;
      g.add(pivot);
      this.petals.push({ pivot, mesh: m, base: (i / 6) * Math.PI * 2 });
    }

    // two counter-rotating rings — cheap, and they make the idle read as alive
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8ed0, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.ringA = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.075, 6, 44), this.ringMat);
    this.ringA.rotation.x = Math.PI / 2;
    this.ringA.position.y = 1.1;
    this.ringB = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.055, 6, 40), this.ringMat);
    this.ringB.rotation.x = Math.PI / 2;
    this.ringB.position.y = 2.3;
    g.add(this.ringA, this.ringB);

    // ground shadow-disc so the boss never looks like it is floating
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff5db1, transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      })
    );
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.03;
    g.add(this.disc);
  }

  _buildBeams(){
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.beamMesh = new THREE.InstancedMesh(geo, this.beamMat, MAX_BEAMS);
    this.beamMesh.instanceColor =
      new THREE.InstancedBufferAttribute(new Float32Array(MAX_BEAMS * 3), 3);
    this.beamMesh.frustumCulled = false;
    this.beamMesh.castShadow = this.beamMesh.receiveShadow = false;
    this.beamMesh.renderOrder = 4;
    this.beamMesh.visible = false;
    this.scene.add(this.beamMesh);

    this._bm = new THREE.Matrix4();
    this._bp = new THREE.Vector3();
    this._bq = new THREE.Quaternion();
    this._bs = new THREE.Vector3();
    this._bc = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /* ------------------------------------------------------------ lifecycle -- */

  spawn(x, z, hp, arena = null){
    this.pos.set(x, 0, z);
    this.arena = arena;
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.group.scale.setScalar(0.01);
    this.beamMesh.visible = true;
    this.hp = this.maxHp = hp;
    this.alive = true;
    this.dying = 0;
    this.intro = 0;
    this.phase = 1;
    this.t = 0;
    this.flash = 0;
    this.beams.length = 0;
    this.cd = 2.4;               // a beat to read the room before the first attack
    this.pattern = null;
    this.sweep = null;
    this.beamMesh.count = 0;
  }

  despawn(){
    this.sweep = null;
    this.beamMesh.count = 0;
    this.alive = false;
    this.group.visible = false;
    this.beamMesh.visible = false;
    this.beams.length = 0;
  }

  get hpFrac(){ return this.maxHp ? clamp(this.hp / this.maxHp, 0, 1) : 0; }

  /** Damage from a player bolt. @returns {boolean} true if this killed it */
  takeHit(dmg, fx){
    if (!this.alive || this.dying) return false;
    this.hp -= dmg;
    this.flash = 1;
    const before = this.phase;
    this.phase = this.hpFrac > 0.66 ? 1 : this.hpFrac > 0.33 ? 2 : 3;
    if (this.phase !== before){
      // a phase change has to be legible: everything stops, then comes back harder
      this.cd = 1.5;
      this.beams.length = 0;
      audio.lash?.();
      fx?.ring(this.pos, { color: 0xff2f9a, from: 1, to: 11, life: 0.7 });
    }
    if (this.hp <= 0){
      this.hp = 0;
      this.dying = 1.9;
      this.beams.length = 0;
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------- attacks -- */

  _fire(angle, delay = 0, width = BEAM_HALF_W){
    if (this.beams.length >= MAX_BEAMS) return;
    this.beams.push({ angle, t: -delay, width, dealt: false });
  }

  /** Choose and lay down the next attack. */
  _nextPattern(player){
    const p = this.phase;
    const roll = Math.random();
    const toPlayer = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);

    // RADIAL: a fan of fixed beams with safe gaps — read the gap, stand in it
    if (roll < 0.38){
      const n = p === 1 ? 6 : p === 2 ? 8 : 10;
      // offset so the gaps never land in the same place twice
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) this._fire(off + (i / n) * Math.PI * 2);
      this.cd = TELEGRAPH + FIRE_TIME + (p === 3 ? 0.55 : 0.95);
      return 'radial';
    }

    // LANCE: aimed at where you are standing — punishes standing still
    if (roll < 0.68){
      const shots = p === 1 ? 2 : p === 3 ? 4 : 3;
      for (let i = 0; i < shots; i++){
        this._fire(toPlayer + (Math.random() - 0.5) * 0.5, i * 0.42, BEAM_HALF_W * 1.15);
      }
      this.cd = TELEGRAPH + FIRE_TIME + shots * 0.42 + 0.5;
      return 'lance';
    }

    // SWEEP: a rotating pair (or trio) you have to keep moving around
    const arms = p === 3 ? 3 : 2;
    this.sweep = {
      t: 0,
      dur: p === 1 ? 3.0 : p === 2 ? 3.6 : 4.2,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: p === 1 ? 0.85 : p === 2 ? 1.05 : 1.25,
      base: toPlayer,
      arms,
    };
    this.cd = this.sweep.dur + 0.8;
    return 'sweep';
  }

  /* --------------------------------------------------------------- frame -- */

  /** @returns {number} damage dealt to the player this frame */
  update(dt, player, fx, engine, room){
    if (!this.alive) return 0;
    this.t += dt;
    this.flash *= Math.pow(0.0009, dt);

    // grow-in on spawn
    if (this.intro < 1){
      this.intro = Math.min(1, this.intro + dt * 1.4);
      const k = ease(this.intro);
      this.group.scale.setScalar(0.01 + k * 0.99);
    }

    if (this.dying > 0) return this._updateDying(dt, fx, engine);

    let charging = 0;
    let damage = 0;

    /* ---- sweep: continuously rotating arms, live the whole time ---- */
    if (this.sweep){
      const s = this.sweep;
      s.t += dt;
      charging = 0.55;
      const a0 = s.base + s.dir * s.t * s.speed;
      for (let i = 0; i < s.arms; i++){
        const a = a0 + (i / s.arms) * Math.PI * 2;
        if (this._hits(player, a, BEAM_HALF_W)) damage = Math.max(damage, this.contactDamage);
      }
      if (s.t >= s.dur) this.sweep = null;
    }

    /* ---- discrete beams: telegraph, fire, fade ---- */
    for (let i = this.beams.length - 1; i >= 0; i--){
      const b = this.beams[i];
      b.t += dt;
      if (b.t < 0) continue;
      if (b.t < TELEGRAPH){
        charging = Math.max(charging, b.t / TELEGRAPH);
        continue;
      }
      const ft = b.t - TELEGRAPH;
      if (ft <= FIRE_TIME){
        if (!b.dealt && this._hits(player, b.angle, b.width)){
          b.dealt = true;                     // one beam can only bite you once
          damage = Math.max(damage, this.contactDamage);
        }
        if (!b.flashed){
          b.flashed = true;
          engine?.addShake(0.06);
          audio.lash?.();
        }
      } else if (ft > FIRE_TIME + FADE_TIME){
        this.beams.splice(i, 1);
      }
    }

    /* ---- schedule the next attack ---- */
    this.cd -= dt;
    if (this.cd <= 0 && !this.sweep) this.pattern = this._nextPattern(player);

    this._animate(dt, player, charging);
    this._drawBeams();
    return damage;
  }

  /** Contact damage scales with phase, but stays survivable — see main.js notes. */
  get contactDamage(){ return this.phase === 3 ? 0.16 : this.phase === 2 ? 0.13 : 0.11; }

  /* How far a beam at `angle` travels before it meets the arena wall.

     Without this the beams run the full 40m and visibly cut through walls into
     the neighbouring rooms, which reads as a bug and, worse, would let the boss
     hit a player standing safely on the other side of a wall. Standard slab
     intersection against the room rectangle. */
  _rayLen(angle){
    const a = this.arena;
    if (!a) return BEAM_LEN;
    const sx = Math.sin(angle), sz = Math.cos(angle);
    let t = BEAM_LEN;
    if (Math.abs(sx) > EPS){
      const tx = ((sx > 0 ? a.x1 : a.x0) - this.pos.x) / sx;
      if (tx > 0) t = Math.min(t, tx);
    }
    if (Math.abs(sz) > EPS){
      const tz = ((sz > 0 ? a.z1 : a.z0) - this.pos.z) / sz;
      if (tz > 0) t = Math.min(t, tz);
    }
    return clamp(t, 2.2, BEAM_LEN);
  }

  /** Is the player standing in the beam at `angle`? */
  _hits(player, angle, halfW){
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const sx = Math.sin(angle), sz = Math.cos(angle);
    const along = dx * sx + dz * sz;
    if (along < 1.6 || along > this._rayLen(angle)) return false;   // the hub itself is safe
    const perp = Math.abs(dx * sz - dz * sx);
    return perp < halfW + 0.34;                          // + player radius
  }

  _animate(dt, player, charging){
    const t = this.t;

    // idle bob and a slow lean toward the player: it is watching you
    const bob = Math.sin(t * 1.5) * 0.14;
    this.bulb.position.y = 1.5 + bob;
    this.core.position.y = 1.62 + bob * 1.25;

    const toX = player.pos.x - this.pos.x, toZ = player.pos.z - this.pos.z;
    const want = Math.atan2(toX, toZ);
    this.group.rotation.y += Math.atan2(
      Math.sin(want - this.group.rotation.y),
      Math.cos(want - this.group.rotation.y)
    ) * Math.min(1, dt * 1.6);

    // core swells and brightens with the charge, then snaps back
    const pulse = 1 + Math.sin(t * 3.1) * 0.05 + ease(charging) * 0.5;
    this.core.scale.setScalar(pulse);
    this.coreMat.emissiveIntensity = 2.2 + ease(charging) * 6.5 + this.flash * 5;
    this.bulbMat.emissiveIntensity = 0.18 + this.flash * 1.4;

    // petals fold open as it charges
    const open = ease(charging);
    for (let i = 0; i < this.petals.length; i++){
      const p = this.petals[i];
      const wobble = Math.sin(t * 2.1 + i) * 0.05;
      p.pivot.rotation.x = -0.15 - open * 0.75 + wobble;
      p.pivot.rotation.y = p.base + t * 0.22;
      p.mesh.position.y = 2.5 + open * 0.35;
    }
    this.petalMat.emissiveIntensity = 0.35 + open * 1.6 + this.flash * 2;

    this.ringA.rotation.z += dt * 0.55;
    this.ringB.rotation.z -= dt * 0.85;
    this.ringA.scale.setScalar(1 + open * 0.1);
    this.ringMat.opacity = 0.4 + open * 0.4;
    this.disc.scale.setScalar(1 + Math.sin(t * 1.5) * 0.03 + open * 0.12);
  }

  _updateDying(dt, fx, engine){
    this.dying -= dt;
    const k = clamp(this.dying / 1.9, 0, 1);
    this.group.scale.setScalar(0.01 + k * 0.99);
    this.group.rotation.y += dt * (1 - k) * 9;
    this.coreMat.emissiveIntensity = 2 + (1 - k) * 22;
    for (let i = 0; i < this.petals.length; i++){
      this.petals[i].pivot.rotation.x = -0.15 - (1 - k) * 2.4;
      this.petals[i].mesh.position.y = 2.5 + (1 - k) * 5;
    }
    this.ringA.scale.setScalar(1 + (1 - k) * 4);
    this.ringB.scale.setScalar(1 + (1 - k) * 6);
    this.ringMat.opacity = 0.55 * k;

    if (Math.random() < dt * 22){
      fx?.burst(
        { x: this.pos.x + (Math.random()-0.5)*4, y: 1 + Math.random()*3, z: this.pos.z + (Math.random()-0.5)*4 },
        { count: 8, color: 0xff5db1, speed: 6, size: 0.16, life: 0.6, up: 2 }
      );
    }
    this.beamMesh.visible = false;

    if (this.dying <= 0){
      engine?.addShake(0.5);
      fx?.ring(this.pos, { color: 0xffffff, from: 1, to: 18, life: 1.1 });
      this.despawn();
      const cb = this.onDeath; this.onDeath = null;
      cb?.();
    }
    return 0;
  }

  _drawBeams(){
    let n = 0;
    const put = (angle, halfW, bright, lit) => {
      if (n >= MAX_BEAMS) return;
      const len = Math.max(0.1, this._rayLen(angle) - 1.6);
      const mid = 1.6 + len / 2;
      this._bp.set(this.pos.x + Math.sin(angle) * mid, 0.9, this.pos.z + Math.cos(angle) * mid);
      this._bq.setFromAxisAngle(this._up, angle);
      this._bs.set(halfW * 2 * (lit ? 1 : 0.16), lit ? 1.5 : 0.05, len);
      this._bm.compose(this._bp, this._bq, this._bs);
      this.beamMesh.setMatrixAt(n, this._bm);
      this._bc.setRGB(bright * 1.0, bright * 0.22, bright * 0.62);
      this.beamMesh.setColorAt(n, this._bc);
      n++;
    };

    if (this.sweep){
      const s = this.sweep;
      const a0 = s.base + s.dir * s.t * s.speed;
      for (let i = 0; i < s.arms; i++) put(a0 + (i / s.arms) * Math.PI * 2, BEAM_HALF_W, 1.15, true);
    }

    for (const b of this.beams){
      if (b.t < 0) continue;
      if (b.t < TELEGRAPH){
        // the warning line thickens and brightens as the shot approaches
        const k = b.t / TELEGRAPH;
        put(b.angle, BEAM_HALF_W * (0.55 + k * 0.45), 0.10 + k * 0.55, false);
      } else {
        const ft = b.t - TELEGRAPH;
        const k = ft <= FIRE_TIME ? 1 : 1 - (ft - FIRE_TIME) / FADE_TIME;
        put(b.angle, BEAM_HALF_W, 1.5 * Math.max(0, k), true);
      }
    }

    this.beamMesh.count = n;
    this.beamMesh.visible = n > 0;
    this.beamMesh.instanceMatrix.needsUpdate = true;
    if (this.beamMesh.instanceColor) this.beamMesh.instanceColor.needsUpdate = true;
  }

  dispose(){
    this.despawn();
    this.scene.remove(this.group, this.beamMesh);
  }
}
