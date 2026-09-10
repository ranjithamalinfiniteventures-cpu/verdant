import * as THREE from 'three';
import { rbox, cyl, mat, emissive, PAL, sharedFloorTexture } from '../core/geo.js';
import { makePlan } from './floorplan.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WALL_H = 3.2, WALL_T = 0.7, DOOR = 3.2;

const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/* ---------------------------------------------------------------- layouts --
   Rules every layout obeys: the centre stays open, there is always a lane to
   circle, and nothing is placed in a door approach (enforced, not trusted). */
const LAYOUTS = {
  arena(){}, // Open floor for boss telegraphs and dodging.
  // clean and legible — the tutorial room
  cryo({ prop, tank, hw, hd }){
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      prop(2.2, 1.4, 1.9, sx * (hw - 4.4), sz * (hd - 3.5), { lid: true });
    prop(2.6, 2.4, 0.9, -5.4, -hd + 0.95, { steel: true, band: false });
    prop(2.6, 1.5, 0.9,    0, -hd + 0.95);
    prop(2.6, 2.4, 0.9,  5.4, -hd + 0.95, { steel: true, band: false });
    for (const sz of [-1, 1]){
      prop(0.9, 1.0, 2.4, -hw + 1.1, sz * 3.0, { band: false });
      prop(0.9, 1.0, 2.4,  hw - 1.1, sz * 3.0, { band: false });
    }
    tank(-hw + 1.4, hd - 1.9); tank(hw - 1.4, -hd + 1.9, 1.7);
  },

  // pillars down the long axis: fast lanes top and bottom, a squeeze in the middle
  spine({ prop, tank, hw, hd }){
    for (let i = -2; i <= 2; i++){
      if (i === 0) continue;
      prop(1.5, 2.6, 1.5, i * 4.2, 0, { steel: true, band: false });
    }
    const bays = Math.max(3, Math.round(hw / 3.4));
    for (const sz of [-1, 1])
      for (let i = 0; i < bays; i++)
        prop(2.8, 1.3, 1.1, -hw + 2.6 + i * ((hw * 2 - 5.2) / (bays - 1)), sz * (hd - 1.4), { lid: true });
    tank(-hw + 4.2, hd - 2.4); tank(hw - 4.2, -hd + 2.4, 2.3);
  },

  // staggered planter rows — you weave, you never sprint
  hydro({ prop, tank, hw, hd }){
    for (const sz of [-1, 1])
      for (let i = 0; i < 3; i++)
        prop(hw * 0.44, 0.85, 1.5, (i - 1) * (hw * 0.62) + (sz > 0 ? 1.1 : -1.1),
             sz * (hd - 3.2), { band: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      prop(1.1, 2.3, 1.6, sx * (hw - 1.3), sz * (hd - 2.0), { steel: true, band: false });
    tank(-hw + 2.4, 0); tank(hw - 2.4, 0, 1.8);
  },

  // a diamond around an open middle: the ring is always circle-able
  island({ prop, tank, hw, hd }){
    const r = Math.min(hw, hd) * 0.52;
    prop(2.6, 1.6, 1.4,  0, -r, { lid: true });
    prop(2.6, 1.6, 1.4,  0,  r, { lid: true });
    prop(1.4, 1.6, 2.6, -r,  0, { lid: true });
    prop(1.4, 1.6, 2.6,  r,  0, { lid: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      prop(1.6, 2.5, 1.6, sx * (hw - 1.6), sz * (hd - 1.6), { steel: true, band: false });
    tank(0, -hd + 1.6); tank(0, hd - 1.6, 1.9);
  },

  // Broken rows of shelving. This used to be long thin slabs, which from above
  // read as beams poking out of the wall rather than as anything you could take
  // cover behind. Discrete units give the same lanes and look like furniture.
  lanes({ prop, tank, hw, hd }){
    const UW = 2.6, UD = 1.6;
    for (const sz of [-1, 1]){
      const zz = sz * hd * 0.42;
      const n = Math.max(2, Math.floor((hw * 1.15) / (UW + 0.9)));
      for (let i = 0; i < n; i++)
        prop(UW, 1.9, UD, (-hw * 0.62 + i * (UW + 0.9)) * sz, zz, { steel: true, band: false, lid: true });
    }
    // keeps the exact centre of the room open so there is always somewhere to circle
    for (const sz of [-1, 1])
      prop(UW, 1.9, UD, sz * hw * 0.24, sz * hd * 0.13, { steel: true, band: false, lid: true });
    for (const sx of [-1, 1]){
      prop(1.3, 1.2, 1.3, sx * (hw - 2.0), hd - 1.3, { lid: true });
      prop(1.3, 1.2, 1.3, sx * (hw - 2.0), -hd + 1.3, { lid: true });
    }
    tank(-hw * 0.16, hd - 1.5); tank(hw * 0.16, -hd + 1.5, 2.1);
  },

  // asymmetric clusters — derelict, no two builds identical
  scatter({ prop, tank, hw, hd, R }){
    const spots = [];
    for (let i = 0; i < 34 && spots.length < 11; i++){
      const a = R() * Math.PI * 2;
      const rad = 2.9 + R() * (Math.min(hw, hd) - 3.8);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (Math.abs(x) > hw - 1.6 || Math.abs(z) > hd - 1.6) continue;
      if (Math.hypot(x, z) < 2.9) continue;                      // keep the middle clear
      if (spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 3.0)) continue;
      spots.push([x, z]);
    }
    spots.forEach(([x, z], i) => {
      if (i % 4 === 3) return tank(x, z, 1.6 + R() * 0.9);
      const tall = i % 3 === 0;
      prop(1.3 + R() * 1.5, tall ? 2.4 : 1.3, 1.3 + R() * 1.2, x, z,
           { steel: tall, band: !tall, lid: !tall });
    });
  },
};

/* ------------------------------------------------------------------ build -- */
export function buildRoom(scene, cfg = {}){
  const {
    w: W = 22, d: D = 15, layout = 'cryo', seed = 1,
    plan: planKey = 'split', rooms: roomNames = [],
    tower = false, accent = PAL.orange, tint = 0xffffff, cove: coveCol = 0xcdf3ff
  } = cfg;
  const H = WALL_H, T = WALL_T;
  const hw = W/2, hd = D/2;
  const R = rng(seed);
  const plan = makePlan({ w: W, d: D, plan: planKey, names: roomNames });
  const DW = plan.doorWidth;

  // Corridor stations sit against the back wall with an open walking lane.
  // Room-only plans retain their entrance station.
  const r0 = plan.rooms[0];
  const corridorShop = !!plan.corridor;
  const store = corridorShop ? {
    inCorridor: true,
    x: plan.corridor.x0 + 4.5,
    z: plan.corridor.z0 + 2.6,
  } : {
    x: Math.min(r0.x0 + 3.0, (r0.x0 + r0.x1) / 2),
    z: Math.max(r0.z0 + 3.0, Math.min(r0.z1 - 3.0, plan.entry.z)),
  };

  const g = new THREE.Group();
  let stairsSignSprite = null;
  const colliders = [];
  const disposables = [];
  const placed = [];                 // props we are allowed to remove to fix a blocked path
  let group = null;                  // the prop currently being built

  const solid = (x, z, w, d) => {
    const c = { x, z, hw: w/2, hd: d/2 };
    colliders.push(c);
    if (group) group.colliders.push(c);
    return c;
  };
  const add = (geo, material, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    if (group) group.meshes.push(m);
    return m;
  };

  /* Door approaches are protected. Layouts author positions with no idea where
     the doors are, so this is enforced here rather than trusted to each layout. */
  const LANE = DW / 2 + 1.1, DEPTH = 4.4;
  const keepOut = [
    { x0: -hw - T, x1: -hw + DEPTH, z0: plan.entry.z  - LANE, z1: plan.entry.z  + LANE },
    { x0: hw - DEPTH - 1.6, x1: hw + T, z0: plan.stairs.z - LANE, z1: plan.stairs.z + LANE },
  ];
  // every interior doorway gets a clear approach on both sides
  for (const l of plan.links){
    if (l.axis === 'x') keepOut.push({ x0: l.x - DEPTH, x1: l.x + DEPTH, z0: l.z - LANE, z1: l.z + LANE });
    else                keepOut.push({ x0: l.x - LANE,  x1: l.x + LANE,  z0: l.z - DEPTH, z1: l.z + DEPTH });
  }
  if (plan.corridor){
    const c = plan.corridor;
    keepOut.push({ x0: c.x0, x1: c.x1, z0: c.z0 - T, z1: c.z1 + T });
  }
  keepOut.push({ x0: store.x - 3.2, x1: store.x + 3.2, z0: store.z - 3.4, z1: store.z + 2.4 });
  void tower;
  const blocksDoor = (x, z, w, d) => keepOut.some(k =>
    x - w/2 < k.x1 && x + w/2 > k.x0 && z - d/2 < k.z1 && z + d/2 > k.z0);

  const BODY   = mat(PAL.prop, 0.6);
  // lower metalness: at 0.45 the env probe washed every steel prop out to white
  const STEEL  = mat(0x5d707c, 0.42, 0.18);
  const bandM  = mat(accent, 0.45);
  const lidM   = mat(PAL.propDk, 0.6);

  const begin = () => { group = { meshes: [], colliders: [] }; };
  const end   = () => { if (group && group.meshes.length) placed.push(group); group = null; };

  const prop = (pw, ph, pd, x, z, opt = {}) => {
    if (blocksDoor(x, z, pw, pd)) return false;      // silently skipped, never shipped
    const { band = true, steel = false, lid = false } = opt;
    begin();
    add(rbox(pw, ph, pd, 0.09), steel ? STEEL : BODY, x, ph/2, z);
    if (band) add(rbox(pw*1.004, ph*0.15, pd*1.004, 0.03), bandM, x, ph*0.62, z).castShadow = false;
    if (lid)  add(rbox(pw*0.92, 0.12, pd*0.92, 0.04), lidM, x, ph + 0.02, z);
    solid(x, z, pw, pd);
    end();
    return true;
  };
  const tank = (x, z, h = 2.0) => {
    if (blocksDoor(x, z, 1.3, 1.3)) return false;
    begin();
    add(cyl(0.62, 0.62, h), STEEL, x, h/2, z);
    add(cyl(0.64, 0.64, 0.18), bandM, x, h*0.72, z).castShadow = false;
    add(cyl(0.68, 0.68, 0.14), lidM, x, 0.07, z).castShadow = false;
    solid(x, z, 1.3, 1.3);
    end();
    return true;
  };

  /* Floors are laid per room, each on its own slightly different tint. Seeing
     where one room's floor stops is most of what makes a plan read as rooms
     rather than one hall with furniture in it. */
  const tex = sharedFloorTexture();
  const ROOM_SHADE = [0xffffff, 0xcfe2f2, 0xffe9cf, 0xd3f5e2, 0xefdcf7];
  const laySlab = (x0, x1, z0, z1, shade) => {
    const sw = x1 - x0, sd = z1 - z0;
    const m2 = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint).multiply(new THREE.Color(shade)),
      roughness: 0.85, metalness: 0.02, map: tex,
    });
    const gg = new THREE.PlaneGeometry(sw, sd);
    disposables.push(m2, gg);
    const f = new THREE.Mesh(gg, m2);
    f.rotation.x = -Math.PI/2;
    f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    f.receiveShadow = true;
    g.add(f);
  };
  tex.repeat.set(W/12, D/12);
  plan.rooms.forEach((r, i) => laySlab(r.x0 - T, r.x1 + T, r.z0 - T, r.z1 + T, ROOM_SHADE[i % ROOM_SHADE.length]));
  if (plan.corridor){
    const c = plan.corridor;
    laySlab(c.x0 - T, c.x1 + T, c.z0 - T, c.z1 + T, 0xdde8ee);
  }

  /* ---------------------------------------------------------------- walls --
     Perimeter and interior walls are built from one list of runs, so every wall
     — including the ones between rooms — gets the same skirting and cove light.
     That is what makes an interior wall look built rather than dropped in. */
  const wallMat = mat(0xb2c8d1, 0.76);
  const seamMat = mat(0x9db3bb, 0.8);
  const skirtM  = mat(PAL.propDk, 0.82);
  const coveMat = emissive(coveCol, 0.82);
  const frameM  = mat(0xc4d5db, 0.62);
  const runs = [];

  /* Interior walls long enough to bother get a glazed band cut out of them, so
     you can see the next room — and what is waiting in it — before you commit to
     the door. Collision is unchanged; only the geometry opens up. */
  const SILL = 1.15;
  const frameBar = mat(0xc0d2d9, 0.6);

  const wallRun = (x0, x1, z0, z1, h = H, interior = false, forceLow = null) => {
    const w2 = x1 - x0, d2 = z1 - z0;
    if (w2 <= 0.01 || d2 <= 0.01) return;
    const along = w2 > d2 ? 'x' : 'z';
    const span = along === 'x' ? w2 : d2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

    let builtH = h, low = false;
    // Whether a wall is low is decided for the WHOLE partition, not per segment.
    // Deciding per segment leaves one partition 3.2 m at the ends and 1.15 m in
    // the middle, and no doorframe can match both.
    const goLow = forceLow !== null ? forceLow : (interior && span > 5.0);
    if (goLow){
      /* A low wall, and nothing above it. This used to be low wall + glazed band
         + header, which is correct architecture and completely wrong for a
         top-down camera: the header floats free of the wall below it, so every
         interior wall rendered as two disconnected beams with floor between
         them. At this angle a half-height wall already reads as a window — you
         see straight over it into the next room. */
      add(rbox(w2, SILL, d2, 0.06), wallMat, cx, SILL / 2, cz);
      // The cap follows the wall: long dimension along the run, and a hair wider
      // than the wall across it. Swapping these lays the rail ACROSS the wall,
      // which reads as a beam crossing the room at right angles.
      add(rbox(along === 'x' ? w2 : w2 * 1.08, 0.14, along === 'x' ? d2 * 1.08 : d2, 0.04),
          frameBar, cx, SILL + 0.07, cz);
      builtH = SILL + 0.14; low = true;
    } else {
      add(rbox(w2, h, d2, 0.08), wallMat, cx, h / 2, cz);
    }
    solid(cx, cz, w2, d2);
    // record the height actually built, not the height requested: the skirting
    // and cove hang off this, and a low wall that reports 3.2 m leaves its light
    // strip floating in mid-air where the full-height wall used to be
    runs.push({ x0, x1, z0, z1, h: builtH, interior, along, low });
  };

  /** a wall with a gap in it, so doorways are holes rather than decals */
  const wallWithGaps = (axis, at, from, to, gaps, h = H, interior = false) => {
    /* Interior walls are full height, like the perimeter. Half-height walls were
       an attempt to keep the "see into the next room" idea after the glazed
       version rendered as floating beams — but a stunted wall next to a
       full-height perimeter just looks wrong, and rooms stop feeling like rooms.
       The minimap carries that information instead. Flip this to re-enable. */
    const LOW_INTERIOR_WALLS = false;
    const low = LOW_INTERIOR_WALLS && interior && (to - from) > 5.0;
    const cuts = gaps.map(c => [c - DW / 2, c + DW / 2]).sort((a, b) => a[0] - b[0]);
    let cur = from;
    for (const [g0, g1] of cuts){
      if (g0 > cur) axis === 'x' ? wallRun(at - T/2, at + T/2, cur, g0, h, interior, low)
                                 : wallRun(cur, g0, at - T/2, at + T/2, h, interior, low);
      cur = Math.max(cur, g1);
    }
    if (cur < to) axis === 'x' ? wallRun(at - T/2, at + T/2, cur, to, h, interior, low)
                               : wallRun(cur, to, at - T/2, at + T/2, h, interior, low);
  };

  // perimeter — the west opening is where you arrive, the east one is the stairwell
  wallRun(-hw - T, hw + T, -hd - T, -hd, H);            // far wall
  wallRun(-hw - T, hw + T,  hd,  hd + T, 1.1);          // near parapet, kept low
  wallWithGaps('x', -hw - T/2, -hd, hd, [plan.entry.z]);
  wallWithGaps('x',  hw + T/2, -hd, hd, [plan.stairs.z]);

  // interior partitions
  for (const part of plan.partitions)
    wallWithGaps(part.axis, part.at, part.from, part.to, part.doors || [], H, true);

  // skirting + cove light along every run
  for (const r of runs){
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const w2 = r.x1 - r.x0, d2 = r.z1 - r.z0;
    if (r.along === 'x'){
      for (const sz of (r.interior ? [-1, 1] : [1])){
        add(rbox(w2 - 0.2, 0.3, 0.12, 0.03), skirtM, cx, 0.15, cz + sz * (d2/2 + 0.06)).castShadow = false;
        if (!r.low)
          add(rbox(w2 - 0.5, 0.1, 0.12, 0.04), coveMat, cx, r.h - 0.26, cz + sz * (d2/2 - 0.02)).castShadow = false;
      }
    } else {
      for (const sx of (r.interior ? [-1, 1] : [-1])){
        add(rbox(0.12, 0.3, d2 - 0.2, 0.03), skirtM, cx + sx * (w2/2 + 0.06), 0.15, cz).castShadow = false;
        if (!r.low)
          add(rbox(0.12, 0.1, d2 - 0.5, 0.04), coveMat, cx + sx * (w2/2 - 0.02), r.h - 0.26, cz).castShadow = false;
      }
    }
  }

  // vertical seams on the far wall so it isn't a blank slab
  for (let x = -hw + 2.4; x < hw; x += 2.9)
    add(rbox(0.1, H - 0.9, 0.08, 0.02), seamMat, x, (H - 0.9)/2 + 0.2, -hd + 0.03).castShadow = false;

  /* ---- doorways: a lintel, jambs and a light strip. A hole in a wall reads as
     a mistake; a framed hole reads as a door. ---- */
  const doorLight = emissive(accent, 0.55);
  const signs = [];
  const makeSign = (text, x, y, z) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const cx2 = c.getContext('2d');
    cx2.fillStyle = '#0d1b22'; cx2.fillRect(0, 0, 512, 96);
    cx2.fillStyle = '#1d3944'; cx2.fillRect(0, 82, 512, 14);
    cx2.textAlign = 'center'; cx2.fillStyle = '#bdf3ff';
    cx2.font = 'bold 46px system-ui, sans-serif';
    cx2.fillText(text.toUpperCase(), 256, 58);
    const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace;
    const m2 = new THREE.SpriteMaterial({ map: t2, depthTest: true });
    const sp = new THREE.Sprite(m2);
    sp.position.set(x, y, z); sp.scale.set(3.0, 0.56, 1);
    g.add(sp); disposables.push(t2, m2); signs.push(sp);
  };

  /* A doorframe has to match the wall it is cut into. These were hard-coded to
     full wall height; once long interior walls became low walls, every doorway
     grew two tall posts and a beam floating 1.8 m above a 1.15 m wall. */
  const runForLink = (l) => {
    const wantAlong = l.axis === 'x' ? 'z' : 'x';
    return runs.find(r => r.along === wantAlong && (l.axis === 'x'
      ? Math.abs((r.x0 + r.x1) / 2 - l.x) < 0.6
      : Math.abs((r.z0 + r.z1) / 2 - l.z) < 0.6));
  };

  for (const l of plan.links){
    const vertical = l.axis === 'x';
    const fw = vertical ? T + 0.16 : DW + 0.5;
    const fd = vertical ? DW + 0.5 : T + 0.16;
    const wr = runForLink(l);
    const wallH = wr ? wr.h : H;
    const lowWall = wr ? !!wr.low : false;

    // jambs stop at the wall's own height
    const jambH = Math.max(0.5, wallH - 0.14);
    for (const s2 of [-1, 1]){
      const jx = vertical ? l.x : l.x + s2 * (DW / 2 + 0.12);
      const jz = vertical ? l.z + s2 * (DW / 2 + 0.12) : l.z;
      add(rbox(vertical ? T + 0.2 : 0.3, jambH, vertical ? 0.3 : T + 0.2, 0.05), frameM, jx, jambH / 2, jz);
    }
    // a low wall gets its capping rail carried across the opening; only a
    // full-height wall gets a lintel, because only there is there a wall above
    if (lowWall) add(rbox(fw, 0.14, fd, 0.04), frameBar, l.x, wallH - 0.07, l.z);
    else         add(rbox(fw, 0.22, fd, 0.05), frameM, l.x, wallH - 0.11, l.z);
    // threshold glow on the floor
    add(rbox(vertical ? T + 0.5 : DW - 0.5, 0.04, vertical ? DW - 0.5 : T + 0.5, 0.015),
        doorLight, l.x, 0.022, l.z).castShadow = false;
    // a short dashed run either side, pointing through the opening
    for (const s2 of [-1, 1])
      for (let k = 0; k < 3; k++){
        const off = 1.1 + k * 0.62;
        add(rbox(vertical ? 0.34 : 0.9, 0.03, vertical ? 0.9 : 0.34, 0.01),
            mat(0x9fc4cf, 0.75),
            l.x + (vertical ? s2 * off : 0), 0.02, l.z + (vertical ? 0 : s2 * off)).castShadow = false;
      }
    // the room this door leads into, named above the opening
    const target = plan.rooms[l.b >= 0 ? l.b : l.a];
    if (target){
      const tcx = (target.x0 + target.x1) / 2, tcz = (target.z0 + target.z1) / 2;
      const ox = vertical ? Math.sign(tcx - l.x) * (T / 2 + 0.5) : 0;
      const oz = vertical ? 0 : Math.sign(tcz - l.z) * (T / 2 + 0.5);
      makeSign(target.name, l.x + ox, H + 0.18, l.z + oz);
    }
  }

  /* ---- entry (west): starts open, grows shut behind you ---- */
  const vineMat = emissive(PAL.green, 0.85).clone();
  disposables.push(vineMat);
  const entryVines = [];
  for (let i = 0; i < 6; i++){
    const h = 2.4 + R() * 0.6;
    const m = add(rbox(0.3, h, 0.3, 0.14), vineMat, -hw - T/2, h/2, plan.entry.z - DW/2 + 0.3 + i * (DW - 0.6)/5);
    m.rotation.z = (R() - 0.5) * 0.3;
    m.rotation.x = (R() - 0.5) * 0.2;
    m.userData.h = h;
    m.scale.set(1, 0.001, 1);
    m.position.y = 0.001;
    m.userData.noMerge = true;
    entryVines.push(m);
  }
  const entryCollider = solid(-hw - T/2, plan.entry.z, T, DW);

  /* ---- exit (east): gold and locked until the room is clear ---- */
  const goldMat = emissive(PAL.gold, 1.15).clone();
  const inlayMat = emissive(PAL.gold, 0.32).clone();
  disposables.push(goldMat, inlayMat);
  const exitPanel = add(rbox(0.3, H - 0.5, DW - 0.3, 0.1), goldMat, hw + T/2, (H - 0.5)/2, plan.stairs.z);
  exitPanel.castShadow = false;
  exitPanel.userData.noMerge = true;
  add(rbox(0.5, 0.24, DW + 0.5, 0.08), mat(0xd2e0e4, 0.7), hw + T/2, H - 0.1, plan.stairs.z);
  for (let i = 0; i < 4; i++)
    add(rbox(0.75, 0.03, 0.14, 0.01), inlayMat, hw - 1.6 - i * 1.15, 0.016, plan.stairs.z).castShadow = false;
  const exitCollider = solid(hw + T/2, plan.stairs.z, T, DW);

  /* --------------------------------------------------------- machinery --
     One recognisable machine per room, themed to the floor, so you can tell
     where you are from the silhouette alone rather than the floor tint. */
  const MACH = {
    cryopods(x, z, sx){
      for (let i = -1; i <= 1; i++){
        add(rbox(1.0, 2.5, 0.9, 0.16), mat(0xc9dbe2, 0.5), x + i * 1.25, 1.25, z);
        add(rbox(0.62, 1.5, 0.2, 0.06), emissive(0x7fe6ff, 0.7), x + i * 1.25, 1.4, z + sx * 0.48).castShadow = false;
        solid(x + i * 1.25, z, 1.0, 0.9);
      }
      add(rbox(4.2, 0.3, 1.2, 0.05), mat(PAL.propDk, 0.6), x, 0.15, z);
    },
    turbine(x, z){
      add(cyl(1.15, 1.15, 3.4, 12), mat(0x8fa4ad, 0.42, 0.2), x, 1.2, z).rotation.z = Math.PI / 2;
      for (const o of [-1.1, 0, 1.1])
        add(cyl(1.25, 1.25, 0.22, 10), mat(accent, 0.4), x + o, 1.2, z).rotation.z = Math.PI / 2;
      add(rbox(4.0, 0.7, 1.6, 0.08), mat(PAL.propDk, 0.6), x, 0.35, z);
      solid(x, z, 4.0, 1.7);
    },
    reactor(x, z){
      add(cyl(0.9, 1.1, 2.9, 12), mat(0x7d8f99, 0.42, 0.2), x, 1.45, z);
      add(cyl(0.55, 0.55, 3.1, 10), emissive(accent, 1.1), x, 1.5, z).castShadow = false;
      for (const yy of [0.7, 1.5, 2.3])
        add(cyl(1.22, 1.22, 0.16, 10), mat(PAL.propDk, 0.55), x, yy, z);
      solid(x, z, 2.3, 2.3);
    },
    servers(x, z, sx){
      for (let i = -1; i <= 1; i++){
        add(rbox(1.1, 2.3, 1.0, 0.07), mat(0x3f4d57, 0.5, 0.15), x + i * 1.3, 1.15, z);
        for (let k = 0; k < 4; k++)
          add(rbox(0.8, 0.06, 0.1, 0.02), emissive(0x86efac, 0.8), x + i * 1.3, 0.5 + k * 0.5, z + sx * 0.52).castShadow = false;
        solid(x + i * 1.3, z, 1.1, 1.0);
      }
    },
    planters(x, z){
      for (let i = -1; i <= 1; i++){
        add(rbox(1.5, 0.75, 2.4, 0.08), mat(0xd8e6dc, 0.6), x + i * 1.75, 0.38, z);
        add(rbox(1.25, 0.1, 2.1, 0.03), emissive(0x86efac, 0.5), x + i * 1.75, 0.79, z).castShadow = false;
        add(rbox(1.4, 0.09, 0.12, 0.03), emissive(0xfff3b0, 0.9), x + i * 1.75, 2.25, z).castShadow = false;
        for (const sz2 of [-1, 1])
          add(rbox(0.1, 1.5, 0.1, 0.02), mat(PAL.propDk, 0.6), x + i * 1.75, 1.5, z + sz2 * 1.0);
        solid(x + i * 1.75, z, 1.5, 2.4);
      }
    },
    cargo(x, z){
      const cols = [0xb0563a, 0x3f6f8f, 0xb08a3a];
      for (let i = 0; i < 3; i++){
        const h2 = i === 1 ? 2.4 : 1.4;
        add(rbox(2.0, h2, 1.9, 0.06), mat(cols[i], 0.62), x + (i - 1) * 2.2, h2 / 2, z);
        add(rbox(2.05, 0.14, 1.95, 0.03), mat(PAL.propDk, 0.6), x + (i - 1) * 2.2, h2 - 0.2, z);
        solid(x + (i - 1) * 2.2, z, 2.0, 1.9);
      }
    },
  };
  const machineKind = cfg.machine;
  if (MACH[machineKind]){
    // two per floor is enough to make it recognisable; four is just triangles
    let placedMachines = 0;
    for (const rm of plan.rooms){
      if (placedMachines >= 2) break;
      const mx = (rm.x0 + rm.x1) / 2;
      const mz = rm.z0 + 2.3;
      if (blocksDoor(mx, mz, 4.6, 2.6)) continue;
      if (Math.hypot(mx - store.x, mz - store.z) < 6) continue;
      if (rm.z1 - rm.z0 < 7) continue;
      MACH[machineKind](mx, mz, 1);
      placedMachines++;
    }
  }

  /* ---- props ---- */
  /* Each room furnishes itself. A layout is written against a room-sized rect
     centred on the origin, so it is translated into place and anything that
     would spill past the room's own walls is dropped. */
  plan.rooms.forEach((r, i) => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const rw = r.x1 - r.x0, rd = r.z1 - r.z0;
    const fits = (x, z, w2, d2) =>
      x - w2/2 > r.x0 + 0.5 && x + w2/2 < r.x1 - 0.5 &&
      z - d2/2 > r.z0 + 0.5 && z + d2/2 < r.z1 - 0.5;
    const lprop = (pw, ph, pd, x, z, opt) =>
      fits(cx + x, cz + z, pw, pd) && prop(pw, ph, pd, cx + x, cz + z, opt);
    const ltank = (x, z, h2) =>
      fits(cx + x, cz + z, 1.3, 1.3) && tank(cx + x, cz + z, h2);
    const fn = LAYOUTS[r.layout] || LAYOUTS[layout] || LAYOUTS.cryo;
    fn({ prop: lprop, tank: ltank, hw: rw / 2, hd: rd / 2, R });
    void i;
  });

  /* ---- outside ---- */
  const outMat = mat(0x111823, 0.95);
  const outGeo = new THREE.PlaneGeometry(220, 220);
  disposables.push(outGeo);
  const outside = new THREE.Mesh(outGeo, outMat);
  outside.rotation.x = -Math.PI/2; outside.position.y = -0.06;
  outside.receiveShadow = true;
  g.add(outside);

  const dk = mat(0x161d27, 0.9);
  const chunk = (cw, ch, cd, x, z) => add(rbox(cw, ch, cd, 0.1), dk, x, ch/2 - 0.05, z).castShadow = false;
  chunk(15, 2.4, 7, -hw - 4, hd + 8); chunk(10, 2.0, 6, 3, hd + 10); chunk(13, 2.6, 8, hw + 7, hd + 7);
  chunk(8, 2.2, 11, -hw - 10, -3); chunk(8, 2.2, 11, hw + 10, 3); chunk(20, 2.4, 6, 0, -hd - 9);

  const hazard = emissive(PAL.red, 0.3);
  for (const [x, z, hwd] of [[-hw - 4, hd + 6, 9], [hw - 2, hd + 7, 11]])
    add(rbox(hwd, 0.06, 0.3, 0.02), hazard, x, 0.02, z).castShadow = false;

  // A protected service bay off the west entrance, with an unmistakable cyan pad.

  const shopSteel = mat(0x23485f,.4,.4), shopEdge=mat(0xaac7cf,.42,.3);
  const benchRed=mat(0xc6492d,.45,.2);
  /* A recessed bay so the workshop reads as a built-in place rather than
     furniture dropped on the floor: three low stubs, a darker deck, and its own
     ceiling strip. The front stays open so it can never trap anyone. */
  if (!corridorShop){
    const bayW = 6.0, bayD = 4.2, bz = store.z - 1.9;
    const deck = mat(0x25333d, 0.72);
    add(rbox(bayW, 0.05, bayD, 0.02), deck, store.x, 0.012, bz).castShadow = false;
    add(rbox(bayW, 0.16, 0.12, 0.03), emissive(0x5ef2e0, 0.5), store.x, 0.06, bz + bayD/2).castShadow = false;
    const stub = mat(0xa8bcc5, 0.72);
    add(rbox(bayW, 1.5, 0.35, 0.06), stub, store.x, 0.75, bz - bayD/2);
    solid(store.x, bz - bayD/2, bayW, 0.35);
    for (const sx of [-1, 1]){
      add(rbox(0.35, 1.5, bayD * 0.55, 0.06), stub, store.x + sx * bayW/2, 0.75, bz - bayD*0.16);
      solid(store.x + sx * bayW/2, bz - bayD*0.16, 0.35, bayD * 0.55);
    }
    add(rbox(bayW - 0.6, 0.1, 0.14, 0.03), emissive(0x8eefff, 0.9), store.x, 2.55, bz - bayD/2 + 0.3).castShadow = false;
  }

  // White corner brackets mark the exact waiting area.
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    add(rbox(.5,.025,.065,.01),emissive(0xc8ffef,.5),store.x+sx*1.05,.035,store.z+sz*1.05).castShadow=false;
    add(rbox(.065,.025,.5,.01),emissive(0xc8ffef,.5),store.x+sx*1.25,.035,store.z+sz*.85).castShadow=false;
  }
  // Workbench, legs, tool case, drawers and flanking equipment racks.
  add(rbox(2.5,.18,.8,.06),benchRed,store.x,1.05,store.z-1.7);
  for(const sx of [-1,1])add(rbox(.17,1,.6,.025),shopSteel,store.x+sx*1.05,.5,store.z-1.7);
  add(rbox(.7,.36,.42,.045),shopSteel,store.x-.6,1.31,store.z-1.7);
  add(rbox(.5,.05,.32,.015),shopEdge,store.x+.5,1.17,store.z-1.7);
  solid(store.x,store.z-1.7,2.5,.8);
  for(const sx of (corridorShop ? [] : [-1,1])){
    const x=store.x+sx*1.8;
    add(rbox(.48,2.5,1.6,.06),shopSteel,x,1.25,store.z-1.8);
    // NB: the rack body spans y 0..2.5. A shelf at 2.45 is 0.1 tall, so its top face
    // lands exactly on the rack's top face — coplanar surfaces z-fight and jitter.
    for(const y of [.2,1,1.8,2.32]) add(rbox(.64,.1,1.5,.02),shopEdge,x,y,store.z-1.8);
    add(rbox(.66,.15,1.6,.03),benchRed,x,.12,store.z-1.8);
    solid(x,store.z-1.8,.64,1.6);
  }
  add(rbox(2.8,.08,.12,.02),emissive(0x8eefff,1.6),store.x,2.9,store.z-2.4).castShadow=false;
  const labelCanvas = document.createElement('canvas'); labelCanvas.width=512; labelCanvas.height=128;
  const labelCtx=labelCanvas.getContext('2d');
  labelCtx.fillStyle='#071b28';labelCtx.fillRect(0,0,512,128);
  labelCtx.textAlign='center';labelCtx.fillStyle='#8df9ed';labelCtx.font='bold 48px sans-serif';labelCtx.fillText('ARMORY',256,59);
  labelCtx.fillStyle='#d4ecee';labelCtx.font='22px sans-serif';labelCtx.fillText('STAND ON PAD · 2 SECONDS',256,99);
  const labelTex=new THREE.CanvasTexture(labelCanvas);labelTex.colorSpace=THREE.SRGBColorSpace;
  const labelMat=new THREE.SpriteMaterial({map:labelTex,depthTest:true});
  const label=new THREE.Sprite(labelMat);label.position.set(store.x,2.1,store.z-1.9);label.scale.set(3.2,.8,1);g.add(label);store.label=label;
  disposables.push(labelTex,labelMat);

  /* ------------------------------------------------------------ stairwell --
     The way up. Built as geometry with no collision, so the player can walk
     onto it — climbing is a transition, not a physics problem. */
  const stairs = new THREE.Vector3(plan.stairs.x, 0, plan.stairs.z);
  {
    const stepM = mat(0x9db4bd, 0.64), railM = mat(0x6f838f, 0.34, 0.45);
    const STEPS = 7, RISE = 0.13, RUN = 0.4, WIDE = DW - 0.6;

    // a recessed landing pad so the foot of the stairs reads from a distance
    add(rbox(WIDE + 1.4, 0.035, WIDE + 1.0, 0.02), mat(0x8fb3bd, 0.7),
        stairs.x - 1.5, 0.022, stairs.z).castShadow = false;

    for (let i = 0; i < STEPS; i++){
      const h2 = RISE * (i + 1);
      add(rbox(RUN, h2, WIDE, 0.02), stepM, stairs.x + i * RUN, h2 / 2, stairs.z).castShadow = false;
    }
    const topY = RISE * STEPS;
    add(rbox(1.5, topY, WIDE, 0.03), stepM, stairs.x + STEPS * RUN + 0.75, topY / 2, stairs.z).castShadow = false;

    // railings and an up-light, so the eye is pulled to the exit
    for (const sz of [-1, 1]){
      add(rbox(STEPS * RUN + 2.0, 0.1, 0.12, 0.03), railM,
          stairs.x + STEPS * RUN / 2, 1.15, stairs.z + sz * (WIDE / 2 + 0.1)).castShadow = false;
      for (let i = 0; i <= 3; i++)
        add(rbox(0.12, 1.1, 0.12, 0.03), railM,
            stairs.x - 0.3 + i * (STEPS * RUN + 1.6) / 3, 0.55, stairs.z + sz * (WIDE / 2 + 0.1)).castShadow = false;
    }
    add(rbox(0.2, 0.06, WIDE, 0.02), emissive(0x63e6e2, 1.4), stairs.x - 1.0, 0.03, stairs.z).castShadow = false;
    stairsSign(stairs, WIDE);
  }

  function stairsSign(pos, wide){
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const cx2 = c.getContext('2d');
    cx2.fillStyle = '#0e2530'; cx2.fillRect(0, 0, 512, 128);
    cx2.fillStyle = '#63e6e2'; cx2.fillRect(0, 112, 512, 16);
    cx2.textAlign = 'center'; cx2.fillStyle = '#caffef';
    cx2.font = 'bold 44px system-ui, sans-serif'; cx2.fillText('STAIRS \u2191', 256, 58);
    cx2.fillStyle = '#8fc9cf'; cx2.font = '22px system-ui, sans-serif';
    cx2.fillText('CLEAR THE FLOOR TO ASCEND', 256, 96);
    const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace;
    const m2 = new THREE.SpriteMaterial({ map: t2, depthTest: true });
    const sp = new THREE.Sprite(m2);
    sp.position.set(pos.x + 0.8, 3.05, pos.z); sp.scale.set(Math.max(3.4, wide), 0.85, 1);
    g.add(sp); disposables.push(t2, m2);
    stairsSignSprite = sp;
  }

  scene.add(g);

  /* Close slivers between a wall-flush prop and the play boundary — too narrow
     to walk down, wide enough to get shoved into and wedged forever. */
  const bx = hw - 0.5, bz = hd - 0.5, MIN_GAP = 1.0;
  for (const c of colliders){
    if (c === entryCollider || c === exitCollider) continue;
    let x0 = c.x - c.hw, x1 = c.x + c.hw, z0 = c.z - c.hd, z1 = c.z + c.hd;
    if (x0 > -bx && x0 + bx < MIN_GAP) x0 = -bx - 1;
    if (x1 <  bx && bx - x1 < MIN_GAP) x1 =  bx + 1;
    if (z0 > -bz && z0 + bz < MIN_GAP) z0 = -bz - 1;
    if (z1 <  bz && bz - z1 < MIN_GAP) z1 =  bz + 1;
    c.x = (x0 + x1) / 2; c.hw = (x1 - x0) / 2;
    c.z = (z0 + z1) / 2; c.hd = (z1 - z0) / 2;
  }

  const entryPos = new THREE.Vector3(-bx + 0.6, 0, plan.entry.z);

  /* ---------------------------------------------------------- traversal --
     A room the player cannot walk out of is unshippable, so it is verified on
     every build rather than trusted to the layout author. Flood-fill at the
     player's radius from the entry; if the exit is unreachable, pull props off
     the direct line until it is. */
  const CELL = 0.4, PR = 0.42;
  const nx = Math.max(2, Math.ceil((bx * 2) / CELL));
  const nz = Math.max(2, Math.ceil((bz * 2) / CELL));
  const cellX = i => -bx + (i + 0.5) * (bx * 2) / nx;
  const cellZ = j => -bz + (j + 0.5) * (bz * 2) / nz;

  function blockedAt(x, z, ignore){
    for (const c of colliders){
      if (c === entryCollider || c === exitCollider || (ignore && ignore.has(c))) continue;
      if (Math.abs(x - c.x) < c.hw + PR && Math.abs(z - c.z) < c.hd + PR) return true;
    }
    return false;
  }

  /* Flood-fill from the entry once, then ask which places we got to. A floor is
     only shippable if the player can reach the stairwell AND every room they
     are required to clear — an unreachable room is an unfinishable floor. */
  function flood(ignore){
    const seen = new Uint8Array(nx * nz);
    const si = Math.max(0, Math.min(nx - 1, Math.round((entryPos.x + bx) / (bx * 2) * nx - 0.5)));
    const sj = Math.max(0, Math.min(nz - 1, Math.round((entryPos.z + bz) / (bz * 2) * nz - 0.5)));
    if (blockedAt(cellX(si), cellZ(sj), ignore)) return seen;
    const q = [si + sj * nx];
    seen[q[0]] = 1;
    let head = 0;
    while (head < q.length){
      const cur = q[head++], i = cur % nx, j = (cur / nx) | 0;
      for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const k = ni + nj * nx;
        if (seen[k]) continue;
        seen[k] = 1;
        if (!blockedAt(cellX(ni), cellZ(nj), ignore)) q.push(k); else seen[k] = 2;
      }
    }
    return seen;
  }

  const gotTo = (seen, tx, tz, tol = 1.7) => {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++){
      if (seen[i + j * nx] !== 1) continue;
      if (Math.hypot(cellX(i) - tx, cellZ(j) - tz) < tol) return true;
    }
    return false;
  };

  function reachable(ignore){
    const seen = flood(ignore);
    if (!gotTo(seen, stairs.x, stairs.z)) return false;
    for (const r of plan.rooms){
      const cx2 = (r.x0 + r.x1) / 2, cz2 = (r.z0 + r.z1) / 2;
      if (!gotTo(seen, cx2, cz2, Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2)) return false;
    }
    return true;
  }

  const removed = [];
  if (!reachable(null)){
    // clear the straightest obstruction first, then re-test
    const order = placed.slice().sort((a, b) => {
      const da = Math.min(...a.colliders.map(c => Math.abs(c.z)));
      const db = Math.min(...b.colliders.map(c => Math.abs(c.z)));
      return da - db;
    });
    const ignore = new Set();
    for (const p of order){
      for (const c of p.colliders) ignore.add(c);
      removed.push(p);
      if (reachable(ignore)) break;
    }
    for (const p of removed){
      for (const m of p.meshes) g.remove(m);
      for (const c of p.colliders){
        const i = colliders.indexOf(c);
        if (i >= 0) colliders.splice(i, 1);
      }
    }
    console.warn(`[verdant] "${layout}" blocked the exit — removed ${removed.length} prop(s) to restore a path`);
  }

  /* ------------------------------------------------------------- batching --
     A floor is ~150 separate static meshes, and the shadow pass draws them all
     again — 260 draw calls before a single enemy exists. Nothing here moves, so
     everything static is welded into one mesh per material. Draw-call overhead
     is what actually hurts low-end phones, and this buys the headroom to add
     windows and machinery without charging the player's GPU for it. */
  // captured before batching, so a stray piece of geometry can still be traced
  // back to a size and a position instead of guessed at from a screenshot
  const auditGeometry = [];
  function mergeStatic(){
    const buckets = new Map();
    const originals = [];
    {
      const bb = new THREE.Box3(), sz = new THREE.Vector3(), ctr = new THREE.Vector3();
      for (const o of g.children){
        if (!o.isMesh) continue;
        bb.setFromObject(o); bb.getSize(sz); bb.getCenter(ctr);
        const L = Math.max(sz.x, sz.z), S = Math.min(sz.x, sz.z);
        // long, thin, and floating clear of the floor
        if (L > 3 && S < 1.6 && L / S > 3 && bb.min.y > 0.45)
          auditGeometry.push({
            size: [+sz.x.toFixed(2), +sz.y.toFixed(2), +sz.z.toFixed(2)],
            at: [+ctr.x.toFixed(1), +ctr.y.toFixed(2), +ctr.z.toFixed(1)],
            baseY: +bb.min.y.toFixed(2),
            colour: '#' + (o.material.color ? o.material.color.getHexString() : '?'),
          });
      }
    }
    for (const o of g.children){
      if (!o.isMesh || o.userData.noMerge) continue;
      originals.push(o);
      // bucket by room as well as material: one mesh per floor can never be
      // frustum-culled, so the GPU would draw every room you aren't looking at
      const region = plan.roomAt(o.position.x, o.position.z);
      const key = `${region}|${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
      if (!buckets.has(key))
        buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
      o.updateMatrix();
      // geometry is shared out of the cache, so clone before baking a transform in
      let geo = o.geometry.clone().applyMatrix4(o.matrix);
      if (geo.index) geo = geo.toNonIndexed();
      buckets.get(key).geos.push(geo);
    }
    for (const o of originals) g.remove(o);
    for (const b of buckets.values()){
      const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      if (!merged) continue;
      for (const geo of b.geos) if (geo !== merged) geo.dispose();
      const m = new THREE.Mesh(merged, b.mat);
      m.castShadow = b.cast; m.receiveShadow = b.recv;
      g.add(m);
      disposables.push(merged);
    }
    return buckets.size;
  }
  const mergedInto = mergeStatic();

  const zones = plan.rooms.map((r, i) => ({
    name: r.name, index: i,
    x0: r.x0 + 0.9, x1: r.x1 - 0.9, z0: r.z0 + 0.9, z1: r.z1 - 0.9,
    started: false, budget: 0,
  }));

  return {
    group: g,
    store, stairs, plan, zones,
    stairsSign: stairsSignSprite,
    roomAt: (x, z) => plan.roomAt(x, z),
    routeDoor: (from, to) => plan.routeDoor(from, to),
    bounds: { x: bx, z: bz },
    colliders,
    entryPos,
    exitPos: new THREE.Vector3(hw + T/2, 1.2, 0),
    exitCollider, entryCollider, entryVines,
    exit: { panel: exitPanel, material: goldMat, inlay: inlayMat },
    debug: { layout, removed: removed.length, props: placed.length, mergedInto,
      runs: runs.map(r => ({ h: +r.h.toFixed(2), low: !!r.low, interior: !!r.interior, along: r.along })),
      floating: auditGeometry },

    /** exposed so the whole set of modules can be verified in one pass */
    isTraversable: () => reachable(null),

    /** 0 → 1 grows the vine curtain across the door you came through */
    seal(t){
      const e = 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 2.6);
      for (let i = 0; i < entryVines.length; i++){
        const m = entryVines[i];
        const k = Math.min(Math.max((e - i * 0.06) / 0.7, 0.001), 1);
        m.scale.set(1, k, 1);
        m.position.y = (m.userData.h * k) / 2;
      }
    },

    unlockExit(){
      goldMat.color.set(0x4ade80);
      goldMat.emissive.set(0x4ade80);
      goldMat.emissiveIntensity = 2.2;
      inlayMat.color.set(0x4ade80);
      inlayMat.emissive.set(0x4ade80);
      const i = colliders.indexOf(exitCollider);
      if (i >= 0) colliders.splice(i, 1);
    },

    dispose(){
      scene.remove(g);
      g.traverse(o => { if (o.isMesh) o.geometry = null; });
      for (const d of disposables) d.dispose();
      g.clear();
    },
  };
}
