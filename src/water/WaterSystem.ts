/**
 * Infinite cel-shaded ocean — projected/recentred grid + Gerstner displacement.
 * Banded color by height/depth, crest foam, quantized sparkle.
 */
import * as THREE from 'three';
import { gerstnerShaderChunk } from './gerstner';
import { Palette } from '../palette';
import { LightDir } from '../palette';

const waterVert = /* glsl */ `
${gerstnerShaderChunk()}

uniform float uTime;
uniform vec3 uCameraPos;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;
varying float vHeight;
varying float vFoam;

void main() {
  // Recentred infinite grid: vertex xz are local offsets; world follows camera
  vec3 base = vec3(position.x + uCameraPos.x, 0.0, position.z + uCameraPos.z);
  vec3 displaced;
  vec3 nrm;
  float crest;
  gerstnerDisplace(base, uTime, displaced, nrm, crest);
  vWorldPos = displaced;
  vNormal = nrm;
  vCrest = crest;
  vHeight = displaced.y;
  // procedural foam seed
  vFoam = crest;
  gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
}
`;

const waterFrag = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uCrest;
uniform vec3 uFoam;
uniform vec3 uSparkle;
uniform vec3 uLightDir;
uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;
varying float vHeight;
varying float vFoam;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(uLightDir);
  vec3 v = normalize(cameraPosition - vWorldPos);

  // Banded water by wave height — hard transitions
  float h = vHeight;
  vec3 col;
  if (h < -0.35) col = uDeep;
  else if (h < 0.25) col = uMid;
  else if (h < 0.95) col = uShallow;
  else col = uCrest;

  // Quantized diffuse (2–3 bands on water)
  float ndl = max(dot(n, l), 0.0);
  float shade = 0.65;
  if (ndl > 0.55) shade = 1.0;
  else if (ndl > 0.25) shade = 0.82;
  col *= shade;

  // Crest foam — hard white above threshold
  float crestFoam = step(0.62, vCrest);
  // Secondary chop foam
  crestFoam = max(crestFoam, step(0.85, vCrest) );
  col = mix(col, uFoam, crestFoam * 0.92);

  // Fresnel rim (banded)
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  fres = step(0.35, fres) * 0.4 + step(0.65, fres) * 0.35;
  col += uShallow * fres * 0.35;

  // Anime sparkle — quantized glitter, animated
  vec2 sp = floor(vWorldPos.xz * 1.8 + vec2(uTime * 2.5, uTime * -1.7));
  float spark = hash21(sp);
  float sparkMask = step(0.93, spark) * step(0.4, ndl) * (1.0 - crestFoam);
  // twinkle on/off
  float tw = step(0.5, fract(spark * 7.13 + uTime * 3.0));
  col += uSparkle * sparkMask * tw;

  // Depth-ish darkening far from camera (banded)
  float dist = length(cameraPosition.xz - vWorldPos.xz);
  float farBand = step(120.0, dist) * 0.12 + step(220.0, dist) * 0.15;
  col *= (1.0 - farBand);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class WaterSystem {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly gridSize: number;
  private readonly segments: number;

  constructor(gridSize = 420, segments = 180) {
    this.gridSize = gridSize;
    this.segments = segments;

    const geo = new THREE.PlaneGeometry(gridSize, gridSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uDeep: { value: new THREE.Color(Palette.waterDeep) },
        uMid: { value: new THREE.Color(Palette.waterMid) },
        uShallow: { value: new THREE.Color(Palette.waterShallow) },
        uCrest: { value: new THREE.Color(Palette.waterCrest) },
        uFoam: { value: new THREE.Color(Palette.foam) },
        uSparkle: { value: new THREE.Color(Palette.sparkle) },
        uLightDir: { value: new THREE.Vector3(LightDir.x, LightDir.y, LightDir.z).normalize() },
      },
      vertexShader: waterVert,
      fragmentShader: waterFrag,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Ocean';
  }

  update(t: number, camera: THREE.Camera): void {
    this.material.uniforms.uTime.value = t;
    // Snap recentre to reduce swimming vertices slightly
    const snap = this.gridSize / this.segments;
    const cx = Math.round(camera.position.x / snap) * snap;
    const cz = Math.round(camera.position.z / snap) * snap;
    this.material.uniforms.uCameraPos.value.set(cx, 0, cz);
  }

  /** LOD: rebuild density if needed (called by perf system) */
  setSegmentHint(highPerf: boolean): void {
    // Geometry swap would go here; for now flag is reserved.
    void highPerf;
  }
}
