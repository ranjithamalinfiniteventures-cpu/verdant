import * as THREE from 'three';

const MAX_P = 320, MAX_RING = 10;

/* Everything that exists for a fraction of a second: sparks, spore bursts,
   death rings. All particles live in one instanced draw call. */
export class Fx {
  constructor(scene){
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX_P);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);

    this.p = Array.from({ length: MAX_P }, () => ({
      life: 0, max: 1, size: 0.1, grav: 0, drag: 1,
      x:0, y:0, z:0, vx:0, vy:0, vz:0, rx:0, ry:0, rz:0, spin:0,
      col: new THREE.Color()
    }));
    this.head = 0;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();

    // expanding shock rings, one material each so they can fade independently
    this.rings = [];
    for (let i = 0; i < MAX_RING; i++){
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.8, 28),
        new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.rotation.x = -Math.PI/2;
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, from: 0.3, to: 2 });
    }

    for (let i = 0; i < MAX_P; i++) this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
  }

  _take(){ const p = this.p[this.head]; this.head = (this.head + 1) % MAX_P; return p; }

  /** cone-ish spray of chunky bits */
  burst(pos, {
    count = 10, color = 0xffffff, speed = 5, spread = 1, size = 0.11,
    life = 0.42, grav = 9, drag = 0.9, up = 1.4, dir = null
  } = {}){
    for (let i = 0; i < count; i++){
      const p = this._take();
      p.x = pos.x; p.y = pos.y; p.z = pos.z;
      let ax, az;
      if (dir){
        const a = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * spread;
        ax = Math.sin(a); az = Math.cos(a);
      } else {
        const a = Math.random() * Math.PI * 2;
        ax = Math.sin(a); az = Math.cos(a);
      }
      const s = speed * (0.45 + Math.random() * 0.75);
      p.vx = ax * s; p.vz = az * s;
      p.vy = up * (0.4 + Math.random());
      p.grav = grav; p.drag = drag;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.max = p.life = life * (0.7 + Math.random() * 0.6);
      p.rx = Math.random() * 6.28; p.ry = Math.random() * 6.28; p.rz = Math.random() * 6.28;
      p.spin = (Math.random() - 0.5) * 22;
      p.col.set(color);
    }
  }

  ring(pos, { color = 0xffffff, from = 0.3, to = 2.4, life = 0.34 } = {}){
    const r = this.rings.find(r => r.life <= 0) || this.rings[0];
    r.mesh.position.set(pos.x, pos.y + 0.06, pos.z);
    r.mesh.material.color.set(color);
    r.from = from; r.to = to; r.max = r.life = life;
    r.mesh.visible = true;
  }

  update(dt){
    for (let i = 0; i < MAX_P; i++){
      const p = this.p[i];
      if (p.life <= 0){ continue; }
      p.life -= dt;
      if (p.life <= 0){
        this._m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this._m);
        continue;
      }
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vz *= k;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05){ p.y = 0.05; p.vy *= -0.32; p.vx *= 0.7; p.vz *= 0.7; }
      p.rx += p.spin * dt; p.ry += p.spin * 0.7 * dt;

      const t = p.life / p.max;
      this._e.set(p.rx, p.ry, p.rz);
      this._q.setFromEuler(this._e);
      this._v.set(p.x, p.y, p.z);
      const sc = p.size * (0.25 + t * 0.9);
      this._s.set(sc, sc, sc);
      this._m.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      // additive: fading toward black is the fade
      this._c.copy(p.col).multiplyScalar(0.25 + t * 1.15);
      this.mesh.setColorAt(i, this._c);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (const r of this.rings){
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0){ r.mesh.visible = false; continue; }
      const t = 1 - r.life / r.max;
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - t, 2.2));
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = (1 - t) * 0.85;
    }
  }
}
