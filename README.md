# InkWake GP

A cel-shaded arcade boat racing game for the browser — anime ink work over
a living Gerstner ocean. Four boats, three laps, one glowing green racing
line. **Zero external assets**: every mesh is procedural geometry, every
texture is generated on a canvas or in a shader, and every sound is
synthesized live with the Web Audio API.

![stack](https://img.shields.io/badge/stack-Vite%20%2B%20Three.js%20%2B%20TypeScript-blue)

## Live

Deployed on Vercel from the `main` branch.

## Play

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`). You are dropped
straight into a race.

| Input | Action |
| --- | --- |
| `↑` / `W` | throttle |
| `↓` / `S` | brake / reverse |
| `←` `→` / `A` `D` | steer (tightens with speed) |
| `SPACE` / `SHIFT` | drift — charges the boost meter; release to fire it |
| `ENTER` | restart from the results screen |

Race craft: follow the green line, thread the gates (missing one costs
+3 s), drift the hairpin, and use the cross-swell section to launch off
crests — landings slam, so time your throttle.

## What's inside

### Art direction

Everything is NPR, tuned for a screen-printed anime look:

- **Ramp lighting** — every solid surface uses a custom `ShaderMaterial`
  with a 4-band ramp texture sampled with `NearestFilter`
  (`src/render/ToonMaterial.ts`). Shadows are cool ink-tinted, never just
  darker. Undersides snap to one uniform shadow band.
- **Two line systems** — inverted-hull ink outlines with screen-space
  constant width (`src/render/Outline.ts`), plus a Sobel edge post pass
  over a normal/depth prepass for interior creases
  (`src/render/PostPipeline.ts`).
- **Banded specular, stepped fresnel rims, matcap fake reflections** — no
  PBR, no environment probes, no smooth falloffs.
- **WYSIWYG color** — `THREE.ColorManagement` is disabled; the palette hex
  values in `src/core/Palette.ts` are exactly what reaches the screen.

### The water (`src/water/`)

- Sum of six Gerstner waves — one long swell, a second angled swell, and
  four chop/ripple layers — displaced in the vertex shader. The **same
  constants are evaluated on the CPU** (`waves.ts`) for buoyancy, so the
  boats ride exactly the water you see.
- Infinite ocean: a camera-following grid snapped to its own lattice, with
  amplitude fading into a flat horizon ring — no seams, no popping.
- Cel-banded color by wave height with hard steps; crest foam broken up by
  animated hash noise; quantized anime glitter; banded sun glints.
- A world-space **foam splat map**: wake ribbons, hull rings, drift arcs,
  slam bursts and idle ripples are stamped into a top-down render target
  that the ocean shader samples by world position — so all boat foam rides
  the waves. A second channel darkens the water under each hull.
- Hard-edged spray particles (one instanced draw call) for bow spray,
  rooster tails, drift sheets and landings.

### The game

- **Boats** (`src/boats/`) — lofted planing hulls, buoyancy sampled at five
  hull points, arcade handling with speed-tightening steering,
  drift-to-boost, wave-slope push, airtime and landing slams.
- **Riders** (`src/riders/Rider.ts`) — characters rigged and animated in
  code: two-bone IK keeps hands on the bars, they lean into turns, shift
  weight with throttle and brakes, crouch on landings, bob with the swell
  and fist-pump on the finish line.
- **Course** (`src/race/`) — a closed CatmullRom circuit: main straight,
  wide sweeper, chicane, hairpin, and a cross-swell airtime run. The
  racing line is a ribbon that rides the Gerstner field in its vertex
  shader. Floating gates and corner buoys bob on the real water.
- **AI** (`src/ai/AIController.ts`) — three personalities (clean, wild,
  aggressive) with lookahead steering, corner-speed judgement, collision
  avoidance, honest mistakes, and mild rubber-banding.
- **Race logic** — laps, gate checkpoints with miss penalties, wrong-way
  detection, live positions, split times, results and instant restart.
- **Camera** — spring-damped chase cam with velocity feed-forward, FOV
  kick, slam shake, and cinematic orbits for countdown/results that avoid
  the gate pylons.
- **HUD** (`src/ui/HUD.ts`) — hand-drawn on a 2D canvas: speedo arc, boost
  meter, lap/position cards, minimap with live racer dots, corner-preview
  chevrons, speed lines, countdown and results.
- **Audio** (`src/audio/AudioEngine.ts`) — synthesized engine (detuned
  saw/square through a lowpass, pitched by RPM), water rush, drift spray,
  slam thuds, gate chimes, boost whoosh and the start horn.

### Performance

Targets 60 fps at retina resolution: adaptive pixel-ratio stepping
(`src/core/Quality.ts`), merged boat meshes, instanced foam/spray, distance
culling for gates and buoys, and fixed-step (120 Hz) simulation decoupled
from rendering.

## Development

```bash
npm run dev        # dev server
npm run typecheck  # strict TS
npm run build      # production build
npm run shots      # screenshot harness (requires dev server running)
node tools/fullrace.mjs  # headless full-race soak test (autopilot)
```

The screenshot harness (`tools/screenshot.mjs`) drives the game
deterministically through `window.__HARNESS__` (enabled with `?harness=1`)
and captures retina frames from scripted moments — every visual claim in
this project was verified against those captures.
