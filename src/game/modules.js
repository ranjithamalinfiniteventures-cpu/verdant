/* The nine modules. Each gets its own footprint, layout, palette and enemy mix,
   so no two rooms read the same — or play the same — on the way through.
   `mix` is [type, weight] pairs; each module introduces one new idea, then the
   next one combines it with what came before. */
export const MODULES = [
  { name: 'CRYO BAY',      w: 34, d: 24, layout: 'cryo',    total: 14, maxAlive:  8, interval: 1.25,
    accent: 0x38bdf8, tint: 0xdff0ff, cove: 0xcdf3ff,
    mix: [['creeper', 1]] },

  { name: 'CORRIDOR A',    w: 42, d: 20, layout: 'lanes',   total: 17, maxAlive:  9, interval: 1.10,
    accent: 0xff8c42, tint: 0xffffff, cove: 0xdaf2ff,
    mix: [['creeper', 4], ['lasher', 1]] },

  { name: 'HYDROPONICS',   w: 36, d: 28, layout: 'hydro',   total: 21, maxAlive: 11, interval: 0.98,
    accent: 0x4ade80, tint: 0xdcffe9, cove: 0xd6ffe4,
    mix: [['creeper', 3], ['sporeling', 2]] },

  { name: 'MED LAB',       w: 34, d: 26, layout: 'island',  total: 24, maxAlive: 12, interval: 0.90,
    accent: 0xffffff, tint: 0xeaf6ff, cove: 0xffffff,
    mix: [['creeper', 4], ['thornbeast', 1]] },

  { name: 'REACTOR RING',  w: 32, d: 32, layout: 'scatter', total: 27, maxAlive: 13, interval: 0.82,
    accent: 0xfbbf24, tint: 0xfff0d8, cove: 0xffe6b0,
    mix: [['creeper', 3], ['lasher', 1], ['sporeling', 2]] },

  { name: 'CREW QUARTERS', w: 38, d: 24, layout: 'cryo',    total: 30, maxAlive: 14, interval: 0.76,
    accent: 0xff8c42, tint: 0xffeede, cove: 0xffe9d2,
    mix: [['creeper', 5], ['bloomer', 1]] },

  { name: 'CARGO HOLD',    w: 46, d: 30, layout: 'spine',   total: 34, maxAlive: 16, interval: 0.68,
    accent: 0xfbbf24, tint: 0xf4f7f4, cove: 0xdff0ff,
    mix: [['creeper', 3], ['seeder', 1], ['thornbeast', 1]] },

  { name: 'GREENHOUSE',    w: 40, d: 30, layout: 'hydro',   total: 38, maxAlive: 18, interval: 0.60,
    accent: 0x4ade80, tint: 0xd2ffdd, cove: 0xc8ffd8,
    mix: [['creeper', 3], ['sporeling', 2], ['lasher', 1], ['bloomer', 1]] },

  { name: 'POD BAY',       w: 38, d: 28, layout: 'scatter', total: 44, maxAlive: 20, interval: 0.54,
    accent: 0xe879f9, tint: 0xffe4fb, cove: 0xffd9fa,
    mix: [['creeper', 3], ['thornbeast', 2], ['seeder', 1], ['sporeling', 2], ['lasher', 1]] },
];
