import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* THE HEARTWOOD PIT — the endless zone.

   Everything in the tower is a clean white rectangle: corridors, doors, rooms
   that tile. This is deliberately the opposite. It is the bottom of the plant,
   below the station: one round pit, open on every side, where the floor itself
   is alive. Nothing here is borrowed from room.js.

     - The floor is a single shader: a summoning circle of rings, spokes and a
       glyph band, breathing with slow ripples. Every wave sends a shockwave
       across it, and it reddens as the waves climb.
     - Roots come over the rim and plunge into the pit edge. Light runs down
       them toward the centre, and the growth crawls out of where they land.
     - A ring of crystal clusters gives cover lanes; the centre and the outer
       track stay open for circling.
     - Four spore vents erupt on a telegraph. They hurt you, and they hurt the
       growth just as much — so luring a crowd over a charging vent is a play.
     - A heart seed floats over the centre dais. On boss waves it goes dark and
       Heartroot rises in its place.

   It returns the same shape as buildRoom(), so the player, the enemies, the
   weapon and the armory all work in it unchanged. The one difference they see
   is `bounds.r`: the pit is round, and everything clamps to that circle.

   Cost is the thing that has to stay low. The whole pit is ~20 draw calls: the
   floor is one mesh, static geometry is merged by material, the vents are
   instanced, the spores are one Points object animated on the GPU. */

export const ARENA_R = 21;

const TAU = Math.PI * 2;
const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/* a soft white dot, for the spores */
function glowTexture(px = 64){
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grd.addColorStop(0,    'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
  grd.addColorStop(1,    'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, px, px);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(title, sub){
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(6,16,22,.92)'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#73ede1'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 154);
  g.fillStyle = '#ffffff'; g.textAlign = 'center';
  g.font = '800 64px Outfit, system-ui, sans-serif'; g.fillText(title, 256, 82);
  g.fillStyle = '#9fe9e1'; g.font = '700 26px Outfit, system-ui, sans-serif'; g.fillText(sub, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildArena(scene){
  const R = ARENA_R;
  const g = new THREE.Group();
  g.name = 'heartwood-pit';
  scene.add(g);
  const own = [];                          // everything created here, disposed on exit
  const keep = (x) => (own.push(x), x);
  const rand = rng(90127);
  const uniforms = {
    uTime:   { value: 0 },
    uPulseR: { value: -10 },               // radius of the wave-start shockwave
    uPulseA: { value: 0 },
    uDanger: { value: 0 },                 // 0..1, rises with the wave number
    uSurge:  { value: 0 },                 // root veins run hot on a wave start
    uR:      { value: R },
  };

  /* ------------------------------------------------------------- floor -- */
  const floorMat = keep(new THREE.MeshStandardMaterial({ color: 0x17121d, roughness: 0.9, metalness: 0.08 }));
  floorMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform float uTime, uPulseR, uPulseA, uDanger, uR;
varying vec3 vWPos;
` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec2 p = vWPos.xz;
  float r = length(p);
  float a = atan(p.y, p.x);
  // concentric rings every 3.4 m
  float dR = abs(fract(r / 3.4 + 0.5) - 0.5) * 3.4;
  float ring = (1.0 - smoothstep(0.03, 0.10, dR)) * step(4.6, r);
  // sixteen spokes between the dais and the rim
  float seg = 6.2831853 / 16.0;
  float dA = abs(mod(a + seg * 0.5, seg) - seg * 0.5) * r;
  float spoke = (1.0 - smoothstep(0.03, 0.11, dA)) * smoothstep(4.6, 5.4, r) * (1.0 - smoothstep(uR - 2.4, uR - 1.4, r));
  // the glyph band round the dais, turning slowly
  float band = step(3.7, r) * step(r, 4.35);
  float glyph = band * step(0.45, fract(a / 6.2831853 * 40.0 + uTime * 0.04));
  // the rim, where the pit ends
  float edge = smoothstep(uR - 2.6, uR - 0.3, r) * (1.0 - smoothstep(uR + 0.2, uR + 0.8, r));
  // slow ripples always running outward; the shockwave on a wave start
  float ripple = 0.5 + 0.5 * sin(uTime * 1.5 - r * 0.55);
  float pulse = uPulseA * exp(-pow((r - uPulseR) * 0.75, 2.0));

  vec3 cMag  = mix(vec3(1.0, 0.16, 0.58), vec3(1.0, 0.12, 0.10), uDanger);
  vec3 cAmb  = mix(vec3(1.0, 0.60, 0.18), vec3(1.0, 0.36, 0.08), uDanger);
  vec3 cTeal = vec3(0.20, 0.95, 0.85);
  vec3 lineCol = mix(cMag, cAmb, 0.5 + 0.5 * sin(a * 2.0 + uTime * 0.25));
  vec3 glow = lineCol * (ring * 0.5 + spoke * 0.32) * (0.35 + 0.65 * ripple)
            + cTeal * glyph * 0.85
            + cMag * edge * 0.42
            + mix(cAmb, vec3(1.0), 0.35) * pulse * 1.05;
  totalEmissiveRadiance += glow * (0.75 + uDanger * 0.4);
}`);
  };
  const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(R + 1.2, 128)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.noMerge = true;
  g.add(floor);

  // a crisp boundary line, so the edge of the circle you are clamped to is
  // exactly where you can see it
  const edgeLine = new THREE.Mesh(
    keep(new THREE.RingGeometry(R - 0.55, R - 0.38, 160)),
    keep(new THREE.MeshBasicMaterial({ color: 0xff4fb3, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  edgeLine.rotation.x = -Math.PI / 2; edgeLine.position.y = 0.025;
  edgeLine.userData.noMerge = true;
  g.add(edgeLine);

  /* --------------------------------------------------------- rim wall -- */
  const barkMat  = keep(new THREE.MeshStandardMaterial({ color: 0x2c1a26, roughness: 0.88, metalness: 0.02, side: THREE.BackSide }));
  const capMat   = keep(new THREE.MeshStandardMaterial({ color: 0x3a2433, roughness: 0.8 }));
  const ribMat   = keep(new THREE.MeshStandardMaterial({ color: 0x35202e, roughness: 0.82 }));
  const trimMat  = keep(new THREE.MeshStandardMaterial({ color: 0xff3fa8, emissive: 0xff3fa8, emissiveIntensity: 1.1, roughness: 0.4 }));
  const veinMat  = keep(new THREE.MeshStandardMaterial({ color: 0xffa13c, emissive: 0xff8a26, emissiveIntensity: 1.3, roughness: 0.4 }));

  const wall = new THREE.Mesh(keep(new THREE.CylinderGeometry(R + 0.9, R + 1.3, 2.8, 96, 1, true)), barkMat);
  wall.position.y = 1.4; wall.receiveShadow = true;
  g.add(wall);
  const cap = new THREE.Mesh(keep(new THREE.RingGeometry(R + 0.85, R + 2.4, 96, 1)), capMat);
  cap.rotation.x = -Math.PI / 2; cap.position.y = 2.8;
  g.add(cap);
  const trim = new THREE.Mesh(keep(new THREE.TorusGeometry(R + 0.9, 0.08, 6, 160)), trimMat);
  trim.rotation.x = Math.PI / 2; trim.position.y = 2.82;
  g.add(trim);

  // ribs every 20 degrees give the wall a rhythm, with a vein of light up each
  const ribGeo = keep(new THREE.BoxGeometry(0.8, 3.1, 0.9));
  const ribVein = keep(new THREE.BoxGeometry(0.12, 2.4, 0.95));
  for (let i = 0; i < 18; i++){
    const th = (i / 18) * TAU + 0.09;
    const x = Math.cos(th) * (R + 0.55), z = Math.sin(th) * (R + 0.55);
    const rib = new THREE.Mesh(ribGeo, ribMat);
    rib.position.set(x, 1.55, z); rib.rotation.y = -th; rib.castShadow = true;
    g.add(rib);
    const v = new THREE.Mesh(ribVein, veinMat);
    v.position.set(Math.cos(th) * (R + 0.12), 1.45, Math.sin(th) * (R + 0.12)); v.rotation.y = -th;
    g.add(v);
  }

  /* ------------------------------------------------------------ roots -- */
  const rootMat = keep(new THREE.MeshStandardMaterial({ color: 0x3b2231, roughness: 0.85, metalness: 0.02 }));
  rootMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute vec2 aRoot;\nvarying vec2 vRoot;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n  vRoot = aRoot;');
    sh.fragmentShader = `uniform float uTime, uSurge, uDanger;
varying vec2 vRoot;
` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // pulses of light running down the root, into the pit
  float flow = pow(max(0.0, sin(vRoot.x * 34.0 - uTime * (3.2 + uDanger * 2.5))), 10.0);
  float vein = 1.0 - smoothstep(0.08, 0.2, abs(fract(vRoot.y * 3.0) - 0.5));
  vec3 c = mix(vec3(1.0, 0.25, 0.62), vec3(1.0, 0.2, 0.1), uDanger);
  totalEmissiveRadiance += c * vein * (0.18 + flow * (0.9 + uSurge * 2.2));
}`);
  };

  const rootGeos = [];
  const thornGeos = [];
  const touchdowns = [];
  const thornBase = new THREE.ConeGeometry(0.13, 0.75, 5);
  const ROOTS = 9;
  for (let i = 0; i < ROOTS; i++){
    const th = (i / ROOTS) * TAU + 0.35 + (rand() - 0.5) * 0.25;
    const c = Math.cos(th), s = Math.sin(th);
    const side = (rand() - 0.5) * 0.18;               // a little lateral wander
    /* The arch peaks OVER the wall and stays low inside the pit. The camera sits
       south of the player looking north, so a root on the south rim is always
       between the camera and you: a tall arch there covered the bottom of the
       screen. Measured and lowered — nothing inside the rim rises above 1.9 m. */
    const pts = [
      [R + 8.0, -0.6], [R + 4.8, 2.4], [R + 2.0, 3.3], [R + 0.2, 2.6], [R - 1.3, 1.0], [R - 2.2, -0.5],
    ].map(([r, y], k) => {
      const a = th + side * Math.sin(k * 1.3);
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    const TUB = 40, RAD = 7;
    const tube = new THREE.TubeGeometry(curve, TUB, 0.5, RAD, false);
    // taper: thick where it comes over the rim, thin where it stabs the floor
    const pos = tube.attributes.position, cen = new THREE.Vector3(), v = new THREE.Vector3();
    const aRoot = new Float32Array(pos.count * 2);
    for (let k = 0; k < pos.count; k++){
      const ring = Math.floor(k / (RAD + 1)), u = ring / TUB;
      curve.getPointAt(u, cen);
      v.fromBufferAttribute(pos, k).sub(cen).multiplyScalar(1.05 - u * 0.62).add(cen);
      pos.setXYZ(k, v.x, v.y, v.z);
      aRoot[k * 2] = u; aRoot[k * 2 + 1] = (k % (RAD + 1)) / RAD;
    }
    tube.setAttribute('aRoot', new THREE.BufferAttribute(aRoot, 2));
    tube.computeVertexNormals();
    rootGeos.push(tube);

    // thorns along the arch, pointing out and up
    for (let k = 0; k < 4; k++){
      const u = 0.18 + k * 0.16;
      const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
      const out = new THREE.Vector3(c, 0.9, s).normalize().add(new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(k % 2 ? 0.6 : -0.6)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
      const m = new THREE.Matrix4().compose(p.clone().addScaledVector(out, 0.4 * (1.05 - u * 0.62)), q, new THREE.Vector3(1, 1, 1));
      thornGeos.push(thornBase.clone().applyMatrix4(m));
    }
    const tdR = R - 2.1;
    touchdowns.push({ x: Math.cos(th) * tdR, z: Math.sin(th) * tdR, th });
  }
  // aRoot has to exist on every merged piece, so thorns get a flat one
  for (const tg of thornGeos){
    tg.setAttribute('aRoot', new THREE.BufferAttribute(new Float32Array(tg.attributes.position.count * 2), 2));
    tg.deleteAttribute('uv');
  }
  for (const rg of rootGeos) rg.deleteAttribute('uv');
  thornBase.dispose();
  const roots = new THREE.Mesh(keep(mergeGeometries([...rootGeos, ...thornGeos])), rootMat);
  roots.castShadow = true; roots.receiveShadow = true;
  roots.userData.noMerge = true;
  g.add(roots);
  for (const x of [...rootGeos, ...thornGeos]) x.dispose();

  // a cracked, glowing crater where each root goes in
  const craterMat = keep(new THREE.MeshBasicMaterial({ color: 0xff3f9e, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const craterGeo = keep(new THREE.CircleGeometry(1.7, 24));
  for (const t of touchdowns){
    const cr = new THREE.Mesh(craterGeo, craterMat);
    cr.rotation.x = -Math.PI / 2; cr.position.set(t.x, 0.03, t.z);
    g.add(cr);
  }

  /* --------------------------------------------------------- crystals -- */
  const crysA = keep(new THREE.MeshStandardMaterial({ color: 0x7c4dff, emissive: 0x6d28d9, emissiveIntensity: 0.9, roughness: 0.18, metalness: 0.1 }));
  const crysB = keep(new THREE.MeshStandardMaterial({ color: 0x2ee6cf, emissive: 0x14b8a6, emissiveIntensity: 0.8, roughness: 0.18, metalness: 0.1 }));
  const shard = keep(new THREE.OctahedronGeometry(1, 0));
  const glowMat = keep(new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const glowGeo = keep(new THREE.CircleGeometry(2.3, 28));
  const clusters = [];
  for (let i = 0; i < 6; i++){
    const th = (i / 6) * TAU + Math.PI / 6;
    const cr = 10.5 + (i % 2 ? 1.2 : -0.4);
    const cx = Math.cos(th) * cr, cz = Math.sin(th) * cr;
    clusters.push({ x: cx, z: cz });
    const n = 4 + (i % 2);
    for (let k = 0; k < n; k++){
      const m = new THREE.Mesh(shard, (k + i) % 3 === 0 ? crysB : crysA);
      const h = 1.3 + rand() * 1.4;
      const off = k === 0 ? 0 : 0.7;
      const a = rand() * TAU;
      m.scale.set(0.42 + rand() * 0.2, h, 0.42 + rand() * 0.2);
      m.position.set(cx + Math.cos(a) * off, h * 0.82, cz + Math.sin(a) * off);
      m.rotation.set((rand() - 0.5) * 0.5, rand() * TAU, (rand() - 0.5) * 0.5);
      m.castShadow = true;
      g.add(m);
    }
    const gl = new THREE.Mesh(glowGeo, glowMat);
    gl.rotation.x = -Math.PI / 2; gl.position.set(cx, 0.035, cz);
    g.add(gl);
  }

  /* ---------------------------------------------------------- the dais -- */
  const daisMat = keep(new THREE.MeshStandardMaterial({ color: 0x0f0c14, roughness: 0.6, metalness: 0.3 }));
  const dais = new THREE.Mesh(keep(new THREE.CircleGeometry(3.6, 64)), daisMat);
  dais.rotation.x = -Math.PI / 2; dais.position.y = 0.012; dais.receiveShadow = true;
  dais.userData.noMerge = true;
  g.add(dais);
  const daisRimMat = keep(new THREE.MeshStandardMaterial({ color: 0x2ee6cf, emissive: 0x2ee6cf, emissiveIntensity: 1.5, roughness: 0.3 }));
  const daisRim = new THREE.Mesh(keep(new THREE.TorusGeometry(3.62, 0.09, 6, 96)), daisRimMat);
  daisRim.rotation.x = Math.PI / 2; daisRim.position.y = 0.06;
  g.add(daisRim);

  // the heart seed, turning over the dais. Kept high and small: from this
  // camera anything tall in the middle of the pit would hide the player.
  const seed = new THREE.Group();
  seed.position.set(0, 3.4, 0);
  const seedMat = keep(new THREE.MeshStandardMaterial({ color: 0xffd1ea, emissive: 0xff2f9a, emissiveIntensity: 2.4, roughness: 0.25 }));
  const seedCore = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.7, 0)), seedMat);
  seedCore.scale.set(1, 1.5, 1);
  const haloMat = keep(new THREE.MeshBasicMaterial({ color: 0xff8ed0, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const haloA = new THREE.Mesh(keep(new THREE.TorusGeometry(1.35, 0.045, 5, 48)), haloMat);
  const haloB = new THREE.Mesh(keep(new THREE.TorusGeometry(1.75, 0.035, 5, 48)), haloMat);
  seed.add(seedCore, haloA, haloB);
  seed.userData.noMerge = true;
  g.add(seed);

  /* ------------------------------------------------------ spore vents -- */
  const VENT_R = 3.0;                                  // what an eruption hits
  const vents = [];
  const ventMouthMat = keep(new THREE.MeshStandardMaterial({ color: 0x241620, roughness: 0.75 }));
  const ventMouth = keep(new THREE.TorusGeometry(1.05, 0.3, 8, 28));
  for (let i = 0; i < 4; i++){
    const th = (i / 4) * TAU + Math.PI / 4;
    const x = Math.cos(th) * 15.6, z = Math.sin(th) * 15.6;
    const m = new THREE.Mesh(ventMouth, ventMouthMat);
    m.rotation.x = Math.PI / 2; m.position.set(x, 0.14, z); m.castShadow = true;
    g.add(m);
    vents.push({ x, z, state: 'idle', t: 0, glow: 0 });
  }
  // the glowing throat of each vent, and the telegraph ring round it
  const coreMesh = new THREE.InstancedMesh(keep(new THREE.CircleGeometry(0.95, 28)),
    keep(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), 4);
  const teleMesh = new THREE.InstancedMesh(keep(new THREE.RingGeometry(0.86, 1.0, 48)),
    keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), 4);
  for (const im of [coreMesh, teleMesh]){
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(12), 3);
    im.frustumCulled = false;
    im.userData.noMerge = true;
    g.add(im);
  }
  teleMesh.renderOrder = 3;

  /* ------------------------------------------------------ the armory -- */
  // on the south rim, near where you come in: coins spent between waves are
  // most of how an endless run keeps going
  const store = { x: -7.2, z: R - 4.8, inCorridor: false };
  const kioskMat = keep(new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.55, metalness: 0.25 }));
  const screenMat = keep(new THREE.MeshStandardMaterial({ color: 0x73ede1, emissive: 0x73ede1, emissiveIntensity: 1.4 }));
  const kiosk = new THREE.Mesh(keep(new THREE.BoxGeometry(2.4, 2.1, 0.9)), kioskMat);
  kiosk.position.set(store.x, 1.05, store.z + 2.1); kiosk.castShadow = true;
  g.add(kiosk);
  const screen = new THREE.Mesh(keep(new THREE.BoxGeometry(1.8, 0.9, 0.06)), screenMat);
  screen.position.set(store.x, 1.35, store.z + 1.62);
  g.add(screen);
  const padMat = keep(new THREE.MeshBasicMaterial({ color: 0x73ede1, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const pad = new THREE.Mesh(keep(new THREE.RingGeometry(1.05, 1.3, 40)), padMat);
  pad.rotation.x = -Math.PI / 2; pad.position.set(store.x, 0.04, store.z);
  pad.userData.noMerge = true;
  g.add(pad);
  const signTex = keep(signTexture('ARMORY', 'STAND ON PAD · 2 SECONDS'));
  const sign = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: signTex, depthWrite: false })));
  sign.scale.set(3.6, 1.12, 1);
  sign.position.set(store.x, 3.0, store.z + 2.1);
  sign.userData.noMerge = true;
  g.add(sign);
  store.label = sign;   // the shop hides this so it doesn't hang in the shop camera's view

  /* ------------------------------------------------------ the abyss -- */
  // giant trunks falling away into the dark past the rim — the scale of the
  // thing this pit is the bottom of
  const trunkMat = keep(new THREE.MeshStandardMaterial({ color: 0x1c1018, roughness: 0.9 }));
  const trunkGeo = keep(new THREE.CylinderGeometry(1.6, 3.4, 44, 10, 1));
  for (let i = 0; i < 9; i++){
    const th = (i / 9) * TAU + rand() * 0.4;
    const r = R + 9 + rand() * 12;
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(Math.cos(th) * r, 8, Math.sin(th) * r);
    t.rotation.set((rand() - 0.5) * 0.3, rand() * TAU, (rand() - 0.5) * 0.3);
    g.add(t);
  }

  /* ------------------------------------------------------ the spores -- */
  const SP = 520;
  const spPos = new Float32Array(SP * 3), spSeed = new Float32Array(SP);
  for (let i = 0; i < SP; i++){
    const a = rand() * TAU, r = Math.sqrt(rand()) * (R + 3);
    spPos[i * 3] = Math.cos(a) * r; spPos[i * 3 + 1] = rand() * 11; spPos[i * 3 + 2] = Math.sin(a) * r;
    spSeed[i] = rand();
  }
  const spGeo = keep(new THREE.BufferGeometry());
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('aSeed', new THREE.BufferAttribute(spSeed, 1));
  const spTex = keep(glowTexture());
  const spMat = keep(new THREE.PointsMaterial({ color: 0xff9ad5, size: 0.24, map: spTex, transparent: true,
    opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  spMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'uniform float uTime, uDanger;\nattribute float aSeed;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>', `#include <begin_vertex>
  // rise and wrap, and swirl slowly round the pit — all on the GPU
  transformed.y = mod(position.y + uTime * (0.22 + aSeed * 0.35) * (1.0 + uDanger), 11.0);
  float ang = uTime * 0.04 * (0.5 + aSeed);
  float cs = cos(ang), sn = sin(ang);
  transformed.xz = mat2(cs, -sn, sn, cs) * position.xz;`);
  };
  const spores = new THREE.Points(spGeo, spMat);
  spores.frustumCulled = false;
  spores.userData.noMerge = true;
  g.add(spores);

  /* -------------------------------------------- merge static geometry -- */
  // Grouped by material only. Splitting by sector for frustum culling was tried
  // and measured: at this camera zoom most of the pit is on screen at once, so
  // culling saved almost nothing while turning ~20 meshes into 64 and doubling
  // the shadow-pass calls. The whole pit is ~14k triangles; on a low-end GPU
  // the draw calls are the cost that matters, not the triangles.
  {
    const buckets = new Map();
    const originals = [];
    for (const o of g.children){
      if (!o.isMesh || o.isInstancedMesh || o.userData.noMerge) continue;
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}`;
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
      o.updateMatrix();
      let geo = o.geometry.clone().applyMatrix4(o.matrix);
      if (geo.index) geo = geo.toNonIndexed();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(name)) geo.deleteAttribute(name);
      buckets.get(key).geos.push(geo);
      originals.push(o);
    }
    for (const o of originals) g.remove(o);
    for (const b of buckets.values()){
      const merged = mergeGeometries(b.geos);
      for (const x of b.geos) x.dispose();
      if (!merged) continue;
      keep(merged);
      const m = new THREE.Mesh(merged, b.mat);
      m.castShadow = b.cast; m.receiveShadow = true;
      g.add(m);
    }
  }

  /* ------------------------------------------------------- colliders -- */
  const colliders = [
    ...clusters.map(c => ({ x: c.x, z: c.z, hw: 1.05, hd: 1.05 })),
    ...touchdowns.map(t => ({ x: t.x, z: t.z, hw: 0.7, hd: 0.7 })),
    { x: store.x, z: store.z + 2.1, hw: 1.25, hd: 0.5 },
  ];

  // start well inside the pit: on a tall phone the camera shows a lot of what is
  // behind you, and spawning by the south rim filled half the screen with abyss
  const entryPos = new THREE.Vector3(0, 0, R - 11);
  const zone = { name: 'HEARTWOOD PIT', index: 0, x0: -R, x1: R, z0: -R, z1: R, started: true, budget: 0 };

  /* ----------------------------------------------------- the dynamics -- */
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), flat = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const vp = new THREE.Vector3(), vs = new THREE.Vector3(), col = new THREE.Color();
  let ventCd = 6, pulseT = 99;

  const api = {
    group: g,
    arena: true,
    R,
    store,
    stairs: new THREE.Vector3(0, 0, -R - 10),       // there is no way out of the pit
    plan: null,
    zones: [zone],
    stairsSign: null,
    bounds: { x: R, z: R, r: R - 0.55 },
    rect: { x0: -R, x1: R, z0: -R, z1: R, r: R - 0.5 },
    colliders,
    entryPos,
    exitPos: new THREE.Vector3(0, 1.2, -R),
    touchdowns,
    vents,
    ventsOn: false,
    debug: { removed: 0 },
    roomAt: (x, z) => (Math.hypot(x, z) <= R ? 0 : -1),
    routeDoor: () => null,
    isTraversable: () => true,
    seal(){}, unlockExit(){},

    /** Send a shockwave across the floor and a surge down the roots. */
    pulse(){ pulseT = 0; uniforms.uSurge.value = 1; },

    setDanger(k){ uniforms.uDanger.value = Math.max(0, Math.min(1, k)); },

    /** The heart seed goes dark while Heartroot holds the dais. */
    setSeed(on){ seed.visible = on; },

    /** Visual tick. Safe to call every frame, fighting or not. */
    animate(t, dt){
      uniforms.uTime.value = t;
      pulseT += dt;
      uniforms.uPulseR.value = pulseT * 17;
      uniforms.uPulseA.value = Math.max(0, 1 - pulseT / 1.9);
      uniforms.uSurge.value = Math.max(0, uniforms.uSurge.value - dt * 0.8);
      seed.rotation.y += dt * 0.7;
      seedCore.position.y = Math.sin(t * 1.6) * 0.18;
      haloA.rotation.set(t * 0.9, t * 0.4, 0);
      haloB.rotation.set(-t * 0.6, 0, t * 0.7);
      seedMat.emissiveIntensity = 2.2 + Math.sin(t * 3.1) * 0.5 + uniforms.uSurge.value * 5;
      padMat.opacity = 0.55 + Math.sin(t * 3) * 0.2;

      for (let i = 0; i < vents.length; i++){
        const v = vents[i];
        let glow = 0.25 + 0.1 * Math.sin(t * 2 + i), tele = 0, tcol = 0xffb347;
        if (v.state === 'charge'){
          const k = Math.min(1, v.t / 1.5);
          glow = 0.4 + k * 2.4 * (0.8 + 0.2 * Math.sin(t * 30));
          tele = k; tcol = k > 0.75 ? 0xffffff : 0xffb347;
        } else if (v.state === 'burst'){
          const k = Math.max(0, 1 - v.t / 0.6);
          glow = 3 * k; tele = k; tcol = 0xff5a3c;
        }
        vp.set(v.x, 0.05, v.z); vs.setScalar(1);
        mtx.compose(vp, flat, vs);
        coreMesh.setMatrixAt(i, mtx);
        col.setRGB(1.0 * glow, 0.55 * glow, 0.16 * glow);
        coreMesh.setColorAt(i, col);
        vp.y = 0.07;
        vs.setScalar(tele > 0 ? (v.state === 'charge' ? 0.4 + tele * (VENT_R - 0.4) : VENT_R + (1 - tele) * 0.8) : 0.0001);
        mtx.compose(vp, flat, vs);
        teleMesh.setMatrixAt(i, mtx);
        col.set(tcol).multiplyScalar(tele > 0 ? 0.9 : 0);
        teleMesh.setColorAt(i, col);
      }
      coreMesh.instanceMatrix.needsUpdate = true; coreMesh.instanceColor.needsUpdate = true;
      teleMesh.instanceMatrix.needsUpdate = true; teleMesh.instanceColor.needsUpdate = true;
    },

    /* Vent eruptions. The telegraph is 1.5 s of a ring growing to the exact
       radius it will hit — so a hit is always a read you lost, and standing a
       crowd on a charging vent is a deliberate play.
       @returns {number} damage to the player this frame */
    updateVents(dt, ctx){
      const { player, enemies, fx, engine, audio, wave } = ctx;
      let dmg = 0;
      for (const v of vents){
        if (v.state === 'idle') continue;
        v.t += dt;
        if (v.state === 'charge' && v.t >= 1.5){
          v.state = 'burst'; v.t = 0;
          if (Math.hypot(player.pos.x - v.x, player.pos.z - v.z) < VENT_R + 0.3) dmg = Math.max(dmg, 0.2);
          const hurt = 10 + wave * 2.2;
          for (const e of enemies.list){
            if (!e.alive) continue;
            const dx = e.pos.x - v.x, dz = e.pos.z - v.z, d = Math.hypot(dx, dz);
            if (d < VENT_R + e.def.radius) enemies.hit(e, hurt, dx / (d || 1), dz / (d || 1), fx);
          }
          fx.ring({ x: v.x, y: 0.1, z: v.z }, { color: 0xffb347, from: 0.4, to: VENT_R * 2.2, life: 0.5 });
          fx.burst({ x: v.x, y: 0.3, z: v.z }, { count: 26, color: 0xff9a3c, speed: 9, size: 0.2, life: 0.9, up: 9, grav: 6 });
          fx.burst({ x: v.x, y: 0.3, z: v.z }, { count: 14, color: 0xff5db1, speed: 5, size: 0.28, life: 1.2, up: 6, grav: 3 });
          engine.addShake(0.14);
          audio.lash?.();
        } else if (v.state === 'burst' && v.t >= 0.6){
          v.state = 'idle'; v.t = 0;
        }
      }
      if (!api.ventsOn) return dmg;
      ventCd -= dt;
      const busy = vents.filter(v => v.state !== 'idle').length;
      const cap = wave >= 12 ? 2 : 1;
      if (ventCd <= 0 && busy < cap){
        // favour the vent nearest the player, so it is a pressure, not scenery
        const idle = vents.filter(v => v.state === 'idle');
        idle.sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) - Math.hypot(b.x - player.pos.x, b.z - player.pos.z));
        const pick = Math.random() < 0.65 ? idle[0] : idle[Math.floor(Math.random() * idle.length)];
        if (pick){ pick.state = 'charge'; pick.t = 0; audio.charge?.(); }
        ventCd = (5.5 + Math.random() * 4) / (1 + wave * 0.035);
      }
      return dmg;
    },

    resetVents(){
      for (const v of vents){ v.state = 'idle'; v.t = 0; }
      ventCd = 6;
    },

    dispose(){
      scene.remove(g);
      for (const x of own) x.dispose?.();
      g.clear();
    },
  };
  api.animate(0, 0);
  return api;
}
