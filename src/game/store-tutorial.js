import * as THREE from 'three';

const KEY = 'verdant.storeTutorial.v1';

export class StoreTutorial {
  constructor(scene, armory){
    this.scene = scene;
    this.armory = armory;
    this.guide = document.getElementById('store-tutorial');
    let finished = armory.levels.laser > 1;
    try { finished ||= localStorage.getItem(KEY) === 'done'; } catch {}
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

    const from = room.entryPos;
    const to = room.store;
    const dx = to.x - from.x, dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    const count = Math.max(3, Math.min(8, Math.floor(distance / 1.25)));
    const material = new THREE.MeshBasicMaterial({
      color:0x73ede1, transparent:true, opacity:.76,
      blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide
    });
    const geometry = new THREE.ConeGeometry(.24, .56, 3);
    this.route = new THREE.Group();
    this.route.userData.geometry = geometry;
    this.route.userData.material = material;
    const angle = Math.atan2(dx, dz);

    for (let i = 1; i <= count; i++){
      const k = i / (count + 1);
      const arrow = new THREE.Mesh(geometry, material);
      arrow.position.set(from.x + dx * k, .045, from.z + dz * k);
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.y = angle;
      arrow.userData.phase = i * .7;
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
    const pulse = .68 + Math.sin(time * 4) * .18;
    this.route.userData.material.opacity = pulse;
    for (const child of this.route.children){
      if (child.userData.isStoreRing){
        child.material.opacity = .58 + Math.sin(time * 3) * .22;
        continue;
      }
      const s = 1 + Math.sin(time * 4 - child.userData.phase) * .18;
      child.scale.setScalar(s);
    }
  }

  complete(){
    this.active = false;
    this.armory.tutorialActive = false;
    try { localStorage.setItem(KEY, 'done'); } catch {}
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
