import * as THREE from 'three';

/* The "where now?" problem.

   Clearing a floor opens the stairs, but on the bigger plans the stairs are
   often through a doorway and off-screen, so the moment of victory was followed
   by wandering. This lays a scrolling chevron trail on the floor from the player
   to the exit.

   It routes rather than pointing straight: aiming a arrow at the stairs through
   a wall sends people into the wall. When the player is not yet in the stairs'
   room the trail bends toward the doorway that leads there, using the same
   `routeDoor` the enemies path with.

   Cost is one draw call and 12 triangles, and the whole thing sleeps (visible =
   false, zero per-frame work) until a floor is actually cleared. */

const COUNT = 12;
const SPACING = 1.45;
const SPEED = 2.6;          // metres/second the chevrons scroll toward the door

/** A flat chevron lying in the XZ plane, nose pointing at +X. */
function chevronGeometry(){
  const g = new THREE.BufferGeometry();
  // two triangles forming a "V" with a notch at the tail
  const v = new Float32Array([
     0.55, 0,  0.00,   -0.30, 0,  0.46,   -0.06, 0,  0.00,
     0.55, 0,  0.00,   -0.06, 0,  0.00,   -0.30, 0, -0.46,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export class ExitGuide {
  constructor(scene){
    this.mesh = new THREE.InstancedMesh(
      chevronGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        // the chevron lies flat, so which way it faces depends on vertex winding.
        // DoubleSide costs nothing at 12 triangles and cannot be culled by mistake.
        side: THREE.DoubleSide,
      }),
      COUNT
    );
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    scene.add(this.mesh);

    this.room = null;
    this.active = false;
    this.scroll = 0;
    this.fade = 0;                  // eases in so the trail does not pop
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._col = new THREE.Color();
  }

  setFloor(room){
    this.room = room;
    this.active = false;
    this.fade = 0;
    this.scroll = 0;
    this.mesh.visible = false;
  }

  /** Called once when the floor clears and the stairs unlock. */
  arm(){ this.active = true; }

  disarm(){
    this.active = false;
    this.fade = 0;
    this.mesh.visible = false;
  }

  /** Where the trail should bend toward next: a doorway, or the stairs. */
  target(px, pz){
    const room = this.room;
    const stairs = room.stairs;
    const here = room.roomAt(px, pz);
    const there = room.roomAt(stairs.x, stairs.z);
    // same room, or either of us in a corridor — head straight for the stairs
    if (here < 0 || there < 0 || here === there) return { x: stairs.x, z: stairs.z };
    const door = room.routeDoor(here, there);
    return door || { x: stairs.x, z: stairs.z };
  }

  update(dt, playerPos){
    if (!this.active && this.fade <= 0) return;
    this.fade = Math.min(1, this.fade + dt * 2.2);
    this.mesh.visible = true;

    const t = this.target(playerPos.x, playerPos.z);
    let dx = t.x - playerPos.x, dz = t.z - playerPos.z;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist; dz /= dist;

    // chevrons flow away from the player toward the door and loop back round
    this.scroll = (this.scroll + dt * SPEED) % SPACING;
    const yaw = Math.atan2(dx, dz);
    this._q.setFromAxisAngle(this._up, yaw - Math.PI / 2);

    // start clear of the player's own body, stop short of the target
    const START = 1.15;
    const span = Math.max(0, dist - START - 0.35);

    for (let i = 0; i < COUNT; i++){
      const along = START + i * SPACING + this.scroll;
      const past = along - START;
      // hide any chevron that has run beyond the door
      const live = past <= span;
      const x = playerPos.x + dx * along;
      const z = playerPos.z + dz * along;

      // fade in at the near end, out at the far end, so the trail has no hard cut
      const nearK = Math.min(1, past / 1.2);
      const farK  = Math.min(1, Math.max(0, (span - past) / 2.2));
      const pulse = 0.72 + 0.28 * Math.sin(this.scroll * 4.2 - i * 0.55);
      const k = live ? nearK * farK * this.fade * pulse : 0;

      this._p.set(x, 0.035, z);
      this._s.setScalar(live ? 0.92 : 0.0001);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      // additive blending: colour IS the brightness, so fading darkens to black
      this._col.setRGB(0.26 * k, 0.95 * k, 0.42 * k);
      this.mesh.setColorAt(i, this._col);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(){
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
