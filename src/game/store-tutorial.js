import * as THREE from 'three';
import { storage } from '../core/platform.js';

const KEY = 'verdant.storeTutorial.v1';
const ARROWS = 8;          // the pool; how many show depends on the distance
const NEAR = 2.2;          // close enough that the ring alone is clear

export class StoreTutorial {
  constructor(scene, armory){
    this.scene = scene;
    this.armory = armory;
    this.guide = document.getElementById('store-tutorial');
    let finished = armory.levels.laser > 1;
    try { finished ||= storage.getItem(KEY) === 'done'; } catch {}
    this.active = !finished;
    armory.tutorialActive = this.active;

    const previous = armory.onAction;
    armory.onAction = event => {
      previous?.(event);
      if (this.active && event.id === 'laser' && event.action === 'upgrade' && event.level >= 2) this.complete();
    };
    this.syncUi();
  }

  attach(room, floorIndex){
    this.clearRoute();
    if (!this.active || floorIndex !== 0) return;

    const to = room.store;
    this.store = to;
    /* Not additive: on floor 1's bright cyan floor an additive trail washes out
       into the background, which is half of why it read as "no arrows". */
    const material = new THREE.MeshBasicMaterial({
      color:0x0affe4, transparent:true, opacity:.92,
      depthWrite:false, side:THREE.DoubleSide
    });
    const geometry = new THREE.ConeGeometry(.3, .72, 3);
    this.route = new THREE.Group();
    this.route.userData.geometry = geometry;
    this.route.userData.material = material;

    /* The trail is drawn from the PLAYER each frame, not from the room's entry
       point. Floor 1 enters 1.9m from the pad, so an entry->pad trail was three
       cones stacked inside the ring — and it stayed at the door once you walked
       away, which is precisely when you need to be told where to go. */
    for (let i = 0; i < ARROWS; i++){
      const arrow = new THREE.Mesh(geometry, material);
      arrow.rotation.x = Math.PI / 2;
      arrow.userData.phase = i * .7;
      arrow.visible = false;
      this.route.add(arrow);
    }

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.42, 32),
      new THREE.MeshBasicMaterial({ color:0x73ede1, transparent:true, opacity:.72, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(to.x, .055, to.z);
    ring.userData.isStoreRing = true;
    this.route.add(ring);
    this.scene.add(this.route);
  }

  update(time){
    if (!this.active || !this.route) return;
    this.route.userData.material.opacity = .82 + Math.sin(time * 4) * .14;

    const from = this.armory.player.pos, to = this.store;
    const dx = to.x - from.x, dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    // standing on the pad: the ring says it, arrows underfoot would just be noise
    const shown = distance < NEAR ? 0 : Math.max(3, Math.min(ARROWS, Math.round(distance / 1.6)));
    const head = Math.max(0, distance - 1.35);      // stop short of the ring
    const tail = Math.min(1.1, head * 0.35);        // and start clear of your feet

    for (const child of this.route.children){
      if (child.userData.isStoreRing){
        child.material.opacity = .58 + Math.sin(time * 3) * .22;
        continue;
      }
      const i = child.userData.phase / .7;
      child.visible = i < shown;
      if (!child.visible) continue;
      // the arrows crawl towards the pad, so the trail reads as a direction
      const k = shown === 1 ? .5 : ((i + time * 1.1) % shown) / shown;
      const d = tail + (head - tail) * k;
      child.position.set(from.x + dx / distance * d, .06, from.z + dz / distance * d);
      child.rotation.y = angle;
      child.scale.setScalar(1 + Math.sin(time * 4 - child.userData.phase) * .18);
    }
  }

  complete(){
    this.active = false;
    this.armory.tutorialActive = false;
    try { storage.setItem(KEY, 'done'); } catch {}
    this.clearRoute();
    this.syncUi();
    this.armory.render();
    this.onComplete?.();
  }

  syncUi(){
    if (this.guide) this.guide.hidden = !this.active;
  }

  clearRoute(){
    if (!this.route) return;
    this.scene.remove(this.route);
    this.route.userData.geometry?.dispose();
    this.route.userData.material?.dispose();
    for (const child of this.route.children) if (child.userData.isStoreRing){ child.geometry.dispose(); child.material.dispose(); }
    this.route = null;
  }
}
