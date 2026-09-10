# VERDANT — Design Document

Working title: **VERDANT**
Genre: top-down 3D auto-shooter, room-by-room escape
Platform: browser (desktop + mobile), landscape, Three.js
Reference: *Zombie Lab Escape* (Rusty Game Studio) — same loop, different everything else

---

## PART 1 — What the reference game actually is

Stripped of theme, Zombie Lab Escape is this:

| Layer | What it does |
|---|---|
| **Control** | WASD only. The gun fires **by itself**. |
| **Skill expressed** | Movement, spacing, kiting. NOT aiming. |
| **Threat model** | Enemies spawn from *all sides*. You lose by being **surrounded**, not by being out-damaged. |
| **Structure** | A locked complex, opened one room at a time. Clear → loot → unlock → deeper. |
| **Pacing** | Hard alternation: 30–60s of violence, then 10–20s of calm (loot + choose an upgrade). |
| **Growth** | 9 weapons, unlock + upgrade. Stacking upgrades chosen between rooms. |
| **Retention** | Meta currency ("parts") survives death and buys permanent unlocks. |
| **Punctuation** | Checkpoints, key items, boss mutants. |

### The three rules that make it work
1. **Auto-fire removes the aiming tax.** One thumb, one stick, playable on a phone. Every ounce of the player's attention goes to *where they stand*.
2. **The room is the unit.** Not the level, not the wave. A room is a self-contained arena with a locked door, and the door is the reward.
3. **Choice happens in the quiet.** Upgrades are picked between rooms, never during. The fight is pure reflex; the corridor is pure brain.

### What it does *not* do (our openings)
- Backtracking is pointless but still possible — the map is dead space behind you.
- Rooms are visually interchangeable boxes.
- No reason to ever *stop* shooting, so there's no resource tension.

---

## PART 2 — Our concept

> Deep-space research station **VERDANT**, one hundred years unanswered.
> An engineered crop got out of the greenhouse module and ate the station from the inside.
> You are the last thing aboard that still has a pulse.
> The plant is between you and the escape pod. It is also growing back behind you.

**You:** a crew member in a maintenance suit. Your suit's pruning laser fires automatically at whatever's closest.
**Them:** the growth. Not undead — *vegetal*. Nothing shambles; things whip, burst, root and bloom.
**The exit:** Pod Bay, nine modules away, on the far side of the Heartroot.

### The signature twist — **the station regrows**
When you leave a room, **it seals and re-floods with growth behind you.** A vine curtain drops over the door you came through.

This one rule does a lot of work:
- Retreating is impossible → forward is the only direction → no chance of a player stalling out.
- It justifies the locked-door structure *diegetically* instead of with a keycard excuse.
- It creates a genuine dread beat: you can *hear* the room behind you filling in.
- The map becomes a shrinking space, not an expanding one. Tension climbs by geometry alone.

### Art direction — **bright room, dark unknown**
The station is *lit*. Rooms are high-key and readable: a saturated teal floor, near-white walls,
clean untextured low-poly props with orange accent stripes. No fog, no flashlight, no squinting.

Contrast comes from **the room you are in versus everywhere you are not**. The active module is
bright; corridors and un-entered modules read near-black. You always know exactly where the play
space ends, and stepping into a new module is a visible flood of light.

This is a deliberate genre note: swarm games live or die on instant readability. A dark screen with
six things converging on you is noise. Bright floor + high-contrast silhouettes means the player
reads a surround in one glance, on a phone, in daylight.

**Palette**
| Role | Colour |
|---|---|
| Active room floor | saturated teal `#3f7f88` |
| Walls / structure | near-white `#c9dade`, top faces `#e3eef0` |
| Un-entered space | near-black `#12161c` |
| Props | white-grey with orange accents `#ff8c42` |
| Player | orange + dark suit |
| The growth (enemies) | magenta / violet `#d946ef` |
| Loot & currency | gold `#f5c518` |
| Hazard / danger | red `#e03535` |

---

## PART 3 — Systems

### Enemy roster (the growth)
| Enemy | Behavior | Teaches you |
|---|---|---|
| **Creeper** | Slow, walks straight at you, dies fast | Basic spacing |
| **Lasher** | Rooted in place, whips a long arc | Watch the floor, not just the crowd |
| **Sporeling** | Rushes, then **bursts** into a lingering gas cloud | Don't kill everything at point-blank |
| **Thornbeast** | Heavy, charges in a straight line | Sidestep, never backpedal |
| **Bloomer** | Stationary; continuously **spawns** Creepers | Priority targeting — kill the source |
| **Seeder** | Flees from you, plants new growth where it stops | You cannot just turtle |
| **HEARTROOT** | Boss. Center-of-room mass, armored nodes, phases | Everything above at once |

### Weapons (auto-firing, one equipped)
Pruning Laser (start) · Scattergun · Herbicide Sprayer (DoT cone) · Flamethrower · Thermal Lance (pierce) · Sonic Emitter (pushback) · Seed Bomb Launcher (AoE) · Frost Coil (slow) · **Solar Flare** (ultimate — instant clear, long cooldown)

### Upgrades — three cards after each room
Drawn from three pools so a run has a shape:
- **SUIT** — max HP, move speed, dodge-dash, armour plating, pickup radius
- **WEAPON** — damage, fire rate, projectile count, pierce, crit
- **GROWTH** *(risk/reward)* — big power for a real cost. e.g. *"+40% damage, −25% max HP."*

### Economy
- **Biomass** — dropped in-run, spent in-run on upgrades
- **Seed Vault** — meta currency, survives death, permanently unlocks weapons + starting perks

### Failure & progression
Death → back to Module 1, keep Seed Vault currency. Checkpoint every 3rd module. Run length target: **12–18 minutes**.

### ⚠ Optional — not approved, flagged for a decision
Removing the lamp removed the one thing the player *manages* during a fight. The reference game has
the same hole. One candidate that costs no extra button and reads well in bright art:

**Pollen bloom** — a pale haze thickens in the room the longer you stay. After ~45 s it starts
chipping HP, harder every 10 s. It never asks the player to press anything; it just makes camping
lose. Kills the stall-out problem and adds urgency for free.

*Not in the build order. Say the word and I'll add it, or we ship without it like the reference does.*

---

## PART 4 — Layout

Three layouts are drawn in `layout/layout.html` — open it in a browser:

1. **Screen layout** — the 16:9 HUD blockout, every element placed and justified
2. **Station map** — all 9 modules, the critical path, difficulty curve
3. **Room anatomy** — how a single arena is built (spawn arcs, cover, door, drops)

### Screen layout rules
- Camera: **fixed top-down, tilted ~55°**, follows player with soft lag. Never rotates — the player must be able to trust "up = up".
- The player sits at screen center. **Roughly 60% of the frame must be empty floor** at all times, or the player can't read threats.
- HUD lives at the **edges only**. The center third is sacred.
- Health rides **under the player** in world space, not in a corner — eyes never leave centre.
- Mobile: virtual stick bottom-left, thumb-shaped dead zone bottom-right kept clear of HUD.

### Project layout
```
verdant/
├── index.html            entry point
├── DESIGN.md             this file
├── layout/
│   └── layout.html       visual layout mockups
├── src/
│   ├── main.js           bootstrap
│   ├── core/             engine.js · input.js · state.js
│   ├── game/             player.js · enemies.js · weapons.js · rooms.js · upgrades.js
│   └── ui/               hud.js
└── assets/               models · textures · audio
```

---

## PART 5 — Build order

1. **Greybox movement** — a plane, a capsule, WASD, top-down camera. Feel the movement first.
2. **Auto-fire + one dumb enemy** — validate the core loop with zero art.
3. **One room, one door** — clear condition, door opens, regrow behind.
4. **Upgrade cards** — three choices between rooms.
5. **Enemy roster** — add one at a time, each must teach something new.
6. **Lighting pass** — bright active room, black unknown, light floods in on door open.
7. **The nine modules** — real geometry, real pacing curve.
8. **Heartroot boss.**
9. **Art pass, audio, juice** — screen shake, hit flash, particles.
10. **Meta progression + save.**

Rule for step 1: *if the movement isn't fun with no enemies on screen, nothing later will save it.*
