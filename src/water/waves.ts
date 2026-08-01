/**
 * Gerstner wave field — THE single source of truth for ocean motion.
 *
 * The same wave constants are:
 *   1. baked into the ocean vertex shader (see glslWaveChunk below), and
 *   2. evaluated on the CPU for boat buoyancy (sampleOcean / getWaterHeight).
 *
 * If you change a wave here, water rendering and boat physics stay in sync
 * automatically. Never define wave math anywhere else.
 */

import { Vector3 } from "three";

export interface GerstnerWave {
  dirX: number; // normalized direction (x)
  dirZ: number; // normalized direction (z)
  amplitude: number; // metres
  wavelength: number; // metres
  steepness: number; // 0..1 crest sharpening (Q factor share)
  speedMul: number; // multiplier on the dispersion phase speed
}

const G = 9.81;

function wave(
  angleDeg: number,
  amplitude: number,
  wavelength: number,
  steepness: number,
  speedMul = 1
): GerstnerWave {
  const a = (angleDeg * Math.PI) / 180;
  return {
    dirX: Math.cos(a),
    dirZ: Math.sin(a),
    amplitude,
    wavelength,
    steepness,
    speedMul,
  };
}

/**
 * Tuned by eye: one long swell that gives the racecourse its rhythm,
 * a secondary swell at an angle, then progressively finer chop.
 * Total amplitude ~2m so boats genuinely climb and slam.
 */
export const WAVES: GerstnerWave[] = [
  wave(12, 0.98, 62.0, 0.55, 1.0), // primary swell
  wave(-38, 0.52, 34.0, 0.5, 1.05), // secondary swell
  wave(43, 0.22, 15.0, 0.45, 1.1), // large chop
  wave(-71, 0.14, 8.5, 0.4, 1.15), // mid chop
  wave(24, 0.07, 4.7, 0.35, 1.2), // fine chop
  wave(-9, 0.045, 2.9, 0.3, 1.25), // ripple
];

/** Phase speed from deep-water dispersion: c = sqrt(g * L / 2pi). */
function phaseSpeed(w: GerstnerWave): number {
  return Math.sqrt((G * w.wavelength) / (2 * Math.PI)) * w.speedMul;
}

/** Total possible crest height (used for color banding + camera safety). */
export const MAX_WAVE_HEIGHT = WAVES.reduce((s, w) => s + w.amplitude, 0);

// -----------------------------------------------------------------------
// CPU evaluation (buoyancy, AI, camera, race-line ribbon)
// -----------------------------------------------------------------------

/**
 * Gerstner displacement of the material point that starts at (x0, z0).
 * Returns displaced position (x, y, z).
 */
export function gerstnerDisplace(
  x0: number,
  z0: number,
  t: number,
  out: Vector3
): Vector3 {
  let dx = 0,
    dy = 0,
    dz = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const k = (2 * Math.PI) / w.wavelength;
    const c = phaseSpeed(w);
    const q = w.steepness / (k * w.amplitude * WAVES.length);
    const phase = k * (w.dirX * x0 + w.dirZ * z0) - k * c * t;
    const cosP = Math.cos(phase);
    const sinP = Math.sin(phase);
    dx += q * w.amplitude * w.dirX * cosP;
    dz += q * w.amplitude * w.dirZ * cosP;
    dy += w.amplitude * sinP;
  }
  out.set(x0 + dx, dy, z0 + dz);
  return out;
}

const _tmp = new Vector3();

/**
 * True water surface height at world position (x, z).
 * Gerstner displaces points horizontally, so we invert that displacement
 * with a few fixed-point iterations (3 is plenty for our steepness).
 */
export function getWaterHeight(x: number, z: number, t: number): number {
  let px = x,
    pz = z;
  for (let i = 0; i < 3; i++) {
    gerstnerDisplace(px, pz, t, _tmp);
    px += x - _tmp.x;
    pz += z - _tmp.z;
  }
  gerstnerDisplace(px, pz, t, _tmp);
  return _tmp.y;
}

const _hx0 = new Vector3();
const _hx1 = new Vector3();
const _hz0 = new Vector3();
const _hz1 = new Vector3();

/** Water surface normal at (x, z) via central differences. */
export function getWaterNormal(
  x: number,
  z: number,
  t: number,
  out: Vector3
): Vector3 {
  const e = 0.6;
  const hx0 = getWaterHeight(x - e, z, t);
  const hx1 = getWaterHeight(x + e, z, t);
  const hz0 = getWaterHeight(x, z - e, t);
  const hz1 = getWaterHeight(x, z + e, t);
  out.set(hx0 - hx1, 2 * e, hz0 - hz1).normalize();
  return out;
}

// -----------------------------------------------------------------------
// GPU: GLSL chunk with the identical wave constants baked in
// -----------------------------------------------------------------------

/**
 * Generates a GLSL chunk defining:
 *   vec3 gerstner(vec2 p, float t, out vec3 normal)
 * Returns displacement (xyz offsets) for a grid point at p, and the
 * analytic surface normal. Constants are baked so CPU & GPU match exactly.
 */
export function glslWaveChunk(): string {
  const lines: string[] = [];
  lines.push(`const int NUM_WAVES = ${WAVES.length};`);
  const dirs: string[] = [];
  const amps: string[] = [];
  const ks: string[] = [];
  const qs: string[] = [];
  const speeds: string[] = [];
  for (const w of WAVES) {
    const k = (2 * Math.PI) / w.wavelength;
    const c = phaseSpeed(w);
    const q = w.steepness / (k * w.amplitude * WAVES.length);
    dirs.push(`vec2(${w.dirX.toFixed(6)}, ${w.dirZ.toFixed(6)})`);
    amps.push(w.amplitude.toFixed(6));
    ks.push(k.toFixed(6));
    qs.push(q.toFixed(6));
    speeds.push((k * c).toFixed(6));
  }
  lines.push(`const vec2 WDIR[NUM_WAVES] = vec2[](${dirs.join(", ")});`);
  lines.push(`const float WAMP[NUM_WAVES] = float[](${amps.join(", ")});`);
  lines.push(`const float WK[NUM_WAVES] = float[](${ks.join(", ")});`);
  lines.push(`const float WQ[NUM_WAVES] = float[](${qs.join(", ")});`);
  lines.push(`const float WPHI[NUM_WAVES] = float[](${speeds.join(", ")});`);
  lines.push(/* glsl */ `
// Gerstner displacement + analytic normal. 'fade' scales amplitude
// (used to flatten the far field so the horizon disc can join seamlessly).
vec3 gerstner(vec2 p, float t, float fade, out vec3 nrm) {
  vec3 disp = vec3(0.0);
  // accumulate partial derivatives for the normal
  vec3 tangentX = vec3(1.0, 0.0, 0.0);
  vec3 tangentZ = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < NUM_WAVES; i++) {
    float amp = WAMP[i] * fade;
    float q = WQ[i];
    float k = WK[i];
    vec2 d = WDIR[i];
    float ph = k * dot(d, p) - WPHI[i] * t;
    float c = cos(ph);
    float s = sin(ph);
    disp.x += q * amp * d.x * c;
    disp.z += q * amp * d.y * c;
    disp.y += amp * s;
    float wa = k * amp;
    tangentX.x -= q * wa * d.x * d.x * s;
    tangentX.y += wa * d.x * c;
    tangentX.z -= q * wa * d.x * d.y * s;
    tangentZ.x -= q * wa * d.x * d.y * s;
    tangentZ.y += wa * d.y * c;
    tangentZ.z -= q * wa * d.y * d.y * s;
  }
  nrm = normalize(cross(tangentZ, tangentX));
  return disp;
}
`);
  return lines.join("\n");
}
