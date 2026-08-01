/**
 * Stylized sky: gradient dome shader with a graphic anime sun
 * (hard disc + halo ring + diamond flare spikes, all in-shader),
 * plus drifting cel clouds drawn onto canvas textures in code.
 */

import * as THREE from "three";
import { Palette, hex } from "../core/Palette";

export class Sky {
  readonly group: THREE.Group;
  readonly sunDir: THREE.Vector3;
  private readonly domeMat: THREE.ShaderMaterial;
  private readonly clouds: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.sunDir = new THREE.Vector3(0.42, 0.40, 0.28).normalize();

    // ------------------------------------------------------------------
    // Dome
    // ------------------------------------------------------------------
    const domeGeo = new THREE.SphereGeometry(8500, 32, 24);
    this.domeMat = new THREE.ShaderMaterial({
      name: "SkyDome",
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(Palette.skyZenith) },
        uMid: { value: new THREE.Color(Palette.skyMid) },
        uHorizon: { value: new THREE.Color(Palette.skyHorizon) },
        uSunCore: { value: new THREE.Color(Palette.sunCore) },
        uSunHalo: { value: new THREE.Color(Palette.sunHalo) },
        uSunDir: { value: this.sunDir },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          // pin dome to camera so it never parallaxes
          vec4 wp = vec4(position + cameraPosition, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uSunCore;
        uniform vec3 uSunHalo;
        uniform vec3 uSunDir;
        varying vec3 vDir;

        void main() {
          vec3 d = normalize(vDir);
          float t = clamp(d.y, 0.0, 1.0);

          // three-stop gradient — stylized by palette choice, kept smooth
          vec3 col = mix(uHorizon, uMid, smoothstep(0.02, 0.28, t));
          col = mix(col, uZenith, smoothstep(0.25, 0.75, t));

          // ---------------- graphic sun ----------------
          float sunDot = dot(d, normalize(uSunDir));
          float ang = acos(clamp(sunDot, -1.0, 1.0));

          // big flat anime sun disc with a hard edge
          float core = 1.0 - smoothstep(0.052, 0.056, ang);
          // one painted halo band hugging the disc
          float halo = (1.0 - smoothstep(0.078, 0.082, ang)) * smoothstep(0.060, 0.064, ang);
          // no bloom wash: the sun stays a clean graphic mark

          // four chunky diamond flare points hugging the disc
          vec3 up = abs(uSunDir.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 sx = normalize(cross(up, uSunDir));
          vec3 sy = cross(uSunDir, sx);
          vec2 pl = vec2(dot(d, sx), dot(d, sy));
          float spike = 0.0;
          {
            vec2 a = abs(pl);
            float cross4 = min(a.x, a.y);
            float reach = max(a.x, a.y);
            // fat triangular points that taper fast: start at the disc edge
            float taper = pow(max(0.0, 1.0 - (reach - 0.045) / 0.085), 1.3);
            spike = step(cross4, 0.016 * taper) * step(0.05, reach) * step(reach, 0.13);
          }

          col = mix(col, uSunHalo, halo);
          col = mix(col, uSunCore, clamp(core + spike, 0.0, 1.0));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(domeGeo, this.domeMat);
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    this.group.add(dome);

    // ------------------------------------------------------------------
    // Cel clouds: flat blob shapes on billboarded planes
    // ------------------------------------------------------------------
    const cloudTexA = makeCloudTexture(0);
    const cloudTexB = makeCloudTexture(1);
    const cloudTexC = makeCloudTexture(2);
    const texes = [cloudTexA, cloudTexB, cloudTexC];

    const rng = mulberry32(1337);
    for (let i = 0; i < 14; i++) {
      const tex = texes[i % 3];
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.5, // hard edge, no sorting problems
        depthWrite: false,
        fog: false,
      });
      const w = 900 + rng() * 1400;
      const geo = new THREE.PlaneGeometry(w, w * 0.42);
      const m = new THREE.Mesh(geo, mat);
      const angle = rng() * Math.PI * 2;
      const radius = 4200 + rng() * 2600;
      const height = 500 + rng() * 900;
      m.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      m.userData.driftSpeed = 0.0015 + rng() * 0.002;
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
      // cylindrical billboard: face camera around Y only
      c.rotation.y = Math.atan2(
        camera.position.x - c.position.x,
        camera.position.z - c.position.z
      );
    }
  }
}

/**
 * Draws a cel cloud onto a canvas: a union of hard-edged circles with a
 * flat base, a shaded underside band and a thin ink rim on the bottom.
 */
function makeCloudTexture(seed: number): THREE.CanvasTexture {
  const W = 512;
  const H = 220;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const rng = mulberry32(97 + seed * 31);

  const baseY = H * 0.72;
  const blobs: { x: number; y: number; r: number }[] = [];
  const n = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const fx = i / (n - 1);
    const x = W * 0.12 + fx * W * 0.76 + (rng() - 0.5) * 24;
    const r = (H * 0.16 + rng() * H * 0.24) * (1.0 - Math.abs(fx - 0.5) * 0.9);
    const y = baseY - r * (0.55 + rng() * 0.35);
    blobs.push({ x, y, r: Math.max(r, H * 0.09) });
  }

  const drawBlobs = (dy: number, grow: number) => {
    ctx.beginPath();
    for (const b of blobs) {
      ctx.moveTo(b.x + b.r + grow, b.y + dy);
      ctx.arc(b.x, b.y + dy, b.r + grow, 0, Math.PI * 2);
    }
    // flat base slab
    ctx.rect(blobs[0].x - 10, baseY - H * 0.06 + dy, blobs[n - 1].x - blobs[0].x + 20, H * 0.06 + grow);
    ctx.fill();
  };

  // ink rim under the cloud (drawn first, offset down)
  ctx.fillStyle = hex(Palette.inkSoft);
  drawBlobs(7, 2);
  // shaded underside
  ctx.fillStyle = hex(Palette.cloudShade);
  drawBlobs(3, 0);
  // lit body
  ctx.fillStyle = hex(Palette.cloudLit);
  drawBlobs(-4, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** Small deterministic PRNG so visuals are reproducible in the harness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
