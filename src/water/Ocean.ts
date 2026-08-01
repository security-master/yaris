/**
 * Ocean renderer — camera-following Gerstner grid with cel-banded shading.
 *
 * Structure:
 *  - A dense square grid that snaps to a world-space lattice under the
 *    camera (no vertex swimming, no visible movement of the mesh itself).
 *  - Wave amplitude fades to zero between FADE_START..FADE_END metres so
 *    a flat horizon ring can join with no seam and no LOD pop.
 *  - Fragment shader bands color by displaced wave height (deep / mid /
 *    light / crest), adds hard-edged crest foam broken up with animated
 *    hash noise, quantized anime sparkles, banded sun specular, and a
 *    world-space foam splat map (boat wakes + hull rings ride the waves
 *    automatically because the map is sampled by world position).
 */

import * as THREE from "three";
import { glslWaveChunk } from "./waves";
import { Palette } from "../core/Palette";

const GRID_SIZE = 640; // metres covered by the displaced grid
const GRID_SEGS = 400; // segments per side
const CELL = GRID_SIZE / GRID_SEGS;
const FADE_START = 210.0;
const FADE_END = 300.0;
const HORIZON_RADIUS = 9000;

function c3(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

const COMMON_FRAG = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uLight;
  uniform vec3 uCrest;
  uniform vec3 uFoamColor;
  uniform vec3 uSparkle;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform vec3 uCamPos;

  // cheap hash / value noise for foam breakup & sparkles
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // stylized distance fog toward the sky horizon color
  vec3 applyFog(vec3 col, float dist) {
    float f = 1.0 - exp(-dist * 0.00115);
    f = f * f;
    return mix(col, uHorizonColor, clamp(f, 0.0, 1.0));
  }
`;

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly horizon: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly horizonMaterial: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    // ------------------------------------------------------------------
    // Main displaced grid
    // ------------------------------------------------------------------
    const geo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, GRID_SEGS, GRID_SEGS);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      name: "OceanCel",
      uniforms: {
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uGridOffset: { value: new THREE.Vector2() },
        uDeep: { value: c3(Palette.waterDeep) },
        uMid: { value: c3(Palette.waterMid) },
        uLight: { value: c3(Palette.waterLight) },
        uCrest: { value: c3(Palette.waterCrest) },
        uFoamColor: { value: c3(Palette.foam) },
        uSparkle: { value: c3(Palette.sparkle) },
        uHorizonColor: { value: c3(Palette.skyHorizon) },
        uSunDir: { value: new THREE.Vector3(0.35, 0.55, 0.2).normalize() },
        uSunColor: { value: c3(Palette.sunCore) },
        uFoamMap: { value: null as THREE.Texture | null },
        uFoamCenter: { value: new THREE.Vector2() },
        uFoamSize: { value: 1 },
      },
      vertexShader: /* glsl */ `
        ${glslWaveChunk()}
        uniform float uTime;
        uniform vec2 uGridOffset;
        varying vec3 vWorldPos;
        varying vec3 vNrm;
        varying float vHeight;
        varying float vFade;

        void main() {
          vec3 base = position;
          base.x += uGridOffset.x;
          base.z += uGridOffset.y;

          float r = length(base.xz - cameraPosition.xz);
          float fade = 1.0 - smoothstep(${FADE_START.toFixed(1)}, ${FADE_END.toFixed(1)}, r);
          vFade = fade;

          vec3 nrm;
          vec3 disp = gerstner(base.xz, uTime, fade, nrm);
          vec3 wp = base + disp;

          vWorldPos = wp;
          vNrm = nrm;
          vHeight = disp.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON_FRAG}
        uniform sampler2D uFoamMap;
        uniform vec2 uFoamCenter;
        uniform float uFoamSize;
        varying vec3 vWorldPos;
        varying vec3 vNrm;
        varying float vHeight;
        varying float vFade;

        void main() {
          vec3 N = normalize(vNrm);
          vec3 V = normalize(uCamPos - vWorldPos);
          float dist = length(uCamPos - vWorldPos);

          // --------------------------------------------------------------
          // 1. Height-banded base color, hard steps. A touch of animated
          //    noise on the thresholds keeps band borders alive & painterly.
          // --------------------------------------------------------------
          float bandNoise = (vnoise(vWorldPos.xz * 0.23 + uTime * 0.22) - 0.5) * 0.34;
          bandNoise += (vnoise(vWorldPos.xz * 0.06 - uTime * 0.05) - 0.5) * 0.22;
          float h = vHeight + bandNoise;
          vec3 col = uDeep;
          col = mix(col, uMid,   step(-0.62, h));
          col = mix(col, uLight, step(0.55, h));
          col = mix(col, uCrest, step(1.25, h));

          // Fresnel band: grazing angles flip to a lighter tone in one
          // hard step, so distant water reads bright like anime cels.
          float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);
          col = mix(col, uLight, step(0.72, fres) * 0.65);

          // --------------------------------------------------------------
          // 2. Crest foam: appears above a height threshold, broken up by
          //    two octaves of animated noise, HARD edge. Sells the style.
          // --------------------------------------------------------------
          float crestMask = smoothstep(1.05, 1.7, vHeight + bandNoise * 0.4);
          float foamNoise = vnoise(vWorldPos.xz * 0.9 + vec2(uTime * 0.7, -uTime * 0.4));
          foamNoise += 0.5 * vnoise(vWorldPos.xz * 2.3 - vec2(uTime * 0.9, uTime * 0.5));
          float crestFoam = step(1.05, crestMask * 1.4 + foamNoise * 0.75);

          // --------------------------------------------------------------
          // 3. World-space foam splat map (wakes, hull rings, landings).
          // --------------------------------------------------------------
          vec2 fUv = (vWorldPos.xz - uFoamCenter) / uFoamSize + 0.5;
          float splat = 0.0;
          if (fUv.x > 0.001 && fUv.x < 0.999 && fUv.y > 0.001 && fUv.y < 0.999) {
            float edge = smoothstep(0.0, 0.06, fUv.x) * smoothstep(1.0, 0.94, fUv.x)
                       * smoothstep(0.0, 0.06, fUv.y) * smoothstep(1.0, 0.94, fUv.y);
            splat = texture2D(uFoamMap, fUv).r * edge * 1.65;
          }
          // quantize splat foam into two hard levels: bright core + fringe
          float splatFoam = step(0.46, splat + foamNoise * 0.24);
          float splatFringe = step(0.18, splat + foamNoise * 0.16) * 0.5;

          float foam = max(crestFoam, splatFoam);
          col = mix(col, uFoamColor, max(foam, splatFringe));

          // --------------------------------------------------------------
          // 4. Banded specular: two hard-stepped highlight levels.
          // --------------------------------------------------------------
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 220.0);
          float specBand = step(0.5, spec) * 0.85 + step(0.12, spec) * 0.25;
          col += uSunColor * specBand * (1.0 - foam) * 0.5;

          // --------------------------------------------------------------
          // 5. Anime glitter: sparse cells flash as hard diamonds.
          // --------------------------------------------------------------
          vec2 cell = floor(vWorldPos.xz * 1.9);
          float rnd = hash21(cell);
          float tw = fract(rnd * 7.31 + uTime * (0.35 + rnd * 0.5));
          float sparkleOn = step(0.986, rnd) * step(0.68, tw) * step(tw, 0.9);
          vec2 cuv = fract(vWorldPos.xz * 1.9) - 0.5;
          float diamond = step(abs(cuv.x) + abs(cuv.y), 0.17);
          float upFace = smoothstep(0.86, 0.94, N.y);
          // glitter is a near/mid-field garnish; kill it in the distance
          float distFade = 1.0 - smoothstep(45.0, 85.0, dist);
          float glit = sparkleOn * diamond * upFace * step(-0.2, vHeight) * distFade;
          col = mix(col, uSparkle, glit * (1.0 - foam) * (1.0 - splatFringe) * 0.85);

          col = applyFog(col, dist);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; // follows the camera; always visible
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);

    // ------------------------------------------------------------------
    // Flat horizon ring: from just inside the fade edge out to the horizon.
    // Same banding/fog math with zero displacement => invisible seam.
    // ------------------------------------------------------------------
    const ringGeo = new THREE.RingGeometry(FADE_END - 24, HORIZON_RADIUS, 96, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.horizonMaterial = new THREE.ShaderMaterial({
      name: "OceanHorizon",
      uniforms: this.material.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec3 wp = position;
          wp.x += cameraPosition.x;
          wp.z += cameraPosition.z;
          vWorldPos = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON_FRAG}
        varying vec3 vWorldPos;
        void main() {
          float dist = length(uCamPos - vWorldPos);
          // flat far field sits at height 0 => mid band, faint noise bands
          float bandNoise = (vnoise(vWorldPos.xz * 0.02 + uTime * 0.03) - 0.5) * 0.9;
          vec3 col = mix(uDeep, uMid, step(-0.15, bandNoise));
          vec3 V = normalize(uCamPos - vWorldPos);
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(H.y, 0.0), 900.0);
          col += uSunColor * step(0.35, spec) * 0.35;
          col = applyFog(col, dist);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.horizon = new THREE.Mesh(ringGeo, this.horizonMaterial);
    this.horizon.frustumCulled = false;
    this.horizon.matrixAutoUpdate = false;
    this.horizon.renderOrder = -1;
    scene.add(this.horizon);
  }

  setFoamMap(tex: THREE.Texture, center: THREE.Vector2, size: number): void {
    this.material.uniforms.uFoamMap.value = tex;
    this.material.uniforms.uFoamCenter.value = center;
    this.material.uniforms.uFoamSize.value = size;
  }

  get sunDir(): THREE.Vector3 {
    return this.material.uniforms.uSunDir.value as THREE.Vector3;
  }

  update(time: number, camera: THREE.Camera): void {
    this.material.uniforms.uTime.value = time;
    const cp = camera.position;
    (this.material.uniforms.uCamPos.value as THREE.Vector3).copy(cp);
    // Snap the grid to the lattice so vertices never swim.
    const gx = Math.round(cp.x / CELL) * CELL;
    const gz = Math.round(cp.z / CELL) * CELL;
    (this.material.uniforms.uGridOffset.value as THREE.Vector2).set(gx, gz);
  }
}
