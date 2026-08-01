/**
 * Gradient sky dome, stylized cel clouds (flat hard-rim shapes), graphic sun flare.
 */
import * as THREE from 'three';
import { Palette } from '../palette';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_Position.z = gl_Position.w; // push to far plane
}
`;

const skyFrag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vDir;

// Cheap hash for cloud blobs
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float cloudField(vec2 p) {
  // Flat cel cloud shapes — hard edges via step
  float n = 0.0;
  n += step(0.62, hash(floor(p * 2.0)));
  n += step(0.7, hash(floor(p * 3.5 + 10.0))) * 0.6;
  n += step(0.75, hash(floor(p * 5.0 - 4.0))) * 0.35;
  return clamp(n, 0.0, 1.0);
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

  // Sun disc + graphic flare (not photographic bloom)
  float sun = max(dot(dir, normalize(uSunDir)), 0.0);
  float disc = step(0.9985, sun);
  float halo = step(0.992, sun) * 0.55 + step(0.97, sun) * 0.25;
  // Cross flare
  vec3 sd = normalize(uSunDir);
  float cross = 0.0;
  cross += smoothstep(0.02, 0.0, abs(dir.x - sd.x)) * step(0.85, sun) * 0.35;
  cross += smoothstep(0.02, 0.0, abs(dir.y - sd.y)) * step(0.85, sun) * 0.25;
  col += vec3(1.0, 0.95, 0.7) * (disc + halo * 0.8 + cross);

  // Cel clouds drifting
  if (dir.y > 0.08) {
    vec2 cp = dir.xz / max(dir.y, 0.15);
    cp.x += uTime * 0.012;
    float c = cloudField(cp * 0.55);
    // Hard rim edge on clouds
    float rim = cloudField(cp * 0.55 + 0.04) - c;
    vec3 cloudCol = mix(vec3(0.77, 0.85, 0.94), vec3(1.0, 0.97, 0.94), c);
    cloudCol += vec3(1.0) * step(0.15, rim) * 0.35;
    col = mix(col, cloudCol, c * step(0.12, dir.y) * 0.85);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export class SkyAtmosphere {
  readonly group = new THREE.Group();
  private skyMat: THREE.ShaderMaterial;
  private sunDir = new THREE.Vector3(0.45, 0.72, 0.4).normalize();

  constructor() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(Palette.skyZenith) },
        uHorizon: { value: new THREE.Color(Palette.skyHorizon) },
        uGlow: { value: new THREE.Color(Palette.skyGlow) },
        uSunDir: { value: this.sunDir.clone() },
        uTime: { value: 0 },
      },
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), this.skyMat);
    dome.frustumCulled = false;
    this.group.add(dome);

    // Hard graphic sun billboard disc for extra pop
    const sunGeo = new THREE.CircleGeometry(18, 24);
    const sunMat = new THREE.MeshBasicMaterial({
      color: Palette.sunCore,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.copy(this.sunDir).multiplyScalar(420);
    sun.lookAt(0, 0, 0);
    this.group.add(sun);

    const flareGeo = new THREE.CircleGeometry(42, 24);
    const flareMat = new THREE.MeshBasicMaterial({
      color: Palette.sunRim,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flare = new THREE.Mesh(flareGeo, flareMat);
    flare.position.copy(this.sunDir).multiplyScalar(418);
    flare.lookAt(0, 0, 0);
    this.group.add(flare);
  }

  update(t: number, camera: THREE.Camera): void {
    this.skyMat.uniforms.uTime.value = t;
    this.group.position.copy(camera.position);
  }
}
