# CELWAKE — Shared Architecture

## Art Direction
**Palette: Tropical Ink** — deep teal ocean, cyan crests, coral player hull, amber/blue/jade AI, warm yellow sun, ink outlines. NPR only: ramp lighting, banded specular, inverted-hull + screen-space edges. Zero PBR.

## Module Map

```
src/
  main.ts                 Entry + harness API
  palette.ts              Committed color system
  core/
    Game.ts               Orchestrator / state machine
    Time.ts               Fixed + variable dt
    Input.ts              Keyboard / gamepad
  water/
    gerstner.ts           Shared CPU wave eval (must match shader)
    WaterSystem.ts        Infinite projected grid + material
    FoamWake.ts           Crest foam, hull rings, wake ribbons, spray
  rendering/
    CelMaterial.ts        Ramp/step diffuse + fresnel + banded spec
    Outline.ts            Inverted-hull screen-space constant width
    PostPipeline.ts       MRT normal/depth + Sobel interior lines
    SkyAtmosphere.ts      Gradient dome, cel clouds, sun flare
    RendererHost.ts       Adaptive DPR, instancing helpers
  boats/
    BoatMesh.ts           Procedural hull geometry
    BoatPhysics.ts        5–6 point Gerstner buoyancy + arcade drive
    Boat.ts               Entity glue
  riders/
    Rider.ts              Procedural skinned-ish hierarchy
    RiderAnim.ts          Lean, throttle arms, crouch, bob, celebrate
  course/
    TrackSpline.ts        Interesting closed CatmullRom circuit
    RacingLine.ts         Wave-riding ribbon
    Gates.ts              Checkpoint gates + wrong-way
  ai/
    AIRacer.ts            Lookahead, personality, rubber-band, mistakes
  race/
    RaceManager.ts        Countdown, 3 laps, results, placements
  camera/
    ChaseCam.ts           Spring chase, FOV kick, slam shake, cinematic
  hud/
    HUD.ts                Cel-styled canvas HUD + minimap
  audio/
    SynthAudio.ts         Engine, rush, impacts, horn (Web Audio)
  perf/
    PerfBudget.ts         LOD, pixel ratio, frustum helpers
```

## Contracts

### Wave uniforms (GPU ↔ CPU)
`gerstner.ts` exports `WAVE_PARAMS` and `sampleGerstner(x, z, t) → { height, normal, disp }`.
Water vertex shader duplicates the same 6 waves. Changing one without the other is a bug.

### Cel material uniforms
- `uRamp` — 1D 4-band NearestFilter texture
- `uLightDir`, `uRimColor`, `uRimPower`
- `uSpecBands`, `uMatcapTint`
- `uOutlineWidth` — used by hull outline materials (screen-space scale)

### Boat entity
```ts
interface BoatEntity {
  id: number;
  isPlayer: boolean;
  mesh: THREE.Group;
  physics: BoatPhysics;
  rider: Rider;
  color: THREE.Color;
}
```

### Race state
`idle → countdown → racing → finished`

### Harness API (`window.__CEL_RACER__`)
```ts
{
  ready: boolean;
  setTime(t: number): void;
  setCamera(mode: 'chase'|'orbit'|'aerial'|'bow'): void;
  seekRace(phase: 'countdown'|'midlap'|'finish'): void;
  getPerf(): { fps: number; drawCalls: number };
  captureInfo(): object;
}
```

## Performance Targets (M5 Pro / Chrome retina)
- 60 fps locked, adaptive DPR 1.0–2.0
- Water grid LOD rings
- Instanced spray + foam cards
- Frustum cull gates/buoys
- Outline meshes share geometry; disable far outlines via LOD

## Milestone Order
1. Ocean + camera
2. Player boat feel
3. Cel + outlines everywhere
4. Course / laps
5. AI
6. Riders
7. HUD + audio
8. Perf + polish + critic loops
