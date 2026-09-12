/* The tower, ground up. Each floor states its own architecture, footprint,
   palette and enemy mix — nothing is inherited, so a floor can be retuned
   without dragging another one with it.

   `plan` picks the shape, `rooms` names them in walking order, `mix` is
   [type, weight] pairs. Every floor introduces one idea and then the next
   floor combines it with what came before. */
export const FLOORS = [
  { name: 'CONTAINMENT', machine: 'cryopods',  plan: 'split',     w: 48, d: 21, total: 30, maxAlive: 12, interval: 0.95,
    accent: 0x38bdf8, tint: 0xdff0ff, cove: 0xcdf3ff, layout: 'cryo',
    rooms: ['CRYO WARD', 'SECURITY LAB'],
    mix: [['creeper', 4], ['stalker', 1]] },

  { name: 'BIOSPHERE', machine: 'planters',    plan: 'suite',     w: 54, d: 26, total: 38, maxAlive: 15, interval: 0.88,
    accent: 0x4ade80, tint: 0xdcffe9, cove: 0xd6ffe4, layout: 'hydro',
    rooms: ['GROWTH LAB', 'SEED VAULT', 'HYDROPONICS'],
    mix: [['creeper', 3], ['sporeling', 2]] },

  { name: 'MACHINE DECK', machine: 'turbine', plan: 'triptych',  w: 56, d: 22, total: 40, maxAlive: 16, interval: 0.82,
    accent: 0xff8c42, tint: 0xfff1e2, cove: 0xffe4c8, layout: 'spine',
    rooms: ['PUMP ROOM', 'TURBINE HALL', 'COOLANT BAY'],
    mix: [['creeper', 4], ['stalker', 1], ['thornbeast', 1]] },

  { name: 'CREW LEVEL', machine: 'cargo',   plan: 'corridor',  w: 58, d: 27, total: 54, maxAlive: 19, interval: 0.72,
    accent: 0xfbbf24, tint: 0xfff0d8, cove: 0xffe6b0, layout: 'cryo',
    rooms: ['MESS HALL', 'BUNKS', 'INFIRMARY'],
    mix: [['creeper', 4], ['bloomer', 1], ['sporeling', 2]] },

  { name: 'LABORATORIES', machine: 'servers', plan: 'quad',      w: 52, d: 34, total: 62, maxAlive: 22, interval: 0.66,
    accent: 0xbcd4e8, tint: 0xeaf6ff, cove: 0xd9ecf7, layout: 'island',
    rooms: ['SPECIMEN LAB', 'CENTRIFUGE', 'CLEAN ROOM', 'GENE BANK'],
    mix: [['creeper', 3], ['sporeling', 2], ['seeder', 1]] },

  { name: 'REACTOR TIER', machine: 'reactor', plan: 'spinehall', w: 58, d: 32, total: 70, maxAlive: 24, interval: 0.60,
    accent: 0xf59e0b, tint: 0xfff0cf, cove: 0xffdda0, layout: 'scatter',
    rooms: ['CONTROL', 'FUEL STORE', 'CORE ACCESS', 'HEAT SINK'],
    /* Was 3 creeper / 2 thornbeast / 1 stalker / 1 bloomer: 43% tanks and 3.7x the
       health of floor 5 — tougher than floors 7 and 9, so the whole run stalled
       here. Thornbeasts stay as this floor's idea, one in the rotation, with
       fast fragile sporelings for pressure instead of more bulk. */
    mix: [['creeper', 5], ['thornbeast', 1], ['stalker', 1], ['sporeling', 2]] },

  { name: 'ARCHIVE', machine: 'servers',      plan: 'triptych',  w: 54, d: 26, total: 80, maxAlive: 26, interval: 0.55,
    accent: 0xa855f7, tint: 0xf3e8ff, cove: 0xe9d5ff, layout: 'lanes',
    rooms: ['STACKS', 'READING ROOM', 'COLD STORE'],
    mix: [['creeper', 3], ['sporeling', 2], ['seeder', 1], ['stalker', 1], ['thornbeast', 1]] },

  { name: 'SKY BRIDGE', machine: 'cargo',   plan: 'corridor',  w: 58, d: 28, total: 92, maxAlive: 28, interval: 0.50,
    accent: 0xe879f9, tint: 0xffe4fb, cove: 0xffd9fa, layout: 'scatter',
    rooms: ['CARGO DECK', 'MAINTENANCE', 'BRIDGE ACCESS'],
    mix: [['creeper', 3], ['thornbeast', 2], ['seeder', 1], ['sporeling', 2], ['stalker', 1], ['bloomer', 1]] },

  /* Two floors above the old roof. Same footprints as the floors below them —
     a floor is built when you arrive and thrown away when you leave, so the
     height of the tower costs nothing; only the size of a single floor does. */
  { name: 'OBSERVATORY', machine: 'servers',   plan: 'quad',      w: 54, d: 34, total: 104, maxAlive: 30, interval: 0.46,
    accent: 0x67e8f9, tint: 0xe0fbff, cove: 0xc6f6ff, layout: 'island',
    rooms: ['TELESCOPE HALL', 'STAR CHART', 'SIGNAL ROOM', 'DOME ACCESS'],
    mix: [['creeper', 3], ['sporeling', 3], ['stalker', 2], ['seeder', 1], ['bloomer', 1]] },

  { name: 'HEARTROOT CANOPY', machine: 'planters', plan: 'spinehall', w: 58, d: 34, total: 110, maxAlive: 32, interval: 0.42,
    accent: 0xf472b6, tint: 0xffe1f0, cove: 0xffc9e6, layout: 'lanes',
    rooms: ['ROOT WELL', 'BLOOM GALLERY', 'SPORE LOFT', 'LANDING PAD'],
    mix: [['creeper', 3], ['thornbeast', 1], ['seeder', 2], ['sporeling', 3], ['stalker', 2], ['bloomer', 1]] },

  /* The upper tower, 11–20. Pressure keeps rising through population and
     spawn tempo; the health/damage curve in main.js bends so it stays beatable.
     Every floor below 20 leans on one lesson — the mix says which. */
  { name: 'GARDEN DECK', machine: 'planters',   plan: 'suite',     w: 56, d: 30, total: 99, maxAlive: 33, interval: 0.41,
    accent: 0x86efac, tint: 0xe3ffe9, cove: 0xc8ffd6, layout: 'hydro',
    rooms: ['TERRACE', 'ORCHARD', 'POLLEN HOUSE'],
    mix: [['creeper', 3], ['sporeling', 4], ['seeder', 2], ['stalker', 1]] },

  { name: 'FILTRATION', machine: 'turbine',     plan: 'triptych',  w: 58, d: 26, total: 102, maxAlive: 34, interval: 0.40,
    accent: 0x7dd3fc, tint: 0xe6f7ff, cove: 0xcdefff, layout: 'spine',
    rooms: ['INTAKE', 'SCRUBBERS', 'OUTFLOW'],
    mix: [['creeper', 4], ['thornbeast', 2], ['stalker', 2], ['sporeling', 2]] },

  { name: 'QUARANTINE', machine: 'cryopods',    plan: 'quad',      w: 54, d: 34, total: 122, maxAlive: 35, interval: 0.39,
    accent: 0xfca5a5, tint: 0xffe9e9, cove: 0xffd0d0, layout: 'island',
    rooms: ['ISOLATION A', 'ISOLATION B', 'DECON', 'MORGUE'],
    mix: [['creeper', 3], ['bloomer', 2], ['sporeling', 3], ['seeder', 1]] },

  { name: 'OVERGROWN LABS', machine: 'servers', plan: 'spinehall', w: 58, d: 34, total: 126, maxAlive: 36, interval: 0.38,
    accent: 0xa3e635, tint: 0xf1ffd6, cove: 0xe4ffb8, layout: 'scatter',
    rooms: ['WET LAB', 'SEQUENCERS', 'INCUBATORS', 'SAMPLE STORE'],
    mix: [['creeper', 3], ['stalker', 3], ['thornbeast', 2], ['seeder', 2], ['sporeling', 2]] },

  { name: 'SIGNAL SPIRE', machine: 'servers',   plan: 'corridor',  w: 58, d: 28, total: 130, maxAlive: 37, interval: 0.37,
    accent: 0xfde68a, tint: 0xfff7d6, cove: 0xffefb3, layout: 'lanes',
    rooms: ['RELAY', 'ANTENNA BAY', 'UPLINK'],
    mix: [['creeper', 3], ['sporeling', 3], ['thornbeast', 3], ['bloomer', 1], ['stalker', 2]] },

  { name: 'ROOT FORGE', machine: 'reactor',     plan: 'triptych',  w: 58, d: 28, total: 134, maxAlive: 38, interval: 0.36,
    accent: 0xfb923c, tint: 0xffe9d6, cove: 0xffd3ad, layout: 'spine',
    rooms: ['CRUCIBLE', 'CASTING HALL', 'SLAG PIT'],
    mix: [['creeper', 4], ['thornbeast', 2], ['stalker', 3], ['bloomer', 1], ['sporeling', 2]] },

  { name: 'CANOPY LIFTS', machine: 'cargo',     plan: 'quad',      w: 54, d: 34, total: 138, maxAlive: 39, interval: 0.35,
    accent: 0xc4b5fd, tint: 0xefeaff, cove: 0xdcd2ff, layout: 'lanes',
    rooms: ['LIFT LOBBY', 'WINCH ROOM', 'FREIGHT CAGE', 'GANTRY'],
    mix: [['creeper', 3], ['seeder', 3], ['sporeling', 3], ['stalker', 2], ['thornbeast', 2]] },

  { name: 'SPORE CATHEDRAL', machine: 'planters', plan: 'suite',   w: 58, d: 32, total: 142, maxAlive: 40, interval: 0.34,
    accent: 0xf0abfc, tint: 0xfbe8ff, cove: 0xf5ccff, layout: 'hydro',
    rooms: ['NAVE', 'CHOIR', 'CRYPT'],
    mix: [['creeper', 3], ['bloomer', 2], ['sporeling', 4], ['seeder', 2], ['stalker', 2]] },

  { name: 'HEARTROOT THROAT', machine: 'reactor', plan: 'spinehall', w: 58, d: 34, total: 146, maxAlive: 41, interval: 0.33,
    accent: 0xf43f5e, tint: 0xffe1e6, cove: 0xffc2cc, layout: 'scatter',
    rooms: ['ARTERY', 'VALVE HALL', 'PULSE CHAMBER', 'MARROW'],
    mix: [['creeper', 2], ['thornbeast', 3], ['stalker', 3], ['seeder', 2], ['sporeling', 3], ['bloomer', 2]] },

  { name: 'THE CROWN', bossArena:true, machine: 'cargo', plan: 'arena', w: 40, d: 30, total: 36, maxAlive: 8, interval: 2.2,
    accent: 0xfbbf24, tint: 0xfff4d1, cove: 0xffe8a3, layout: 'island',
    rooms: ['HEARTROOT ARENA'],
    mix: [['creeper', 4], ['stalker', 2], ['sporeling', 2]] },
];

/** Split the floor's growth budget across its rooms, back-loading the remainder. */
export function floorZones(floor, room){
  const zones = room.zones;
  const each = Math.floor(floor.total / zones.length);
  const left = floor.total - each * zones.length;
  return zones.map((z, i) => {
    z.budget = each + (i >= zones.length - left ? 1 : 0);
    z.started = false;
    return z;
  });
}
