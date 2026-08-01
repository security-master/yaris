/**
 * NPR cel material — quantized ramp diffuse, fresnel rim, banded specular, matcap fake reflection.
 * NearestFilter ramp; 4 hard bands. No PBR.
 */
import * as THREE from 'three';
import { LightDir, Palette } from '../palette';

let rampTex: THREE.CanvasTexture | null = null;
let matcapTex: THREE.CanvasTexture | null = null;

function makeRampTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 1;
  const ctx = c.getContext('2d')!;
  // Cool shadow -> clean cream highlight. These are light multipliers, not albedo.
  const bands = ['#3a4368', '#7482a0', '#e4d38f', '#fff2bf'];
  bands.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i, 0, 1, 1);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeMatcap(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size * 0.35, size * 0.3, size * 0.05, size * 0.5, size * 0.5, size * 0.55);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, '#ffd090');
  g.addColorStop(0.55, '#806050');
  g.addColorStop(0.8, '#302028');
  g.addColorStop(1, '#100810');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Hard specular disc
  ctx.beginPath();
  ctx.arc(size * 0.32, size * 0.28, size * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#fff8e0';
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export function getCelRamp(): THREE.CanvasTexture {
  if (!rampTex) rampTex = makeRampTexture();
  return rampTex;
}

export function getMatcap(): THREE.CanvasTexture {
  if (!matcapTex) matcapTex = makeMatcap();
  return matcapTex;
}

const celVert = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vViewNormal;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const celFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccent;
uniform sampler2D uRamp;
uniform sampler2D uMatcap;
uniform vec3 uLightDir;
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uMatcapMix;
uniform float uBandBias;
uniform float uShadeMul;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vViewNormal;
varying vec2 vUv;

float hardSpec(vec3 n, vec3 l, vec3 v, float threshold) {
  vec3 h = normalize(l + v);
  float ndh = max(dot(n, h), 0.0);
  return step(threshold, ndh);
}

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 l = normalize(uLightDir);
  vec3 v = normalize(cameraPosition - vWorldPos);

  float ndl = dot(n, l) * 0.5 + 0.5;
  // Quantize into ramp — the lift keeps low bandBias callsites saturated instead of muddy.
  float rampU = clamp(ndl * uBandBias + 0.08 + max(1.0 - uBandBias, 0.0) * 0.22, 0.001, 0.999);
  vec3 ramp = texture2D(uRamp, vec2(rampU, 0.5)).rgb;

  // Fake environment via matcap (view-space normal)
  vec3 vn = normalize(vViewNormal);
  vec2 muv = vn.xy * 0.5 + 0.5;
  vec3 matc = texture2D(uMatcap, muv).rgb;

  float shade = dot(ramp, vec3(0.299, 0.587, 0.114));
  vec3 celBase = uColor * (0.34 + shade * 0.92);
  vec3 tint = mix(vec3(shade), ramp, 0.38);
  vec3 base = celBase * tint * uShadeMul;
  base = mix(base, base * matc * 1.35, uMatcapMix);

  // Banded specular — hard edge, anime glitter shape
  float spec = hardSpec(n, l, v, 0.92) * 0.85 + hardSpec(n, l, v, 0.97) * 0.5;
  base += vec3(1.0, 0.95, 0.8) * spec * 0.55;

  // Fresnel rim — silhouettes pop on water
  float fres = pow(1.0 - max(dot(n, v), 0.0), uRimPower);
  // Quantize rim
  fres = step(0.45, fres) * 0.55 + step(0.7, fres) * 0.45;
  base += uRimColor * fres;

  // Accent stripe via UV (hulls paint accent on upper deck UVs)
  float accentMask = smoothstep(0.72, 0.78, vUv.y) * (1.0 - smoothstep(0.92, 0.98, vUv.y));
  base = mix(base, uAccent * (0.55 + ramp * 0.55), accentMask * 0.65);

  gl_FragColor = vec4(base, 1.0);
}
`;

export interface CelMaterialOptions {
  color: THREE.ColorRepresentation;
  accent?: THREE.ColorRepresentation;
  rimColor?: THREE.ColorRepresentation;
  rimPower?: number;
  matcapMix?: number;
  bandBias?: number;
  shadeMul?: number;
}

export function createCelMaterial(opts: CelMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(opts.color) },
      uAccent: { value: new THREE.Color(opts.accent ?? Palette.playerAccent) },
      uRamp: { value: getCelRamp() },
      uMatcap: { value: getMatcap() },
      uLightDir: { value: new THREE.Vector3(LightDir.x, LightDir.y, LightDir.z).normalize() },
      uRimColor: { value: new THREE.Color(opts.rimColor ?? 0xffe0a8) },
      uRimPower: { value: opts.rimPower ?? 2.8 },
      uMatcapMix: { value: opts.matcapMix ?? 0.22 },
      uBandBias: { value: opts.bandBias ?? 1.05 },
      uShadeMul: { value: opts.shadeMul ?? 1.12 },
    },
    vertexShader: celVert,
    fragmentShader: celFrag,
  });
}
