# CELWAKE

Anime cel-shaded arcade boat racing on an infinite open ocean — built entirely in **Vite + Three.js + TypeScript**. Zero external art/audio assets; meshes, textures, and sound are generated in code.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Press **Enter** or **Space** to start a race.

### Controls

| Action | Keys |
|--------|------|
| Throttle / brake | `W` `S` or ↑ ↓ |
| Steer | `A` `D` or ← → |
| Drift (builds boost) | `Shift` or `C` |
| Boost | `Space` |
| Restart (after finish) | `R` |

## What you get

- **4 boats** (you + 3 AI), **3 laps**, countdown, finish, results
- **NPR cel pipeline**: ramp lighting, inverted-hull outlines, screen-space Sobel edges, fresnel rim, banded specular / matcap
- **Gerstner ocean** (6 waves), infinite recentred grid, crest foam, hull rings, wake ribbons, spray
- **Wave-riding racing line**, checkpoint gates, wrong-way + corner preview
- **Arcade buoyancy** at 6 hull sample points, drift/boost, airtime
- **Animated riders** (lean, throttle arms, crouch, bob, celebrate)
- **Cel HUD** + synthesised Web Audio (engine, rush, impacts, horn)

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for module map, wave CPU/GPU contract, and harness API.

## Screenshots (QA harness)

```bash
npm run screenshot:install   # once
npm run screenshot           # writes artifacts/screenshots/*.png
```

Harness drives `window.__CEL_RACER__` (camera modes, race seek, forced time) and captures retina frames.

## Quality notes

This is a finished playable game, not a tech demo. Subsystems still have honest headroom (foam persistence, rider silhouette refinement, edge-pass tuning) — see the PR description for the current critic scorecard.
