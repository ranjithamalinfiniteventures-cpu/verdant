import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FluxLanes, FLUX_HALF_WIDTH, FLUX_CHARGE, inFluxLane } from './flux-lanes.js';

/* ECLIPSE FOUNDRY — an abandoned star engine hanging in an orbital drydock.
   All scenery is native geometry: merged metalwork, one animated floor, one
   corona shader, and a single instanced debris field. Nothing is downloaded.
   The room contract matches Heartwood so its wave/combat loop stays shared. */
export const ECLIPSE_R = 21;
export const ECLIPSE_KEY = 'verdant.eclipse.v1';
const TAU = Math.PI * 2;

export function buildEclipse(scene){
  const R = ECLIPSE_R;
  const group = new THREE.Group(); group.name = 'eclipse-foundry'; scene.add(group);
  const owned = new Set(), buckets = new Map();
  const keep = object => (owned.add(object), object);
  const metal = (color, roughness = 0.5, metalness = 0.6) => keep(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const glow = (color, strength = 1) => keep(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: strength, roughness: 0.35, metalness: 0.3 }));
  const dark = metal(0x182736), plate = metal(0x354955), edge = metal(0x768a91, 0.35);
  const cyan = glow(0x3de6ee, 1.25), gold = glow(0xffb85a, 1.3), black = metal(0x080f18);
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const transform = new THREE.Object3D();
  function part(geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0){
    transform.position.set(x, y, z); transform.rotation.set(0, ry, 0); transform.scale.set(sx, sy, sz); transform.updateMatrix();
    const copy = geometry.clone().applyMatrix4(transform.matrix);
    // Static batches only need normals and positions, regardless of primitive.
    for (const key of Object.keys(copy.attributes)) if (!['position', 'normal'].includes(key)) copy.deleteAttribute(key);
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(copy);
  }
  function mesh(geometry, material, x = 0, y = 0, z = 0){
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); group.add(m); return m;
  }
  function ring(inner, outer, material, y = 0.025, segments = 96){
    const m = mesh(keep(new THREE.RingGeometry(inner, outer, segments)), material, 0, y, 0);
    m.rotation.x = -Math.PI / 2; return m;
  }

  const lanes = new FluxLanes();
  const uniforms = {
    uTime: { value: 0 }, uPulse: { value: 0 }, uDanger: { value: 0 },
    uLanes: { value: new THREE.Vector4() },
  };

  // Machined panels, fine cyan circuit traces, and a travelling gold pulse.
  // Amber hatching fills the FULL damage width throughout the charge.
  const floorMat = metal(0x142733, 0.7, 0.35);
  floorMat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vFoundry;\n' + shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nvFoundry = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 vFoundry;
uniform float uTime, uPulse, uDanger;
uniform vec4 uLanes;
float flux(float distanceToLane, float phase, vec2 p){
  float inside = 1.0 - smoothstep(${FLUX_HALF_WIDTH - 0.04}, ${FLUX_HALF_WIDTH}, distanceToLane);
  float border = 1.0 - smoothstep(0.025, 0.08, abs(distanceToLane - ${FLUX_HALF_WIDTH}));
  float hatch = step(0.58, fract((p.x + p.y) * 1.3 - uTime * 0.8));
  return step(0.001, phase) * (border * 1.8 + inside * (phase > 1.0 ? 2.0 : 0.18 + hatch * 0.32 + phase * 0.25));
}
` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
vec2 p = vFoundry.xz;
vec2 tile = abs(fract(p / 3.5 + 0.5) - 0.5) * 3.5;
float seam = 1.0 - smoothstep(0.025, 0.06, min(tile.x, tile.y));
float brushed = fract(sin(dot(floor(p * 100.0), vec2(127.1, 311.7))) * 43758.5453);
diffuseColor.rgb *= (1.0 - seam * 0.5) * (0.9 + brushed * 0.12);
`) .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float r = length(p);
float channel = min(abs(abs(p.x) - 7.0), abs(abs(p.y) - 7.0));
float trace = (1.0 - smoothstep(0.025, 0.09, channel)) * (0.25 + 0.2 * sin(p.x * 0.6 + p.y * 0.6 - uTime));
float circuit = (1.0 - smoothstep(0.025, 0.06, min(abs(tile.x - 0.3), abs(tile.y - 0.3)))) * 0.006;
float pulse = uPulse * exp(-pow(r - (1.0 - uPulse) * 32.0, 2.0) * 0.65);
float warning = flux(abs(p.x + 7.0), uLanes.x, p) + flux(abs(p.y - 7.0), uLanes.y, p)
              + flux(abs(p.x - 7.0), uLanes.z, p) + flux(abs(p.y + 7.0), uLanes.w, p);
totalEmissiveRadiance += vec3(0.12, 0.85, 1.0) * (trace + circuit)
  + vec3(1.0, 0.48, 0.09) * (warning + pulse * 1.7);
`);
  };
  const floor = mesh(keep(new THREE.CircleGeometry(R + 0.12, 128)), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  const hull = keep(new THREE.CylinderGeometry(R, R - 1, 1.8, 64));
  part(hull, dark, 0, -0.92);
  ring(R - 0.55, R - 0.39, cyan); // Matches the circular movement boundary.
  ring(R - 0.25, R + 0.12, edge, 0.016);
  ring(R - 1.25, R - 0.75, plate, 0.012);

  // Mechanical teeth and suspended arms give the round playfield a hard,
  // twelve-sided silhouette. The foreground stays low for camera visibility.
  const fin = keep(new THREE.CylinderGeometry(0.75, 1.0, 1, 6));
  for (let i = 0; i < 24; i++){
    const a = i * TAU / 24, x = Math.cos(a), z = Math.sin(a), ry = -a;
    part(box, plate, x * (R + 0.65), -0.35, z * (R + 0.65), 2, 0.85, 1.8, ry);
    part(box, gold, x * (R + 0.8), 0.09, z * (R + 0.8), 1.1, 0.08, 0.12, ry);
    part(box, black, x * (R + 0.66), 0.1, z * (R + 0.66), 1.6, 0.12, 1.4, ry);
    part(box, edge, x * (R + 0.68), -0.56, z * (R + 0.68), 2.04, 0.12, 1.9, ry);
    for (const side of [-1, 1]){
      part(box, edge, x * (R + 0.65) + z * side * 0.55, 0.2, z * (R + 0.65) - x * side * 0.55, 1.7, 0.16, 0.14, ry);
      part(box, dark, x * (R + 0.7) + z * side * 0.38, -1.1, z * (R + 0.7) - x * side * 0.38, 1.6, 1.1, 0.17, ry);
    }
    if (i % 2 === 0){
      part(box, dark, x * (R + 3), -1.8, z * (R + 3), 4, 0.7, 1.25, ry);
      part(fin, plate, x * (R + 5), -1.9, z * (R + 5), 1.8, 3, 1.8);
      part(box, cyan, x * (R + 3), -1.4, z * (R + 3), 3.2, 0.06, 0.12, ry);
    }
  }

  // Eight rift docks are readable enemy entry points.
  const touchdowns = [];
  const portalGeo = keep(new THREE.TorusGeometry(1.2, 0.12, 6, 24));
  for (let i = 0; i < 8; i++){
    const a = (i + 0.5) * TAU / 8, x = Math.cos(a) * 19, z = Math.sin(a) * 19;
    touchdowns.push({ x, z, th: a });
    part(fin, edge, x, 0.15, z, 1.6, 0.3, 1.6);
    part(fin, black, x, 0.33, z, 1.3, 0.32, 1.3);
    // Tall antennae only on the rear half; foreground docks remain low.
    const h = z < 0 ? 2.7 : 0.9;
    part(box, plate, x * 1.105, h / 2, z * 1.105, 0.7, h, 0.8, -a);
    part(box, cyan, x * 1.09, h / 2, z * 1.09, 0.1, h * 0.75, 0.13, -a);
    const dock = mesh(portalGeo, cyan, x, 0.66, z);
    dock.rotation.x = -Math.PI / 2; dock.scale.y = 0.6;
  }

  // Low relay islands make four cover corners; all four flux lanes stay open.
  const colliders = [], relays = [];
  const pedestal = keep(new THREE.CylinderGeometry(1.4, 1.7, 0.8, 6));
  const shard = keep(new THREE.OctahedronGeometry(0.65));
  for (const x of [-11.5, 11.5]) for (const z of [-11.5, 11.5]){
    part(pedestal, plate, x, 0.4, z);
    part(fin, dark, x, 1.1, z, 1, 1.2, 1);
    part(box, cyan, x, 1.62, z, 1.4, 0.09, 1.4);
    part(pedestal, edge, x, 0.075, z, 1.1, 0.16, 1.1);
    const relay = mesh(shard, gold, x, 2.25, z); relay.scale.set(0.65, 1.1, 0.65); relays.push(relay);
    colliders.push({ x, z, hw: 1.45, hd: 1.45 });
  }

  // Reactor iris: flat walkable centre with a small gyroscope above it.
  ring(0, 3.7, black, 0.015, 12);
  ring(3.65, 3.85, gold, 0.03, 12);
  ring(2.65, 2.72, cyan, 0.032, 12);
  for (let i = 0; i < 12; i++){
    const a = i * TAU / 12;
    part(box, plate, Math.cos(a) * 2.05, 0.027, Math.sin(a) * 2.05, 1.8, 0.03, 0.4, -a + 0.3);
  }
  const seed = new THREE.Group(); seed.position.y = 2.7; group.add(seed);
  const core = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.48)), gold); seed.add(core);
  const gyros = [];
  for (let i = 0; i < 2; i++){
    const m = new THREE.Mesh(keep(new THREE.TorusGeometry(0.95 + i * 0.25, 0.04, 5, 48)), i ? cyan : edge);
    seed.add(m); gyros.push(m);
  }

  // The eclipse hangs behind the arena, never between the player and camera.
  const sun = new THREE.Group(); sun.position.set(0, 6, -29); sun.rotation.x = -0.6; group.add(sun);
  const coronaMat = keep(new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uPulse, uDanger;
void main(){
  vec2 p=(vUv-0.5)*2.0; float r=length(p); float a=atan(p.y,p.x);
  float tendril=sin(a*17.0+uTime*0.7+sin(a*7.0-uTime)*2.0)*0.012;
  float edge=0.57+tendril; float outer=max(0.0,r-edge);
  float glow=exp(-outer*13.0)*smoothstep(edge-0.015,edge+0.004,r);
  float rays=(0.65+0.35*sin(a*51.0+sin(a*19.0+uTime)*3.0))*exp(-outer*6.0);
  float alpha=(glow+rays*0.24)*smoothstep(edge-0.01,edge+0.01,r)*(1.0-smoothstep(0.85,1.0,r));
  vec3 col=mix(vec3(1.0,0.22,0.03),vec3(1.0,0.87,0.52),pow(glow,3.0));
  gl_FragColor=vec4(col*(1.5+uPulse*0.4+uDanger*0.25),alpha);
}`,
  }));
  const corona = new THREE.Mesh(keep(new THREE.PlaneGeometry(22, 22)), coronaMat); sun.add(corona);
  const eclipse = new THREE.Mesh(keep(new THREE.SphereGeometry(6.15, 48, 24)), keep(new THREE.MeshBasicMaterial({ color: 0x030912 })));
  eclipse.scale.z = 0.12; eclipse.position.z = 0.12; sun.add(eclipse);
  const eclipseRim = new THREE.Mesh(keep(new THREE.TorusGeometry(6.27, 0.06, 6, 128)), gold); eclipseRim.position.z = 0.2; sun.add(eclipseRim);
  const orbit = new THREE.Mesh(keep(new THREE.TorusGeometry(8.4, 0.12, 6, 96, Math.PI * 1.6)), plate);
  orbit.rotation.z = 0.5; sun.add(orbit);
  const orbitLight = new THREE.Mesh(keep(new THREE.TorusGeometry(8.65, 0.045, 5, 96, Math.PI * 1.25)), cyan); sun.add(orbitLight);

  // Broken orbital gantries beyond the rear rim frame the star engine.
  for (const side of [-1, 1]){
    for (let i = 0; i < 5; i++){
      part(box, dark, side * (20 + i * 1.7), 0.5 + i * 1.1, -22 + i * 0.6, 2.7, 1.0, 1.5, side * 0.24);
      part(box, cyan, side * (20 + i * 1.7), 1.03 + i * 1.1, -22 + i * 0.6, 2.1, 0.08, 0.14, side * 0.24);
    }
  }

  // Sparse, deterministic debris: one draw call, slow collective rotation.
  const debris = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1, 0)), dark, 64);
  keep(debris); debris.frustumCulled = false;
  let randSeed = 59271;
  const rand = () => ((randSeed = (randSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 64; i++){
    const a = rand() * TAU, r = 28 + rand() * 22;
    transform.position.set(Math.cos(a) * r, -4 - rand() * 11, Math.sin(a) * r);
    transform.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    transform.scale.set(0.3 + rand() * 1.4, 0.3 + rand(), 0.3 + rand()); transform.updateMatrix();
    debris.setMatrixAt(i, transform.matrix);
  }
  group.add(debris);

  // A faint blue accretion mist below the deck makes the suspended hull read
  // against space. It is one cheap plane, not a volumetric fog effect.
  const mist = mesh(keep(new THREE.PlaneGeometry(150, 150)), keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; void main(){
      vec2 p=(vUv-0.5)*2.0; float r=length(p);
      float wisps=sin(p.x*15.0+sin(p.y*12.0)*1.5)*sin(p.y*18.0+p.x*4.0)*0.15+0.3;
      float a=exp(-pow((r-0.5)*3.5,2.0))*(1.0-smoothstep(0.7,1.0,r));
      gl_FragColor=vec4(vec3(0.07,0.17,0.29)*wisps,a*0.7);
    }`,
  })), 0, -12, 0);
  mist.rotation.x = -Math.PI / 2;

  const starPos = new Float32Array(220 * 3);
  for (let i = 0; i < 220; i++){
    const a = rand() * TAU, r = 40 + rand() * 35;
    starPos.set([Math.cos(a) * r, -8 + rand() * 35, Math.sin(a) * r], i * 3);
  }
  const starGeo = keep(new THREE.BufferGeometry()); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  group.add(new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0x94c9e8, size: 0.11, transparent: true, opacity: 0.6, depthWrite: false }))));

  // Solid amber edge rails mark each lane even with bloom disabled.
  const beams = [];
  for (const lane of lanes.lanes){
    const alongX = lane.axis === 'z', length = Math.sqrt((R - 0.55) ** 2 - (7 + FLUX_HALF_WIDTH) ** 2) * 2;
    const beamMat = keep(new THREE.MeshBasicMaterial({ color: 0xffce81, transparent: true, opacity: 0, depthWrite: false }));
    const beam = mesh(box, beamMat, alongX ? 0 : lane.offset, 0.18, alongX ? lane.offset : 0);
    beam.scale.set(alongX ? length : FLUX_HALF_WIDTH * 2, 0.25, alongX ? FLUX_HALF_WIDTH * 2 : length);
    beam.visible = false; beams.push(beam);
    for (const end of [-1, 1]){
      const x = alongX ? end * 19.5 : lane.offset, z = alongX ? lane.offset : end * 19.5;
      part(box, plate, x, 0.28, z, alongX ? 0.5 : 2.6, 0.55, alongX ? 2.6 : 0.5);
      part(box, gold, x, 0.6, z, alongX ? 0.26 : 2.1, 0.1, alongX ? 2.1 : 0.26);
    }
  }

  const store = { x: -4, z: 15.7, inCorridor: false };
  part(box, dark, store.x, 0.85, store.z + 2, 2.7, 1.7, 1.1);
  part(box, edge, store.x, 1.75, store.z + 2, 2.8, 0.18, 1.2);
  part(box, cyan, store.x, 1.05, store.z + 1.42, 1.9, 0.7, 0.06);
  const padMat = keep(new THREE.MeshBasicMaterial({ color: 0x54edf2, transparent: true, opacity: 0.8, depthWrite: false }));
  const pad = mesh(keep(new THREE.RingGeometry(1.05, 1.3, 40)), padMat, store.x, 0.045, store.z); pad.rotation.x = -Math.PI / 2;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#091b27'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#54edf2'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 508, 124);
  ctx.textAlign = 'center'; ctx.fillStyle = '#e9ffff'; ctx.font = '800 54px Outfit, sans-serif'; ctx.fillText('ARMORY', 256, 61);
  ctx.fillStyle = '#65e4ee'; ctx.font = '600 22px Outfit, sans-serif'; ctx.fillText('STAND ON PAD · 2 SECONDS', 256, 104);
  const tex = keep(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthWrite: false })));
  sign.position.set(store.x, 2.8, store.z + 2); sign.scale.set(3.6, 0.9, 1); group.add(sign); store.label = sign;
  colliders.push({ x: store.x, z: store.z + 2, hw: 1.4, hd: 0.6 });

  for (const [material, geometries] of buckets){
    const batch = mesh(keep(mergeGeometries(geometries)), material);
    batch.castShadow = !material.emissive?.getHex(); batch.receiveShadow = true;
    for (const geometry of geometries) geometry.dispose();
  }

  const zone = { name: 'ECLIPSE FOUNDRY', index: 0, x0: -R, x1: R, z0: -R, z1: R, started: true, budget: 0 };
  const api = {
    group, arena: true, R, store, colliders, touchdowns,
    entryPos: new THREE.Vector3(0, 0, 10), exitPos: new THREE.Vector3(0, 0, -R),
    stairs: new THREE.Vector3(0, 0, -R - 10), stairsSign: null, plan: null,
    zones: [zone], bounds: { x: R, z: R, r: R - 0.55 },
    rect: { x0: -R, x1: R, z0: -R, z1: R, r: R - 0.55 },
    ventsOn: false, lanes, debug: { removed: 0 },
    roomAt: (x, z) => Math.hypot(x, z) <= R ? 0 : -1,
    routeDoor: () => null, isTraversable: () => true, seal(){}, unlockExit(){},
    pulse(){ uniforms.uPulse.value = 1; },
    setDanger(k){ uniforms.uDanger.value = THREE.MathUtils.clamp(k, 0, 1); },
    setSeed(on){ seed.visible = on; },
    animate(t, dt){
      uniforms.uTime.value = t;
      uniforms.uPulse.value = Math.max(0, uniforms.uPulse.value - dt * 0.55);
      seed.rotation.y += dt * 0.45; core.rotation.z += dt * 0.35;
      gyros[0].rotation.set(t * 0.55, 0.4, t * 0.18); gyros[1].rotation.set(-t * 0.35, 1.1, t * 0.26);
      orbit.rotation.z += dt * 0.025; orbitLight.rotation.z -= dt * 0.04;
      debris.rotation.y += dt * 0.009;
      padMat.opacity = 0.6 + Math.sin(t * 2) * 0.15;
      relays.forEach((relay, i) => { relay.rotation.y += dt * 0.4; relay.position.y = 2.25 + Math.sin(t * 1.4 + i) * 0.18; });
      lanes.lanes.forEach((lane, i) => {
        const charge = lane.phase === 'charge', burst = lane.phase === 'burst';
        uniforms.uLanes.value.setComponent(i, burst ? 2 : charge ? Math.max(0.01, lane.t / FLUX_CHARGE) : 0);
        beams[i].visible = burst; beams[i].material.opacity = burst ? 0.38 + Math.sin(t * 35) * 0.12 : 0;
      });
    },
    updateVents(dt, { player, enemies, fx, engine, audio, wave }){
      const events = lanes.update(dt, api.ventsOn, wave);
      if (events.charge.length) audio.charge?.();
      for (const lane of events.fire){
        const p = { x: lane.axis === 'x' ? lane.offset : 0, y: 0.2, z: lane.axis === 'z' ? lane.offset : 0 };
        fx.ring(p, { color: 0xffbf69, from: 0.3, to: 3.2, life: 0.4 });
        fx.burst(p, { count: 18, color: 0x8cf8ff, speed: 7, size: 0.12, life: 0.6, up: 4, grav: 3 });
        engine.addShake(0.11); audio.lash?.();
      }
      let damage = 0;
      for (const lane of lanes.lanes){
        if (lane.phase !== 'burst') continue;
        if (!lane.playerHit && inFluxLane(lane, player.pos, 0.3)){
          damage = Math.max(damage, 0.2); lane.playerHit = true;
        }
        for (const e of enemies.list){
          if (!e.alive || lane.hits.has(e) || !inFluxLane(lane, e.pos, e.def.radius)) continue;
          lane.hits.add(e);
          const sign = Math.sign(e.pos[lane.axis] - lane.offset) || 1;
          enemies.hit(e, 10 + wave * 2.2, lane.axis === 'x' ? sign : 0, lane.axis === 'z' ? sign : 0, fx);
        }
      }
      return damage;
    },
    resetVents(){ lanes.reset(); uniforms.uLanes.value.set(0, 0, 0, 0); beams.forEach(beam => { beam.visible = false; }); },
    dispose(){ scene.remove(group); for (const object of owned) object.dispose?.(); group.clear(); },
  };
  api.animate(0, 0);
  return api;
}
