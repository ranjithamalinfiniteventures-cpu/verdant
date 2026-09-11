import * as THREE from 'three';

/* One bright key + a tinted bounce. No player light, no fog inside the room:
   the room is lit, everything beyond it is not. */
export function buildLighting(scene, w = 22, d = 15){
  // sky is cool white, ground bounce is the teal of the floor — that tint on the
  // undersides is most of what sells the "one material, real light" look
  const hemi = new THREE.HemisphereLight(0xe6f7fb, 0x2c5f68, 0.72);
  scene.add(hemi);

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

  const out = { key, rim, fill, hemi };

  /* Two moods. The tower is clean station light; the Heartwood Pit is the
     bottom of the plant — violet sky, a magenta bounce off the living floor,
     amber key, a teal rim, and a hot glow pooled on the centre dais. It is a
     retint of the same five lights, so the pit costs nothing extra to light. */
  const MOODS = {
    tower: {
      hemi: [0xe6f7fb, 0x2c5f68, 0.72], key: [0xfff6ea, 1.92], rim: [0x9fd8ff, 0.5],
      fill: [0xfff0dd, 9, 26, [0, 9, 1]], bg: 0x05070a, fog: [0x05070a, 44, 96],
    },
    heartwood: {
      hemi: [0xb7a4ff, 0x4a1238, 0.62], key: [0xffd2a0, 1.55], rim: [0x5eead4, 0.85],
      fill: [0xff5db1, 11, 26, [0, 6, 0]], bg: 0x07040c, fog: [0x07040c, 38, 88],
    },
  };
  out.mood = (name) => {
    const m = MOODS[name] || MOODS.tower;
    hemi.color.set(m.hemi[0]); hemi.groundColor.set(m.hemi[1]); hemi.intensity = m.hemi[2];
    key.color.set(m.key[0]); key.intensity = m.key[1];
    rim.color.set(m.rim[0]); rim.intensity = m.rim[1];
    fill.color.set(m.fill[0]); fill.intensity = m.fill[1]; fill.distance = m.fill[2];
    fill.position.set(...m.fill[3]);
    if (scene.background && scene.background.isColor) scene.background.set(m.bg);
    if (scene.fog){ scene.fog.color.set(m.fog[0]); scene.fog.near = m.fog[1]; scene.fog.far = m.fog[2]; }
  };

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
