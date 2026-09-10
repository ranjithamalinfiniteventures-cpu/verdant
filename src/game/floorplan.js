/* Floor plans — pure geometry, no Three.js.

   A floor is not one hall with an invisible line down it. It is a set of real
   rooms separated by real walls, joined by doorways, arranged so the player
   walks a route: arrive by stairs, clear each room, leave by the stairwell up.

   Every plan returns rooms as INNER playable rects (walls sit outside them),
   the partitions to build, and the links (doorways) that connect them. */

export const WALL_T = 0.7;
const DOORW = 4.2;

/* Each plan: ({ hw, hd, names }) => { rooms, partitions, links, entry, stairs } */
export const PLANS = {
  arena({ hw, hd, names }){
    return {
      rooms:[{ name:names[0] || 'HEARTROOT ARENA', x0:-hw, x1:hw, z0:-hd, z1:hd, layout:'arena' }],
      partitions:[], links:[],
      entry:{ x:-hw + 1.8, z:0 }, stairs:{ x:hw - 2.6, z:0 }
    };
  },

  /* Two rooms side by side, one shared wall. The simplest floor that still
     reads as architecture rather than an arena. */
  split({ hw, hd, names }){
    const h = WALL_T / 2;
    return {
      rooms: [
        { name: names[0] || 'WEST WING', x0: -hw, x1: -h, z0: -hd, z1: hd, layout: 'cryo' },
        { name: names[1] || 'EAST WING', x0:  h,  x1:  hw, z0: -hd, z1: hd, layout: 'island' },
      ],
      // two doors, not one: there is always a second way round
      partitions: [{ axis: 'x', at: 0, from: -hd, to: hd, doors: [-hd * 0.48, hd * 0.48] }],
      links: [
        { a: 0, b: 1, x: 0, z: -hd * 0.48, axis: 'x' },
        { a: 0, b: 1, x: 0, z:  hd * 0.48, axis: 'x' },
      ],
      entry:  { x: -hw + 1.8, z: 0 },
      stairs: { x:  hw - 2.6, z: 0 },
    };
  },

  /* Three rooms in a row with staggered doors, so crossing the floor is a
     zig-zag instead of a straight sprint. */
  triptych({ hw, hd, names }){
    const h = WALL_T / 2, a = -hw / 3, b = hw / 3;
    const dz = Math.min(hd - DOORW / 2 - 1.2, hd * 0.45);
    return {
      rooms: [
        { name: names[0] || 'WEST LAB',  x0: -hw,  x1: a - h, z0: -hd, z1: hd, layout: 'cryo'    },
        { name: names[1] || 'ATRIUM',    x0: a + h, x1: b - h, z0: -hd, z1: hd, layout: 'island'  },
        { name: names[2] || 'EAST LAB',  x0: b + h, x1: hw,   z0: -hd, z1: hd, layout: 'scatter' },
      ],
      partitions: [
        { axis: 'x', at: a, from: -hd, to: hd, doors: [ dz] },
        { axis: 'x', at: b, from: -hd, to: hd, doors: [-dz] },
      ],
      links: [
        { a: 0, b: 1, x: a, z:  dz, axis: 'x' },
        { a: 1, b: 2, x: b, z: -dz, axis: 'x' },
      ],
      entry:  { x: -hw + 1.8, z: 0 },
      stairs: { x:  hw - 2.6, z: 0 },
    };
  },

  /* A service corridor along the back wall with three rooms opening off it.
     The rooms do not connect to each other — you go out and back in, which is
     what makes a building feel like a building. */
  corridor({ hw, hd, names }){
    const h = WALL_T / 2;
    const CW = Math.max(4.6, Math.min(6.2, hd * 0.42));   // corridor depth
    const cz = -hd + CW;                                   // corridor / rooms divider
    const a = -hw / 3, b = hw / 3;
    const dx = [(-hw + a) / 2, 0, (b + hw) / 2];           // one door per room
    return {
      corridor: { x0: -hw, x1: hw, z0: -hd, z1: cz - h },
      rooms: [
        { name: names[0] || 'WARD A', x0: -hw,   x1: a - h, z0: cz + h, z1: hd, layout: 'cryo'   },
        { name: names[1] || 'WARD B', x0: a + h, x1: b - h, z0: cz + h, z1: hd, layout: 'hydro'  },
        { name: names[2] || 'WARD C', x0: b + h, x1: hw,   z0: cz + h, z1: hd, layout: 'lanes'  },
      ],
      partitions: [
        { axis: 'z', at: cz, from: -hw, to: hw, doors: dx },
        { axis: 'x', at: a,  from: cz,  to: hd, doors: [] },
        { axis: 'x', at: b,  from: cz,  to: hd, doors: [] },
      ],
      links: [
        { a: -1, b: 0, x: dx[0], z: cz, axis: 'z' },
        { a: -1, b: 1, x: dx[1], z: cz, axis: 'z' },
        { a: -1, b: 2, x: dx[2], z: cz, axis: 'z' },
      ],
      entry:  { x: -hw + 1.8, z: -hd + CW / 2 },
      stairs: { x:  hw - 2.6, z: -hd + CW / 2 },
    };
  },

  /* One long hall, then the far half divided into two. The route doubles back,
     so the stairwell is never in sight from the entrance. */
  suite({ hw, hd, names }){
    const h = WALL_T / 2;
    const dz = hd * 0.55, dx = hw * 0.6;
    return {
      rooms: [
        { name: names[0] || 'MAIN HALL', x0: -hw,   x1: -h, z0: -hd,  z1: hd, layout: 'spine'  },
        { name: names[2] || 'ANNEX',     x0:  h,    x1: hw, z0:  h,   z1: hd, layout: 'hydro'  },
        { name: names[1] || 'UPPER BAY', x0:  h,    x1: hw, z0: -hd,  z1: -h, layout: 'island' },
      ],
      partitions: [
        // a second opening straight into the far room, so the route can be cut short
        { axis: 'x', at: 0, from: -hd, to: hd, doors: [dz, -dz] },
        { axis: 'z', at: 0, from: 0,   to: hw, doors: [dx] },
      ],
      links: [
        { a: 0, b: 1, x: 0,  z:  dz, axis: 'x' },
        { a: 1, b: 2, x: dx, z:  0,  axis: 'z' },
        { a: 0, b: 2, x: 0,  z: -dz, axis: 'x' },
      ],
      entry:  { x: -hw + 1.8, z: 0 },
      stairs: { x:  hw - 2.6, z: -hd + 2.8 },
    };
  },

  /* Four rooms in a 2x2 block with a door on each shared wall, so the floor
     circulates in a loop instead of a dead-end chain. */
  quad({ hw, hd, names }){
    const h = WALL_T / 2;
    const qx = hw * 0.5, qz = hd * 0.5;
    return {
      rooms: [
        { name: names[0] || 'SOUTH WEST', x0: -hw, x1: -h, z0:  h,  z1: hd, layout: 'cryo'   },
        { name: names[1] || 'NORTH WEST', x0: -hw, x1: -h, z0: -hd, z1: -h, layout: 'lanes'  },
        { name: names[2] || 'SOUTH EAST', x0:  h,  x1: hw, z0:  h,  z1: hd, layout: 'hydro'  },
        { name: names[3] || 'NORTH EAST', x0:  h,  x1: hw, z0: -hd, z1: -h, layout: 'island' },
      ],
      partitions: [
        { axis: 'x', at: 0, from: -hd, to: hd, doors: [-qz, qz] },
        { axis: 'z', at: 0, from: -hw, to: hw, doors: [-qx, qx] },
      ],
      links: [
        { a: 0, b: 1, x: -qx, z:  0,  axis: 'z' },
        { a: 0, b: 2, x:  0,  z:  qz, axis: 'x' },
        { a: 1, b: 3, x:  0,  z: -qz, axis: 'x' },
        { a: 2, b: 3, x:  qx, z:  0,  axis: 'z' },
      ],
      entry:  { x: -hw + 1.8, z:  qz },
      stairs: { x:  hw - 2.6, z: -qz },
    };
  },

  /* A corridor straight through the middle with two rooms either side of it.
     The most office-building shape of the set — you are always one door from
     the spine, and never between two rooms without using it. */
  spinehall({ hw, hd, names }){
    const h = WALL_T / 2;
    const CW = Math.max(4.4, Math.min(6.2, hd * 0.32));
    const cz0 = -CW / 2, cz1 = CW / 2;
    const dx = [-hw * 0.55, hw * 0.55];
    return {
      corridor: { x0: -hw, x1: hw, z0: cz0 + h, z1: cz1 - h },
      rooms: [
        { name: names[0] || 'NORTH WEST', x0: -hw, x1: -h, z0: -hd,     z1: cz0 - h, layout: 'cryo'   },
        { name: names[1] || 'SOUTH WEST', x0: -hw, x1: -h, z0: cz1 + h, z1: hd,      layout: 'lanes'  },
        { name: names[2] || 'NORTH EAST', x0:  h,  x1: hw, z0: -hd,     z1: cz0 - h, layout: 'hydro'  },
        { name: names[3] || 'SOUTH EAST', x0:  h,  x1: hw, z0: cz1 + h, z1: hd,      layout: 'island' },
      ],
      partitions: [
        { axis: 'z', at: cz0, from: -hw, to: hw, doors: dx },
        { axis: 'z', at: cz1, from: -hw, to: hw, doors: dx },
        { axis: 'x', at: 0, from: -hd,   to: cz0, doors: [] },
        { axis: 'x', at: 0, from: cz1,   to: hd,  doors: [] },
      ],
      links: [
        { a: -1, b: 0, x: dx[0], z: cz0, axis: 'z' },
        { a: -1, b: 1, x: dx[0], z: cz1, axis: 'z' },
        { a: -1, b: 2, x: dx[1], z: cz0, axis: 'z' },
        { a: -1, b: 3, x: dx[1], z: cz1, axis: 'z' },
      ],
      entry:  { x: -hw + 1.8, z: 0 },
      stairs: { x:  hw - 2.6, z: 0 },
    };
  },
};

/** Build the plan and derive everything the room builder and AI need. */
export function makePlan({ w, d, plan = 'split', names = [], doorWidth = DOORW }){
  const hw = w / 2, hd = d / 2;
  const def = PLANS[plan] || PLANS.split;
  const p = def({ hw, hd, names });
  p.doorWidth = doorWidth;
  p.hw = hw; p.hd = hd;

  /* Turn each partition into the wall segments that actually get built, by
     subtracting the door gaps from the full span. */
  p.segments = [];
  for (const part of p.partitions){
    const gaps = (part.doors || [])
      .map(c => [c - doorWidth / 2, c + doorWidth / 2])
      .sort((a, b) => a[0] - b[0]);
    let cursor = part.from;
    for (const [g0, g1] of gaps){
      if (g0 > cursor) p.segments.push({ axis: part.axis, at: part.at, from: cursor, to: g0 });
      cursor = Math.max(cursor, g1);
    }
    if (cursor < part.to) p.segments.push({ axis: part.axis, at: part.at, from: cursor, to: part.to });
  }

  /* Room adjacency, so enemies in one room can path toward the player in
     another instead of grinding against a wall. -1 is the corridor. */
  const idx = n => n < 0 ? 'corridor' : String(n);
  p.graph = {};
  const touch = k => (p.graph[k] = p.graph[k] || []);
  for (const l of p.links){
    touch(idx(l.a)).push({ to: idx(l.b), x: l.x, z: l.z, axis: l.axis });
    touch(idx(l.b)).push({ to: idx(l.a), x: l.x, z: l.z, axis: l.axis });
  }

  /** Which room contains this point, or -1 if none — a corridor is not a room.
      Reporting "nearest room" here would mark a room as entered while the player
      is still outside it, which spawns its growth into a space they have not
      opened and can leave the floor unfinishable. */
  p.roomAt = (x, z) => {
    for (let i = 0; i < p.rooms.length; i++){
      const r = p.rooms[i];
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return i;
    }
    return -1;
  };

  /** Nearest room, for the places that genuinely want a fallback. */
  p.nearestRoom = (x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < p.rooms.length; i++){
      const r = p.rooms[i];
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const dd = (x - cx) ** 2 + (z - cz) ** 2;
      if (dd < bd){ bd = dd; best = i; }
    }
    return best;
  };

  /** Centre of a graph node, used to aim past a doorway rather than at it. */
  const centreOf = (node) => {
    if (node === 'corridor' && p.corridor)
      return { x: (p.corridor.x0 + p.corridor.x1) / 2, z: (p.corridor.z0 + p.corridor.z1) / 2 };
    const r = p.rooms[Number(node)];
    return r ? { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 } : null;
  };

  p.inRoom = (i, x, z) => {
    const r = p.rooms[i];
    return !!r && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  };

  /** First doorway to walk toward when travelling from room `from` to `to`. */
  p.routeDoor = (from, to) => {
    if (from === to) return null;
    const start = idx(from), goal = idx(to);
    const prev = { [start]: null };
    const q = [start];
    let head = 0;
    while (head < q.length){
      const cur = q[head++];
      if (cur === goal) break;
      for (const e of p.graph[cur] || []){
        if (e.to in prev) continue;
        prev[e.to] = { node: cur, x: e.x, z: e.z, axis: e.axis };
        q.push(e.to);
      }
    }
    if (!(goal in prev)) return null;
    let step = goal;
    while (prev[step] && prev[step].node !== start) step = prev[step].node;
    const e = prev[step];
    if (!e) return null;
    /* Aim a little PAST the doorway so nothing oscillates on the threshold as
       its current room flips across the wall line — but step through the wall
       PERPENDICULARLY. Aiming at the far room's centre slides the waypoint
       sideways out of the opening and into the wall beside it. */
    const c = centreOf(step);
    if (!c) return { x: e.x, z: e.z };
    if (e.axis === 'x') return { x: e.x + Math.sign(c.x - e.x || 1) * 1.8, z: e.z };
    return { x: e.x, z: e.z + Math.sign(c.z - e.z || 1) * 1.8 };
  };

  return p;
}
