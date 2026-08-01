/**
 * Shared Gerstner wave field — CPU evaluation MUST match the water vertex shader.
 * 6 waves: 2 low-frequency swell + 4 higher-frequency chop.
 */
import * as THREE from 'three';

export interface WaveParam {
  dirX: number;
  dirZ: number;
  amplitude: number;
  wavelength: number;
  speed: number;
  steepness: number;
}

export const WAVE_PARAMS: WaveParam[] = [
  // Long swell — airtime section rides these
  { dirX: 0.92, dirZ: 0.38, amplitude: 1.55, wavelength: 48, speed: 1.35, steepness: 0.55 },
  { dirX: -0.35, dirZ: 0.94, amplitude: 1.1, wavelength: 36, speed: 1.15, steepness: 0.5 },
  // Mid chop
  { dirX: 0.7, dirZ: -0.7, amplitude: 0.45, wavelength: 16, speed: 1.8, steepness: 0.7 },
  { dirX: -0.85, dirZ: -0.52, amplitude: 0.35, wavelength: 11, speed: 2.1, steepness: 0.75 },
  // Fine chop
  { dirX: 0.2, dirZ: 0.98, amplitude: 0.18, wavelength: 6.5, speed: 2.6, steepness: 0.8 },
  { dirX: 0.95, dirZ: -0.3, amplitude: 0.12, wavelength: 4.2, speed: 3.0, steepness: 0.85 },
];

export interface WaveSample {
  height: number;
  dispX: number;
  dispZ: number;
  normal: THREE.Vector3;
  /** Approximate crest factor 0..1 for foam */
  crest: number;
}

const _n = new THREE.Vector3();

export function sampleGerstner(x: number, z: number, t: number, out?: WaveSample): WaveSample {
  const result = out ?? {
    height: 0,
    dispX: 0,
    dispZ: 0,
    normal: new THREE.Vector3(0, 1, 0),
    crest: 0,
  };

  let hx = 0;
  let hy = 0;
  let hz = 0;
  let dYdX = 0;
  let dYdZ = 0;
  let crest = 0;

  for (let i = 0; i < WAVE_PARAMS.length; i++) {
    const w = WAVE_PARAMS[i];
    const len = Math.hypot(w.dirX, w.dirZ) || 1;
    const dx = w.dirX / len;
    const dz = w.dirZ / len;
    const k = (Math.PI * 2) / w.wavelength;
    const a = w.amplitude;
    const steep = THREE.MathUtils.clamp(w.steepness, 0, 1);
    const phase = k * (dx * x + dz * z) - w.speed * t;
    const s = Math.sin(phase);
    const c = Math.cos(phase);

    // Gerstner: horizontal displacement + vertical
    hx += steep * a * dx * c;
    hz += steep * a * dz * c;
    hy += a * s;

    dYdX += dx * k * a * c;
    dYdZ += dz * k * a * c;

    // Crest sharpening proxy
    crest += Math.max(0, s) * (a / 1.55) * (i < 2 ? 0.55 : 0.2);
  }

  result.dispX = hx;
  result.dispZ = hz;
  result.height = hy;
  _n.set(-dYdX, 1, -dYdZ).normalize();
  result.normal.copy(_n);
  result.crest = THREE.MathUtils.clamp(crest, 0, 1);
  return result;
}

/** GLSL source snippet mirroring WAVE_PARAMS — keep in sync. */
export function gerstnerShaderChunk(): string {
  return /* glsl */ `
struct Wave {
  vec2 dir;
  float amp;
  float wavelength;
  float speed;
  float steep;
};

const Wave WAVES[6] = Wave[6](
  Wave(vec2(0.92, 0.38), 1.55, 48.0, 1.35, 0.55),
  Wave(vec2(-0.35, 0.94), 1.10, 36.0, 1.15, 0.50),
  Wave(vec2(0.70, -0.70), 0.45, 16.0, 1.80, 0.70),
  Wave(vec2(-0.85, -0.52), 0.35, 11.0, 2.10, 0.75),
  Wave(vec2(0.20, 0.98), 0.18, 6.50, 2.60, 0.80),
  Wave(vec2(0.95, -0.30), 0.12, 4.20, 3.00, 0.85)
);

void gerstnerDisplace(vec3 pos, float t, out vec3 displaced, out vec3 normal, out float crest) {
  vec3 d = vec3(0.0);
  float dYdX = 0.0;
  float dYdZ = 0.0;
  crest = 0.0;
  for (int i = 0; i < 6; i++) {
    Wave w = WAVES[i];
    vec2 dir = normalize(w.dir);
    float k = 6.28318530718 / w.wavelength;
    float phase = k * dot(dir, pos.xz) - w.speed * t;
    float s = sin(phase);
    float c = cos(phase);
    float a = w.amp;
    float steep = clamp(w.steep, 0.0, 1.0);
    d.x += steep * a * dir.x * c;
    d.z += steep * a * dir.y * c;
    d.y += a * s;
    dYdX += dir.x * k * a * c;
    dYdZ += dir.y * k * a * c;
    float crestW = i < 2 ? 0.55 : 0.2;
    crest += max(0.0, s) * (a / 1.55) * crestW;
  }
  displaced = pos + d;
  normal = normalize(vec3(-dYdX, 1.0, -dYdZ));
  crest = clamp(crest, 0.0, 1.0);
}
`;
}
