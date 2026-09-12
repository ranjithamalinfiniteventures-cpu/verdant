# VERDANT

Top-down 3D auto-shooter, room-by-room escape up a 20-floor tower. Three.js.

## Run (development)

```bash
npm run dev
```

Then open **http://localhost:5173**. It must be served over HTTP — the ES module
import map will not resolve from `file://`. There is no build step in
development: edit anything under `src/` and reload.

`serve.py` sends `Cache-Control: no-store` on purpose. Browsers keep ES modules
in a per-URL module map and will happily serve a stale `src/*.js` after an edit,
which looks exactly like "my change did nothing".

## Build (release)

```bash
npm run build
```

Writes `dist/` — one HTML file, one bundled+minified JS file, and the assets.
It is about 1 MB on disk and ships the game itself in **3 local requests**.
When hosted on CrazyGames, the bootstrap makes one optional SDK request for
platform integration; art, fonts, and Three.js remain fully local. Zip the
contents of `dist/` and upload it to a portal as-is.

Three.js and the Outfit font are both vendored into the repo rather than pulled
from a CDN, so development is offline-clean too and the shipped game cannot
break because someone else's CDN moved. `npm run vendor` re-copies three out of
`node_modules` (it walks the addon import graph, so it picks up the transitive
shader/pass dependencies as well as the ones `src/` names directly).

## Dev shortcuts

Local hosts only — `localhost` / `127.0.0.1`. A shipped build ignores these, so
nobody can skip to the ending with a query string and a leaderboard time cannot
start on floor 20.

| URL | |
|---|---|
| `?boss` | top floor, Heartroot wakes immediately, endgame loadout (Solar Plasma lv5 + 4000 coins) |
| `?floor=13` | start on that floor |
| `?eclipse` | enter Eclipse Foundry directly |
| `?maxed` | every gun at level 5 and a full wallet, for judging a floor on its own terms (`?maxed=0` restores a starting laser, `&gun=rail` picks what you hold) |

`?boss` grants its loadout **in memory only** — it disables the armory's save for
that session, so it cannot write a maxed gun into your real progress.

## Test

```bash
npm test
```

## Controls

`WASD` / arrows on desktop, or drag anywhere on mobile (the stick spawns under your thumb).

| Key | |
|---|---|
| `P` | toggle the FPS / frame-time / quality readout |
| `]` `[` | raise / lower quality by hand |
| `Z` | choose The Tower, Heartwood Pit, or Eclipse Foundry |

## Eclipse Foundry

A third zone, reached through **Choose a zone** in the upper-left HUD or `Z`.
The suspended star-engine arena has an eclipsed sun, orbital rings, rift docks,
relay crystals, a central gyroscope, and a cyan/gold interface. Its scenery is
procedural Three.js geometry and shaders, with no additional network assets.

It shares Heartwood's endless wave curve, fifth-wave surges, tenth-wave bosses,
between-wave healing, permanent run upgrades, armory, and grenade allowance.
From wave 3, amber reactor lanes give 1.8 seconds of warning before firing;
they damage both the pilot and growth. From wave 12, two lanes charge at once.
Hazards stop during breathers, and pause with the game. Best waves and scores
are separate from Heartwood. Eclipse's leaderboard is **this device only**;
it does not submit to the existing Heartwood server board.

Switching arenas starts a fresh wave run. Returning to the tower resumes its
floor, keeps earned currency, and makes that tower run unranked.

## What is built

- [x] **1. Greybox movement** — top-down camera, acceleration/damping, run cycle, prop collision
- [x] Premium render path: ACES tonemap, PMREM environment probe, GTAO, bloom, custom grade (vignette / saturation / grain), 4× MSAA HDR buffer
- [x] Full HUD from the layout, health pinned under the player in world space
- [x] **2. Auto-fire + first enemy** — Creeper swarm, target acquisition, contact damage,
      biomass drops, death/reset, wave director, and the exit unlocking on room clear
- [x] Combat feel: hit-stop on kills, camera shake, muzzle light, knockback, hit flash,
      instanced particles + shock rings, invulnerability blink
- [x] **3. Door transition** — walk into the unlocked exit, light floods in, the next module
      builds, and the door you came through **grows shut behind you**. All nine modules, four
      six layout templates (`cryo`, `spine`, `hydro`, `island`, `lanes`, `scatter`), per-module
      size, accent colour, floor tint, cove-light colour and difficulty,
      camera fitted and clamped to each room, escape ending
- [x] **Audio** — fully procedural (no samples). Synthesised SFX with per-shot pitch/pan/level
      variation and density ducking, plus a generative ambient music bed that opens up with
      combat pressure. `M` or the ♪ button mutes; settings persist.
- [x] **Level integrity** — door approaches are protected keep-out zones, and every room is
      flood-fill verified traversable at build time
- [ ] 4. Upgrade cards between rooms
- [ ] 5. Enemy roster · 6. Lighting pass · 7. Nine modules · 8. Heartroot · 9. Juice · 10. Meta

### Known balance gaps

- A module clears in **15–18 s** against a stationary player — the wave director is spawn-rate
  bound (14 growth at ~1.2 s intervals), not difficulty bound. The design target is ~90 s per
  module. Retune once there is more than one enemy type.
- One Creeper stuck to you kills in ~10 s (15 contacts). Fine in isolation, untested in a swarm.
- A **full nine-module run simulates in ~3.7 min** against a stationary player. The design target
  is 12–18 min. Same root cause: pacing is spawn-rate bound, not difficulty bound.

### Debugging

The whole frame is `VERDANT.tick(dt, render)`, callable by hand — step the game deterministically
without waiting on `requestAnimationFrame`:

```js
VERDANT.resetModule();
while (!VERDANT.state.cleared) VERDANT.tick(1/60, false);   // simulate a whole module
```

See `DESIGN.md` for the full design and `layout/layout.html` for the visual layout.

## Audio

Everything is synthesised at runtime through the Web Audio API — nothing is sampled or
downloaded. That is a deliberate choice, not a shortcut: the weapon fires ~6×/second, and a
repeated sample at that rate becomes fatiguing within a minute. Each shot instead gets its own
pitch, stereo position and level, and the whole layer **ducks as fire density rises** — ten shots
in 1.7 s peak barely louder than one.

Measured mix (RMS peak, music isolated out):

| | level | |
|---|---|---|
| spawn / shot / hit | 0.010–0.018 | constant, deliberately subtle |
| hurt / door / seal / pickup | 0.033–0.043 | events |
| kill / death | 0.048–0.051 | |
| **room clear** | **0.060** | the loudest moment in a module |
| music bed | 0.046 | |

Pickups in quick succession climb a D-minor scale and reset after a gap. The music is a drone
plus drifting chord voicings, with sparse plucks that only appear when enemies are alive.

To use a real track instead, drop a file in `assets/audio/` and call
`VERDANT.audio.loadTrack('assets/audio/music.mp3')` — it crossfades in and retires the
generative bed. Pixabay blocks automated downloads (403), so that file has to be added by hand.

## Level integrity

A room the player cannot walk out of is unshippable, so it is **verified, not trusted**:

- Both door approaches are keep-out zones; `prop()` and `tank()` refuse to place into them.
- After building, a flood fill at the player's radius (0.42 m) confirms the exit lane is
  reachable from the entry. If it isn't, props are removed off the direct line until it is,
  with a console warning.
- `VERDANT.room.isTraversable()` exposes the check. Verified against a sealed room, a 0.5 m gap
  and a 1.0 m gap (correctly impassable for an 0.84 m body) and 2.2 m / 3.0 m gaps (passable).


## Floor plans

A floor is no longer one hall with an invisible line down the middle. It is a set of real rooms
separated by real walls, joined by framed doorways, with a stairwell up in the last room.

`src/game/floorplan.js` is pure geometry — no Three.js. It returns the room rects, the wall
segments to build (door gaps already subtracted), the links between rooms, and a room graph.

| plan | shape |
|---|---|
| `split` | two rooms, one shared wall, central doorway |
| `triptych` | three rooms in a row, staggered doors so crossing is a zig-zag |
| `corridor` | a service corridor along the back wall with rooms opening off it; the rooms do **not** connect to each other |
| `suite` | one long hall, then the far half divided in two — the route doubles back so the stairwell is never in sight from the entrance |

`src/game/room.js` builds geometry from the plan: per-room floor slabs on their own tint, walls with
skirting and cove light on every face, framed doorways with an accent threshold, a room-name sign
over each opening, and a stairwell.

Rules the builder enforces rather than trusts:

- **Door approaches are keep-out zones.** Layouts author positions with no idea where the doors are.
- **Layouts are scoped to their room.** A layout is written against a room-sized rect at the origin,
  translated into place, and anything spilling past that room's own walls is dropped.
- **Every floor is flood-fill verified** at the player's radius: the stairwell *and every room* must
  be reachable from the entry, or props are removed until they are. An unreachable room is an
  unfinishable floor.

### Two bugs this shook out

- `roomAt()` used to fall back to "nearest room" for a point in a corridor. On the `corridor` plan
  the player arrives in the corridor, so a room was marked entered while they stood outside it —
  it spawned its growth into a space the player had not opened, and no other room ever started.
  **The floor could not be finished.** `roomAt` now returns `-1` outside every room.
- Route waypoints aimed *past* a doorway toward the destination room's centre, to stop entities
  oscillating on the threshold. For a corridor that centre is far to the side, so the overshoot slid
  the waypoint out of the opening and into the wall beside it — anything following it walked into a
  wall forever. Waypoints now step through the opening perpendicular to the wall.


## Finding the last few

Rooms are 22–25 units across but the pruning laser reaches 9.2, so a floor could end with a
rooted Lasher in a far corner and no way to know where. Two pieces of information now:

- **Per-room counts** in the floor strip — `▸ CRYO WARD 0 / SECURITY LAB 3` — so you know which
  room to walk to. The number is live growth in that room plus what has yet to spawn there.
- **Edge arrows** for growth that is off screen, coloured by enemy type, nearest first and capped
  at eight so a busy room isn't a ring of arrows. Nearer reads bigger and brighter, so they rank
  themselves. `hud.setThreats()`.

## Camera

`fitRoom(w, d, clampW, clampD)` — zoom is chosen for the room you stand in, the clamp is the whole
floor. An earlier version held the camera back so it would never show space past the walls. That
was right when a room *was* the level, but a floor is far wider than the camera can see, so the
clamp pinned the camera and slid the player to the screen edge on the way to a far wall. Measured
at every wall and corner of all three floors, the player now sits within **10%** of screen centre;
before the fix the worst case was **175%** — entirely off screen.


## Gems — the Seed Vault

`src/game/vault.js`. Coins are the run economy; **gems are the meta economy** the design doc called
the Seed Vault. They are kept through death, shown as the green counter top-right, and spent in two
places:

- **The Seed Vault shelf in the armory** (same pad, same two-second dwell) sells five permanent suit
  perks: Reinforced Plating (−6% damage taken per level, 5 levels), Bark Spores (start every floor
  with shield charges), Salvage Rig (+10% coin value per level), Wider Shelf (a fourth upgrade card),
  Second Wind (revive once per run at half health, with a knockback burst).
- **Reroll** on the between-floor upgrade screen (`R` or the button). Costs 1 gem, then 2, then 3 on
  the same floor, so a bad shelf is a decision rather than a free scroll.

Earned: 1 per floor cleared (+1 on every third floor, 4 for the last, doubled above floor 10), 3 more for surviving the
extraction hold-out, and elites (Stalker, Thornbeast, Bloomer, Seeder) drop a green gem on a 10%
chance — but never their spawned children, or a camped Bloomer would be a gem farm. A perfect
kill-everything run banks ~50; every perk maxed costs 147, so the vault fills over several runs.
Persisted in `verdant.vault.v1`. `node tests/vault.test.mjs` covers earn/spend, caps and bad saves.

The HUD's right column is real now: ◆ gems found this run, ✚ Second Wind charges (hidden until owned).

## The tower — 20 floors

`src/game/floors.js`. Each floor states its own architecture, footprint, palette and enemy mix;
nothing is inherited, so one can be retuned without dragging another with it.

| # | floor | plan | rooms | growth |
|---|---|---|---|---|
| 1 | CONTAINMENT | split | 2 | 26 |
| 2 | BIOSPHERE | suite | 3 | 32 |
| 3 | MACHINE DECK | triptych | 3 | 38 |
| 4 | CREW LEVEL | corridor | 3 | 44 |
| 5 | LABORATORIES | quad | 4 | 50 |
| 6 | REACTOR TIER | spinehall | 4 | 56 |
| 7 | ARCHIVE | triptych | 3 | 62 |
| 8 | SKY BRIDGE | corridor | 3 | 92 |
| 9 | OBSERVATORY | quad | 4 | 104 |
| 10 | HEARTROOT CANOPY | spinehall | 4 | 118 |
| 11 | GARDEN DECK | suite | 3 | 124 |
| 12 | FILTRATION | triptych | 3 | 130 |
| 13 | QUARANTINE | quad | 4 | 136 |
| 14 | OVERGROWN LABS | spinehall | 4 | 142 |
| 15 | SIGNAL SPIRE | corridor | 3 | 148 |
| 16 | ROOT FORGE | triptych | 3 | 154 |
| 17 | CANOPY LIFTS | quad | 4 | 160 |
| 18 | SPORE CATHEDRAL | suite | 3 | 166 |
| 19 | HEARTROOT THROAT | spinehall | 4 | 172 |
| 20 | THE CROWN | corridor | 3 | 180 |

### Difficulty curve past floor 10

Population and spawn tempo keep rising all the way up (`maxAlive` 12 → 42, `interval` 0.95 → 0.32 s).
Enemy **health** climbs 18% a floor to floor 10, then 9% a floor — ~4.5× base at the top.
**Damage** climbs 12% a floor to floor 10, then 4%, and is **capped at 2.4×** so a single Creeper
hit never costs more than a quarter of the bar. The intent: floor 20 is a wall of elites you have to
out-move, but with a levelled gun, Reinforced Plating and a couple of shield perks it is beatable.
Death restarts the current floor, not the tower, and gem income doubles above floor 10 so a player
who keeps dying at 15 is still buying the perks that get them past it. `floorHpScale` /
`floorDamageScale` in `main.js`; `tests/balance.test.mjs` pins the caps and the enemy-pool limit.

**Adding floors costs nothing at runtime.** A floor is built when you arrive and disposed when you
leave — the tower is never in memory at once, so twenty floors run exactly like eight on a low-end
phone. What *does* cost is the size of a single floor: footprint, prop count and `maxAlive`. Floors
9 and 10 reuse the largest existing footprints (54×34, 58×34) and existing plans, so the measured
draw-call and triangle budgets below still hold. If you add more, keep floors inside those
footprints and raise pressure through `maxAlive` and `interval`, not floor area.

Two plans added for this: **`quad`** (2×2 rooms with a door on each shared wall, so the floor
circulates in a loop) and **`spinehall`** (a corridor straight through the middle with two rooms
either side — the most office-building shape of the set).

Verified across all twenty: traversable entry → every room → stairwell, every doorway ≥ **3.3 m**
of clearance for an 0.84 m player, zero props auto-removed.

### A bug this shook out

The armory was placed at the raw entry point. On `corridor` and `spinehall` plans you arrive *in a
corridor*, so the shop was wedged into a 4 m passage and left a pocket you could get permanently
stuck in — a test run sat motionless against a rack for 36 seconds. It now sits just inside the
first room, and its footprint is a keep-out zone so props don't crowd it.

## Download size

| | before | after |
|---|---|---|
| three.js | 1274 KB | 758 KB |
| game source | 161 KB | 147 KB |
| **total** | **1.52 MB** | **0.89 MB** |

The import map pointed at the **unminified** three.js dev build. Switching to `three.module.min.js`
cut 516 KB. Over a real host with gzip the three.js payload is ~165 KB. Addons under
`examples/jsm/` are not minified on npm, which is the remaining ~90 KB — bundling would remove it.


## Weapon feel

Stats live in `GUNS`, *feel* lives in a separate `FEEL` table in `weapons.js` — muzzle flash
intensity, screen shake, blast ring, and the particle counts for muzzle and impact. Each gun also
has its own synthesised voice (`audio.gun(id)`) and impact voice (`audio.impactFor(id)`).

Measured, music muted (RMS peak). The loudness is inverse to fire rate, and sustained fire stays at
single-shot level for every gun — the density duck holds, so nothing becomes a wall of noise:

| gun | rate | single | 1.5 s sustained |
|---|---|---|---|
| Needle Drive | 13/s | 0.0094 | 0.0092 |
| Pruning Laser | 6.2/s | 0.0166 | 0.0161 |
| Ember Scatter | 1.8/s | 0.0480 | 0.0461 |
| Solar Plasma | 1.6/s | 0.0648 | 0.0653 |
| Violet Rail | 1.15/s | 0.0718 | 0.0723 |

## Floor character

- **Windows** — interior walls longer than 5 m are built as low wall + glazed band + header, so you
  see the next room before committing to the door. Collision is unchanged.
- **Alternate routes** — `split` has two doors instead of one, `suite` gained a shortcut straight to
  the stairs room, `quad` circulates in a loop.
- **Machinery** — one signature machine per floor (`cryopods`, `planters`, `turbine`, `cargo`,
  `servers`, `reactor`), capped at two per floor.
- **Workshop bay** — the armory sits in a recessed alcove with its own deck and ceiling strip.

## Floor map

`src/ui/minimap.js`. A 2D canvas, deliberately **not** a second camera — a 3D minimap means drawing
the floor twice per frame. Costs nothing on the GPU, throttled to 12 Hz. Shows explored rooms,
remaining growth per room, doorways, armory, stairs, and player heading.

## Escape

Clearing the last floor does not open the roof: it calls the shuttle and starts a **26-second
hold-out** with continuous spawns (peak 23 enemies measured). Then the pad opens, the player is
lifted out on a column of light, and a results screen shows floors, kills, coins and run time.

## Rendering budget

| | before | after |
|---|---|---|
| worst draw calls | 263 | **157** |
| worst triangles | 152,055 | **43,251** |

Three changes bought this, and they are what let all the content above be added without costing
frame time:

1. **Static geometry is merged per room, per material.** A floor was ~150 separate meshes and the
   shadow pass drew them all again. Merging *per room* (not per floor) matters — one mesh for the
   whole floor can never be frustum-culled.
2. **Thin boxes use a plain `BoxGeometry`.** `RoundedBoxGeometry` costs far more per box, and the
   bevel is invisible on a 10 cm light strip.
3. Cylinders dropped from 20 to 12 segments.

### Two visual traps

- `STEEL` had metalness 0.45. With the environment probe that rendered every steel prop **near
  white**, which is why grey machinery and shelving looked like glowing white boxes.
- A floor palette of `accent: #ffffff` with `cove: #ffffff` (LABORATORIES) put pure white straight
  through the bloom threshold. No floor uses pure white for an emissive any more.

### Two measurement traps worth knowing about

- **The dev server now sends `no-store`** (`serve.py`). Browsers keep ES modules in a per-URL module
  map and will serve a stale `src/*.js` after an edit — which looks exactly like "my change did
  nothing", and produced a set of performance numbers here that were measuring old code.
- **`RoundedBoxGeometry(w, h, d, 0, r)` silently ignores w/h/d and returns a 1x1x1 cube.** Forcing
  zero segments to skip the bevel appeared to cut triangles by 83%; it was actually turning every
  skirting strip, cove bar and mullion into a floating unit cube. Use `BoxGeometry` instead.


## Leaderboard

`src/game/leaderboard.js`. Fastest **completed** escape — a death is not a time, so only runs that
reach the top floor are accepted. The clock covers play and room transitions but stops while the armory
menu is open, so you cannot bank time by idling in the shop.

It ships with two interchangeable backends:

- `LocalBackend` (default) — `localStorage`. Real and working today, but the board is **this device
  only**, and the results screen says so: the header reads `THIS DEVICE`.
- `RemoteBackend` — set `REMOTE_URL` at the top of the file and the same UI becomes a shared board
  labelled `GLOBAL`. The contract is deliberately tiny:

```
POST <url>          { name, seconds, kills, coins, at }
GET  <url>?limit=20 -> [ { name, seconds, kills, coins, at }, ... ]
```

Anything can serve that — a small Express route, a Cloudflare Worker with KV, Supabase, Firebase.
**Validate on the server.** A time posted by a browser you do not control is a claim, not a fact;
without a server-side check the top of a public board becomes 0:01 within a day.

If you publish to CrazyGames, their SDK also provides accounts and leaderboards, which removes the
hosting problem entirely — that would replace `RemoteBackend` rather than sit behind it.


## Enemy animation

Enemy body parts are placed per-frame from the `parts()` list, and parts now support:

- `x` — lateral offset (previously only `z`, so nothing could sit off the centre line)
- `leg` — a walk-cycle phase 0..1. The part strides fore/aft, lifts on the forward half of the
  cycle and leans into the step, all scaled by the enemy's **actual** speed, so legs stop when the
  body stops rather than treadmilling on the spot.

The rooted **Lasher** is gone, replaced by the **Stalker**: four legs on a diagonal gait, walks you
down, plants its feet, then slams an arc. A stationary enemy reads as scenery; the lesson it taught
(watch the ground, not just the crowd) survives being mobile.

### The window mistake

Interior walls were built as low wall + glazed band + header. That is correct architecture and
completely wrong for a 50-degree top-down camera: the header floats free of the wall below it, so
every interior wall rendered as **two disconnected white beams with floor between them**. At this
angle a half-height wall already reads as a window — you see straight over it. Headers, glazing and
mullions are gone; interior runs longer than 5 m are simply low walls with a capping rail.


## Geometry audit

`room.debug.floating` captures every static mesh that is **long, thin and clear of the floor**
before batching, with its size, position and base height. Query it instead of guessing from a
screenshot:

```js
for (let i = 0; i < 8; i++) { VERDANT.startModule(i); console.log(i+1, VERDANT.room.debug.floating); }
```

The rule it exists to enforce: anything elevated must have something under it. A quick check is
whether a collider exists at that x/z — a collider means geometry reaches the floor there.

This was written after four separate bugs with one root cause: **wall geometry changed, and things
positioned relative to the old wall height were left behind.** The window header, the capping rail,
the skirting/cove heights, and finally the doorframes were all the same mistake in four places, each
found one screenshot at a time. The audit found the last of them across all eight floors in a single
query.

Two rules that came out of it:

- A doorframe must read its wall's actual height, not `H`.
- Whether a wall is low is decided **per partition, not per segment**. Deciding per segment left one
  partition 3.2 m at its ends and 1.15 m in the middle, because door gaps split it into pieces that
  fell either side of the length threshold.

## Performance

Measured cost of the ambient-occlusion pass, one frame, module 1:

| | draw calls | triangles |
|---|---|---|
| with GTAO | 197 | 114,663 |
| without GTAO | 104 | 57,337 |

GTAO re-renders the **entire scene** into a normals+depth buffer before it does the AO and
denoise passes, so it roughly doubles everything. It now **ships off** — quality defaults to 2.

Quality ladder (`VERDANT.engine.setQuality(n)`, or `[` / `]` in game):

| n | pixel ratio | AO | bloom | shadow map |
|---|---|---|---|---|
| 3 | 1.5 | on | on | 1536 |
| 2 | 1.25 | off | on | 1024 | ← default |
| 1 | 1.0 | off | on | 1024 |
| 0 | 0.8 | off | off | 512 |

The engine also **auto-steps down** if the rolling average drops below 45 fps. It never steps
back up — oscillating between quality levels reads worse than sitting one notch low. Disable
with `VERDANT.engine.autoQuality = false`.

Also fixed: the 1024² floor texture (850 procedural scuff passes) was being regenerated on
**every room build**, which meant a hitch on every door transition. It is generated once now.
Room rebuilds were verified leak-free — cycling all nine modules three times adds zero
geometries, textures or scene children.

## Notes

Three.js loads from jsDelivr via an import map. Pin/vendor it before shipping to a
portal like CrazyGames — they generally want a self-contained bundle.

## Gun armory

Walk onto the cyan ARMORY pad beside the west entrance and stand still for **2 seconds**. Moving resets the timer. Combat pauses inside the store until Resume or Escape. Step off before visiting again. The gun button / **B** points you toward the station; it cannot open the store remotely. Collect gold drops for **5 coins each**. Coins, owned guns, selected gun, and upgrade levels persist in local browser storage across deaths and runs.

Five guns: Pruning Laser (free), Ember Scatter (250 coins, five pellets), Needle Drive (600, rapid fire), Violet Rail (1,100, piercing), Solar Plasma (1,800, splash damage). Each has its own color, projectile motion/shape and gun animation. Upgrade each to level 5; every upgrade adds 25% of its base damage. Starter upgrades cost 120 coins per current level; purchased-gun upgrades begin at 35% of the gun price and rise each level. Enemy health bars follow live enemies and disappear on death.

### Difficulty curve

Enemy health now rises by 18% per floor and a further 8% in each deeper room. Incoming damage rises by 12% per floor and 6% per deeper room. Later rooms also spawn with shorter quiet gaps. Floor populations and simultaneous-enemy limits rise steadily from 30 growth / 12 alive on Containment to 92 growth / 28 alive on Extraction. Spawned children inherit their floor tier. The opening floor remains readable, while reaching Laboratories and beyond with an unupgraded starter gun requires substantially more movement and time.

### First-run story

New players see a four-panel introduction before the station-link loading screen. It uses centered white text on a plain black background with no illustrations. The story establishes peaceful life in Verdant Tower, the creation and escape of Heartroot, the fall of the workers, and the objective to climb to rooftop extraction. Tapping anywhere, Enter, Space, or Right Arrow advances; the fourth tap begins the game. Skip or Escape closes it. Completion is saved in `verdant.story.v1`, so it appears automatically only once. The STORY button in the upper-left HUD replays it without resetting the run.

Automatic visual downgrades are disabled. Existing manual quality controls remain available.

Checks: `node tests/armory.test.mjs` and `node tests/weapons.test.mjs`.

### Expanded station and weapon models

All nine modules now have larger footprints (34×24 opening room; up to 46×30 cargo hold), additional low cover and lane markings. The camera follows at a close gameplay scale. Store pads are reserved in the protected entrance lane. Five authored multi-part gun models replace the original shared barrel; menu illustrations use the same part definitions. Needle Drive rotates only its barrel cluster.

The armory uses a furnished workbench bay, white floor brackets and a circular two-second countdown. Opening it pauses combat, moves the camera into a close workshop view and slides up a horizontally scrollable weapon tray. Closing restores the gameplay camera.

## Tower escape

The active campaign now uses `src/game/floors.js`: three floors (Containment, Biosphere, Extraction), each with two connected combat chambers and a workshop near the entrance. Walk freely through the central passage; no room loading or reset occurs between chambers. Each chamber activates its spawn budget on first entry. Clear both chambers and all living enemies to unlock the physical stairs on the east side. Remaining coins collect before ascent. Health carries between floors; death restarts the current floor, while purchased guns and coins remain saved. The final stairway completes rooftop extraction. Existing enemy types remain; their visual redesign is future work. Partition walls block player shots, and pursuing enemies route toward the connecting passage.
