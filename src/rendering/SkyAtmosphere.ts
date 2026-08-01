/**
 * Gradient sky dome, stylized cel clouds (flat hard-rim shapes), graphic sun flare.
 */
import * as THREE from 'three';
import { Palette } from '../palette';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  // Dome is parented at the camera in JS — do NOT also add cameraPosition here.
  vDir = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_Position.z = gl_Position.w; // push to far plane
}
`;

const skyFrag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uCloudRim;
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vDir;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash22(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(269.5, 183.3)), dot(p, vec2(113.5, 271.9)))) * 43758.5453);
}

float ellipse(vec2 p, vec2 radius) {
  vec2 q = p / radius;
  return 1.0 - dot(q, q);
}

float cloudBlob(vec2 p) {
  vec2 cell = floor(p);
  float field = -1.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = cell + vec2(float(x), float(y));
      float seed = hash12(id);
      float active = 1.0;
      vec2 center = id + vec2(0.5) + (hash22(id) - 0.5) * vec2(0.55, 0.35);
      vec2 q = p - center;
      float s = mix(0.9, 1.45, hash12(id + 17.0));

      float blob = ellipse(q, vec2(0.66, 0.3) * s);
      blob = max(blob, ellipse(q - vec2(-0.34, 0.02) * s, vec2(0.38, 0.25) * s));
      blob = max(blob, ellipse(q - vec2(0.3, 0.04) * s, vec2(0.46, 0.28) * s));
      blob = max(blob, ellipse(q - vec2(0.0, 0.2) * s, vec2(0.4, 0.3) * s));
      field = max(field, mix(-1.0, blob, active));
    }
  }

  return field;
}

float wrappedAzimuthDelta(float a, float b) {
  return abs(fract(a - b + 0.5) - 0.5);
}

float horizonClouds(vec3 dir) {
  float az = atan(dir.z, dir.x) / 6.2831853;
  float field = -1.0;

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float center = fract(fi * 0.173 + hash12(vec2(fi, 4.0)) * 0.18);
    float y = mix(-0.24, 0.18, hash12(vec2(fi, 9.0)));
    float width = mix(0.42, 0.72, hash12(vec2(fi, 13.0)));
    float height = mix(0.13, 0.24, hash12(vec2(fi, 21.0)));
    vec2 q = vec2(wrappedAzimuthDelta(az, center), dir.y - y);
    float main = ellipse(q, vec2(width, height));
    main = max(main, ellipse(q - vec2(-width * 0.24, height * 0.18), vec2(width * 0.42, height * 0.9)));
    main = max(main, ellipse(q - vec2(width * 0.28, height * 0.1), vec2(width * 0.48, height * 0.82)));
    field = max(field, main);
  }

  return field;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y * 0.5 + 0.5;
  // Banded sky — 3 hard bands
  float band = h;
  vec3 col;
  if (band > 0.72) col = uZenith;
  else if (band > 0.42) col = mix(uHorizon, uZenith, 0.55);
  else col = mix(uGlow, uHorizon, clamp((band - 0.15) / 0.27, 0.0, 1.0));

  vec3 sd = normalize(uSunDir);
  float sun = max(dot(dir, sd), 0.0);
  vec3 sunRight = normalize(cross(vec3(0.0, 1.0, 0.0), sd));
  vec3 sunUp = normalize(cross(sd, sunRight));
  vec2 suv = vec2(dot(dir, sunRight), dot(dir, sunUp));
  float sr = length(suv);
  float disc = step(sr, 0.038);
  float ring = step(sr, 0.074) - step(sr, 0.048);
  float diamond = step(abs(suv.x) + abs(suv.y), 0.115) * (1.0 - step(sr, 0.043));
  float crossFlare = (1.0 - smoothstep(0.0, 0.013, abs(suv.x))) * (1.0 - smoothstep(0.03, 0.32, abs(suv.y)));
  crossFlare += (1.0 - smoothstep(0.0, 0.013, abs(suv.y))) * (1.0 - smoothstep(0.03, 0.26, abs(suv.x)));
  float halo = (1.0 - smoothstep(0.04, 0.32, sr)) * 0.34;
  col += vec3(1.0, 0.9, 0.43) * (disc * 1.6 + ring * 0.85 + diamond * 0.32 + crossFlare * 0.78 + halo * step(0.82, sun));

  // Cel clouds — denser horizon banks + mid-sky blobs with hard rims
  vec2 cp = dir.xz / max(abs(dir.y), 0.12);
  cp = cp * vec2(0.55, 0.4) + vec2(uTime * 0.02, 0.2);
  float blob = max(max(cloudBlob(cp), cloudBlob(cp * 0.45 + vec2(2.4, -1.1))), horizonClouds(dir));
  float aa = 0.02;
  float fill = step(0.0, blob);
  float rim = step(-0.12, blob) * (1.0 - fill);
  float underside = step(0.35, hash12(floor(cp * 3.0)));
  float cloudFade = step(-0.05, dir.y) * (1.0 - step(0.92, dir.y));
  vec3 cloudCol = mix(uCloudLit, uCloudShade, underside * 0.45);
  cloudCol = mix(cloudCol, uCloudRim, rim);
  col = mix(col, cloudCol, (fill * 0.92 + rim * 0.85) * cloudFade);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class SkyAtmosphere {
  readonly group = new THREE.Group();
  private skyMat: THREE.ShaderMaterial;
  private sunDir = new THREE.Vector3(0.45, 0.72, 0.4).normalize();

  constructor() {
    this.group.userData.skipEdge = true;
    this.group.name = 'SkyAtmosphere';

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(Palette.skyZenith) },
        uHorizon: { value: new THREE.Color(Palette.skyHorizon) },
        uGlow: { value: new THREE.Color(Palette.skyGlow) },
        uCloudLit: { value: new THREE.Color(Palette.cloudLit) },
        uCloudShade: { value: new THREE.Color(Palette.cloudShade) },
        uCloudRim: { value: new THREE.Color(Palette.cloudRim) },
        uSunDir: { value: this.sunDir.clone() },
        uTime: { value: 0 },
      },
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), this.skyMat);
    dome.frustumCulled = false;
    dome.renderOrder = -10000;
    dome.userData.skipEdge = true;
    this.group.add(dome);

    // Hard graphic sun billboard disc for extra pop
    const sunMat = new THREE.ShaderMaterial({
      uniforms: {
        uCore: { value: new THREE.Color(Palette.sunCore) },
        uRim: { value: new THREE.Color(Palette.sunRim) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uCore;
        uniform vec3 uRim;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          float disc = step(r, 0.28);
          float ring = step(r, 0.48) - step(r, 0.34);
          float diamond = step(abs(vUv.x) + abs(vUv.y), 0.82) * (1.0 - step(r, 0.32));
          float rays = (1.0 - smoothstep(0.0, 0.035, abs(vUv.x))) * (1.0 - smoothstep(0.18, 1.0, abs(vUv.y)));
          rays += (1.0 - smoothstep(0.0, 0.035, abs(vUv.y))) * (1.0 - smoothstep(0.18, 1.0, abs(vUv.x)));
          float alpha = max(max(disc, ring * 0.86), max(diamond * 0.42, rays * 0.62));
          vec3 color = mix(uRim, uCore, disc);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), sunMat);
    sun.position.copy(this.sunDir).multiplyScalar(420);
    sun.lookAt(0, 0, 0);
    sun.userData.skipEdge = true;
    this.group.add(sun);
  }

  update(t: number, camera: THREE.Camera): void {
    this.skyMat.uniforms.uTime.value = t;
    this.group.position.copy(camera.position);
  }
}
