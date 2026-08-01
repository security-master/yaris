/**
 * Photorealistic sky dome: smooth atmospheric gradient, soft sun disc
 * with atmospheric bloom, and soft volumetric-looking cloud billboards
 * (still fully procedural — no external textures).
 */

import * as THREE from "three";
import { Palette } from "../core/Palette";

export class Sky {
  readonly group: THREE.Group;
  readonly sunDir: THREE.Vector3;
  private readonly domeMat: THREE.ShaderMaterial;
  private readonly clouds: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.sunDir = new THREE.Vector3(0.42, 0.4, 0.28).normalize();

    const domeGeo = new THREE.SphereGeometry(8500, 48, 32);
    this.domeMat = new THREE.ShaderMaterial({
      name: "SkyDome",
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x1a4a8c) },
        uMid: { value: new THREE.Color(0x6aa8e8) },
        uHorizon: { value: new THREE.Color(0xd6ebff) },
        uSunCore: { value: new THREE.Color(Palette.sunCore) },
        uSunHalo: { value: new THREE.Color(0xffe6b0) },
        uSunDir: { value: this.sunDir },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 wp = vec4(position + cameraPosition, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uMid, uHorizon, uSunCore, uSunHalo, uSunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float t = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.35, t));
          col = mix(col, uZenith, smoothstep(0.2, 0.85, t));

          float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
          float glow = pow(sunDot, 32.0);
          float core = pow(sunDot, 1200.0);
          float limb = pow(sunDot, 8.0) * 0.35;
          col += uSunHalo * (glow * 0.85 + limb);
          col += uSunCore * core * 1.6;

          // subtle horizon haze
          col = mix(col, uHorizon, exp(-max(d.y, 0.0) * 6.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(domeGeo, this.domeMat);
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    this.group.add(dome);

    const cloudTexA = makeCloudTexture(0);
    const cloudTexB = makeCloudTexture(1);
    const cloudTexC = makeCloudTexture(2);
    const texes = [cloudTexA, cloudTexB, cloudTexC];
    const rng = mulberry32(1337);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: texes[i % 3],
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        fog: false,
      });
      const w = 1100 + rng() * 1600;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.4), mat);
      const angle = rng() * Math.PI * 2;
      const radius = 3800 + rng() * 2800;
      const height = 420 + rng() * 1000;
      m.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      m.userData.driftSpeed = 0.0012 + rng() * 0.0018;
      m.userData.baseAngle = angle;
      m.userData.radius = radius;
      m.renderOrder = -9;
      this.clouds.push(m);
      this.group.add(m);
    }

    scene.add(this.group);
  }

  update(time: number, camera: THREE.Camera): void {
    this.group.position.set(0, 0, 0);
    for (const c of this.clouds) {
      const a = (c.userData.baseAngle as number) + time * (c.userData.driftSpeed as number);
      const r = c.userData.radius as number;
      c.position.x = camera.position.x + Math.cos(a) * r;
      c.position.z = camera.position.z + Math.sin(a) * r;
      c.rotation.y = Math.atan2(camera.position.x - c.position.x, camera.position.z - c.position.z);
    }
  }
}

function makeCloudTexture(seed: number): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const rng = mulberry32(97 + seed * 31);
  ctx.clearRect(0, 0, W, H);

  const blobs = 7 + Math.floor(rng() * 4);
  for (let i = 0; i < blobs; i++) {
    const x = W * (0.2 + rng() * 0.6);
    const y = H * (0.35 + rng() * 0.35);
    const rx = 40 + rng() * 90;
    const ry = 28 + rng() * 55;
    const g = ctx.createRadialGradient(x, y, 4, x, y, rx);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.55, "rgba(240,246,255,0.55)");
    g.addColorStop(1, "rgba(220,230,245,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // soft underside shadow
  const shade = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.85);
  shade.addColorStop(0, "rgba(160,180,210,0)");
  shade.addColorStop(1, "rgba(120,145,180,0.18)");
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
