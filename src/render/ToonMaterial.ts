/**
 * The cel-shading material used by every solid object in the game.
 *
 *  - Quantized diffuse driven by a generated 4-band ramp texture sampled
 *    with NearestFilter (no interpolation) — thresholds tuned by eye.
 *  - Cool ink-tinted shadow bands (anime shadows are never just "darker").
 *  - Hard-edged banded specular (two stepped levels, no smooth falloff).
 *  - Stepped fresnel rim light so silhouettes pop against the water.
 *  - Optional matcap-style fake reflection ramp for glossy hulls/glass,
 *    generated in code — never a real environment probe.
 *  - Distance fog toward the sky horizon color (matches the ocean).
 */

import * as THREE from "three";
import { Palette } from "../core/Palette";

let rampTex: THREE.DataTexture | null = null;

/**
 * 8x1 ramp — values are diffuse multipliers per lighting band.
 * Layout (dark -> lit): core shadow, shadow, mid, lit.
 * Thresholds fall where the texel boundaries land when sampling N·L.
 */
function getRampTexture(): THREE.DataTexture {
  if (rampTex) return rampTex;
  // texels:      |0    |1    |2    |3    |4    |5    |6    |7
  // N·L range:   0.0 ......... 0.25 ........ 0.5 .......... 1.0
  const levels = [0.46, 0.46, 0.7, 0.7, 0.7, 1.0, 1.0, 1.0];
  const data = new Uint8Array(levels.length * 4);
  levels.forEach((v, i) => {
    const b = Math.round(v * 255);
    data[i * 4] = b;
    data[i * 4 + 1] = b;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  });
  rampTex = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  rampTex.magFilter = THREE.NearestFilter;
  rampTex.minFilter = THREE.NearestFilter;
  rampTex.needsUpdate = true;
  return rampTex;
}

let matcapTex: THREE.CanvasTexture | null = null;

/** Banded fake-reflection matcap: hard sky/horizon/ground arcs. */
function getMatcapTexture(): THREE.CanvasTexture {
  if (matcapTex) return matcapTex;
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d")!;
  const grad = [
    { stop: 0.0, c: "#dff4ff" }, // sky reflection band
    { stop: 0.42, c: "#dff4ff" },
    { stop: 0.421, c: "#7db8e8" },
    { stop: 0.55, c: "#7db8e8" },
    { stop: 0.551, c: "#274a8a" }, // water reflection band
    { stop: 1.0, c: "#173060" },
  ];
  const g = ctx.createLinearGradient(0, 0, 0, S);
  for (const s of grad) g.addColorStop(s.stop, s.c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // hard glint dot upper-left
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(S * 0.32, S * 0.24, S * 0.10, S * 0.055, -0.5, 0, Math.PI * 2);
  ctx.fill();
  matcapTex = new THREE.CanvasTexture(cv);
  matcapTex.colorSpace = THREE.SRGBColorSpace;
  matcapTex.minFilter = THREE.NearestFilter;
  matcapTex.magFilter = THREE.NearestFilter;
  return matcapTex;
}

export interface ToonOptions {
  color: number;
  /** 0..1 amount of banded specular (default 0.5) */
  specular?: number;
  /** shininess exponent (default 60) */
  shininess?: number;
  /** 0..1 rim light strength (default 0.55) */
  rim?: number;
  /** 0..1 matcap fake-reflection amount (default 0) */
  matcap?: number;
  /** emissive glow amount 0..1 (for race line, gates) */
  emissive?: number;
  flatShaded?: boolean;
  transparent?: boolean;
  opacity?: number;
}

/** Shared sun direction for all toon materials (set once by Game). */
export const TOON_SUN = new THREE.Vector3(0.42, 0.4, 0.28).normalize();

const toonMaterials: THREE.ShaderMaterial[] = [];

export function makeToonMaterial(opts: ToonOptions): THREE.ShaderMaterial {
  const base = new THREE.Color(opts.color);
  // anime shadow: darker AND shifted cool toward indigo ink
  const shadow = base
    .clone()
    .multiplyScalar(0.42)
    .lerp(new THREE.Color(Palette.inkSoft), 0.42);

  const mat = new THREE.ShaderMaterial({
    name: "ToonCel",
    transparent: opts.transparent ?? false,
    uniforms: {
      uColor: { value: base },
      uShadow: { value: shadow },
      uRamp: { value: getRampTexture() },
      uMatcap: { value: getMatcapTexture() },
      uMatcapAmt: { value: opts.matcap ?? 0 },
      uSunDir: { value: TOON_SUN },
      uSpec: { value: opts.specular ?? 0.5 },
      uShiny: { value: opts.shininess ?? 60 },
      uRim: { value: opts.rim ?? 0.55 },
      uRimColor: { value: new THREE.Color(Palette.skyHorizon) },
      uEmissive: { value: opts.emissive ?? 0 },
      uHorizonColor: { value: new THREE.Color(Palette.skyHorizon) },
      uOpacity: { value: opts.opacity ?? 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNrm;
      varying vec3 vWorldPos;
      varying vec3 vViewNrm;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNrm = normalize(mat3(modelMatrix) * normal);
        vViewNrm = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uShadow;
      uniform sampler2D uRamp;
      uniform sampler2D uMatcap;
      uniform float uMatcapAmt;
      uniform vec3 uSunDir;
      uniform float uSpec;
      uniform float uShiny;
      uniform float uRim;
      uniform vec3 uRimColor;
      uniform float uEmissive;
      uniform vec3 uHorizonColor;
      uniform float uOpacity;
      varying vec3 vNrm;
      varying vec3 vWorldPos;
      varying vec3 vViewNrm;

      void main() {
        vec3 N = normalize(vNrm);
        ${opts.flatShaded ? "N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));" : ""}
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);

        // ---- quantized diffuse via NearestFilter ramp ----
        float ndl = dot(N, L) * 0.5 + 0.5;
        float band = texture2D(uRamp, vec2(ndl, 0.5)).r;
        vec3 col = mix(uShadow, uColor, band);

        // ---- banded specular: two hard steps ----
        vec3 H = normalize(L + V);
        float s = pow(max(dot(N, H), 0.0), uShiny);
        float specBand = step(0.55, s) + step(0.18, s) * 0.35;
        col += vec3(1.0, 0.98, 0.9) * specBand * uSpec * 0.5;

        // ---- matcap fake reflection, quantized ----
        if (uMatcapAmt > 0.001) {
          vec3 vn = normalize(vViewNrm);
          vec2 muv = vn.xy * 0.483 + 0.5;
          vec3 mc = texture2D(uMatcap, muv).rgb;
          col = mix(col, mc, uMatcapAmt);
        }

        // ---- stepped fresnel rim ----
        float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);
        float rim = step(0.62, fres) * uRim;
        // rim is strongest opposite the sun so it reads as bounce light
        rim *= 0.55 + 0.45 * (1.0 - max(dot(N, L), 0.0));
        col = mix(col, uRimColor, rim * 0.75);

        // ---- emissive (race line, gate glow) ----
        col = mix(col, uColor * 1.35, uEmissive);

        // ---- stylized distance fog (matches ocean) ----
        float dist = length(cameraPosition - vWorldPos);
        float f = 1.0 - exp(-dist * 0.00115);
        col = mix(col, uHorizonColor, clamp(f * f, 0.0, 1.0));

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
  toonMaterials.push(mat);
  return mat;
}

/** Update the sun direction for every toon material at once. */
export function setToonSun(dir: THREE.Vector3): void {
  TOON_SUN.copy(dir);
}
