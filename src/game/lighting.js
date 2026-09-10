import * as THREE from 'three';

/* One bright key + a tinted bounce. No player light, no fog inside the room:
   the room is lit, everything beyond it is not. */
export function buildLighting(scene, w = 22, d = 15){
  // sky is cool white, ground bounce is the teal of the floor — that tint on the
  // undersides is most of what sells the "one material, real light" look
  scene.add(new THREE.HemisphereLight(0xe6f7fb, 0x2c5f68, 0.72));

  const key = new THREE.DirectionalLight(0xfff6ea, 1.92);
  key.position.set(-13, 26, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  const s = key.shadow.camera;
  s.near = 1; s.far = 80;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 3;
  scene.add(key);
  scene.add(key.target);

  // cold rim from the opposite side so silhouettes separate from the floor
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.5);
  rim.position.set(16, 12, -18);
  scene.add(rim);

  // a soft warm pool at room centre to stop the middle going flat
  const fill = new THREE.PointLight(0xfff0dd, 9, 26, 2);
  fill.position.set(0, 9, 1);
  scene.add(fill);

  const out = { key, rim, fill };

  /* Rooms differ in size per module, so the shadow frustum has to be refitted or
     we either waste depth resolution or clip shadows at the edges. */
  out.fit = (w2, d2) => {
    const s2 = key.shadow.camera;
    s2.left = -w2 * 0.62; s2.right = w2 * 0.62;
    s2.top  =  d2 * 1.0;  s2.bottom = -d2 * 1.0;
    s2.updateProjectionMatrix();
  };
  out.fit(w, d);
  return out;
}
