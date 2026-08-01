/**
 * The racecourse: a closed CatmullRom circuit on open water.
 *
 * Layout (roughly 1.6 km/lap, designed for rhythm):
 *   - long start/finish straight (full throttle, big swell rollers)
 *   - wide right-hand sweeper (drift payoff)
 *   - chicane (left-right flick)
 *   - hairpin (hard brake + powerslide)
 *   - cross-swell run (waves hit diagonally -> airtime section)
 *   - fast kinked return straight
 *
 * The glowing race line is a ribbon whose vertices ride the Gerstner
 * field in the vertex shader — it rises and falls with the swell.
 * Checkpoint gates float on the water and bob with the waves.
 */

import * as THREE from "three";
import { glslWaveChunk, getWaterHeight, getWaterNormal } from "../water/waves";
import { Palette } from "../core/Palette";
import { makeToonMaterial } from "../render/ToonMaterial";
import { outlineHierarchy } from "../render/Outline";
import { enableEdgeLines } from "../render/PostPipeline";

const CONTROL_POINTS: [number, number][] = [
  [0, -60], // just before start line
  [0, 120], // main straight
  [10, 260],
  [70, 360], // sweeper entry
  [190, 405], // sweeper apex
  [305, 355], // sweeper exit
  [365, 250],
  [335, 155], // chicane L
  [400, 70], // chicane R
  [345, -45], // hairpin approach
  [225, -105], // hairpin apex
  [160, -25], // hairpin exit
  [70, -75], // cross-swell entry
  [-70, -160], // airtime zone
  [-195, -120],
  [-235, 0], // far turn
  [-160, 80], // return kink
  [-60, 40],
];

export const GATE_COUNT = 10;

export class Course {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  readonly gates: THREE.Group[] = [];
  /** arc-length parameter (0..1) of each gate along the curve */
  readonly gateParams: number[] = [];
  readonly startParam = 0.0;
  private ribbonMat: THREE.ShaderMaterial;
  private gateBobPhase: number[] = [];

  constructor(scene: THREE.Scene) {
    this.curve = new THREE.CatmullRomCurve3(
      CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "centripetal",
      0.5
    );
    this.length = this.curve.getLength();

    // ------------------------------------------------------------------
    // Racing line ribbon
    // ------------------------------------------------------------------
    const SEGS = 900;
    const WIDTH = 2.4;
    const positions = new Float32Array((SEGS + 1) * 2 * 3);
    const uvs = new Float32Array((SEGS + 1) * 2 * 2);
    const indices: number[] = [];
    const p = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i <= SEGS; i++) {
      const t = (i % SEGS) / SEGS;
      this.curve.getPointAt(t, p);
      this.curve.getTangentAt(t, tan);
      side.set(-tan.z, 0, tan.x).normalize().multiplyScalar(WIDTH / 2);
      const vi = i * 2 * 3;
      positions[vi] = p.x - side.x;
      positions[vi + 1] = 0;
      positions[vi + 2] = p.z - side.z;
      positions[vi + 3] = p.x + side.x;
      positions[vi + 4] = 0;
      positions[vi + 5] = p.z + side.z;
      const ui = i * 2 * 2;
      const v = (i / SEGS) * this.length; // metres along the lap
      uvs[ui] = 0;
      uvs[ui + 1] = v;
      uvs[ui + 2] = 1;
      uvs[ui + 3] = v;
    }
    for (let i = 0; i < SEGS; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    ribbonGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    ribbonGeo.setIndex(indices);

    this.ribbonMat = new THREE.ShaderMaterial({
      name: "RaceLine",
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(Palette.raceGreen) },
        uCamPos: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        ${glslWaveChunk()}
        uniform float uTime;
        varying vec2 vUv;
        varying float vDist;
        void main() {
          vUv = uv;
          vec3 base = position;
          vec3 nrm;
          // invert the horizontal Gerstner displacement (2 fixed-point
          // iterations) so the ribbon sits ON the visible surface, exactly
          // like the CPU getWaterHeight used for buoyancy.
          vec2 q = base.xz;
          for (int i = 0; i < 2; i++) {
            vec3 d = gerstner(q, uTime, 1.0, nrm);
            q += base.xz - (q + d.xz);
          }
          vec3 disp = gerstner(q, uTime, 1.0, nrm);
          vec3 wp = vec3(base.x, disp.y + 0.3, base.z);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vDist;
        void main() {
          // scrolling chevron arrows pointing along the direction of travel
          float lane = abs(vUv.x - 0.5) * 2.0; // 0 centre, 1 edge
          float chev = fract((vUv.y - uTime * 6.0 + lane * 1.4) / 9.0);
          float arrow = step(0.62, chev) * step(chev, 0.85);
          // soft edge fade + hard core
          float edgeBand = 1.0 - step(0.92, lane);
          float alpha = (0.16 + arrow * 0.5) * edgeBand;
          // pulse so the line reads as energy, not paint
          alpha *= 0.85 + 0.15 * sin(uTime * 2.4);
          alpha *= 1.0 - smoothstep(180.0, 320.0, vDist);
          vec3 col = mix(uColor, vec3(1.0), arrow * 0.35);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, this.ribbonMat);
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 2;
    scene.add(ribbon);

    // ------------------------------------------------------------------
    // Checkpoint gates
    // ------------------------------------------------------------------
    for (let g = 0; g < GATE_COUNT; g++) {
      const t = g / GATE_COUNT;
      this.gateParams.push(t);
      const gate = this.buildGate(g === 0);
      const pos = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      gate.position.copy(pos);
      gate.rotation.y = Math.atan2(tangent.x, tangent.z);
      gate.userData.baseX = pos.x;
      gate.userData.baseZ = pos.z;
      gate.userData.yaw = gate.rotation.y;
      this.gates.push(gate);
      this.gateBobPhase.push(g * 1.7);
      scene.add(gate);
    }
  }

  /** Two floating pylons + glowing crossbar. Start gate gets flags. */
  private buildGate(isStart: boolean): THREE.Group {
    const group = new THREE.Group();
    const HALF = 7.5;
    const accent = isStart ? Palette.yellow : Palette.orange;
    const pylonMat = makeToonMaterial({ color: accent, specular: 0.4, rim: 0.6 });
    const capMat = makeToonMaterial({ color: Palette.white, specular: 0.3, rim: 0.5 });
    const barMat = makeToonMaterial({
      color: isStart ? Palette.yellow : Palette.raceGreen,
      emissive: 0.85,
      specular: 0,
      rim: 0.2,
    });

    for (const sx of [-HALF, HALF]) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 0.9, 12), capMat);
      base.position.set(sx, 0.2, 0);
      group.add(base);
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 4.6, 10), pylonMat);
      pylon.position.set(sx, 2.6, 0);
      group.add(pylon);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), capMat);
      ball.position.set(sx, 5.1, 0);
      group.add(ball);
    }
    // glowing crossbar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 - 0.8, 0.42, 0.28), barMat);
    bar.position.set(0, 5.1, 0);
    group.add(bar);

    if (isStart) {
      // start banner: checkered canvas texture drawn in code
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 48;
      const ctx = cv.getContext("2d")!;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? "#101a38" : "#ffffff";
          ctx.fillRect(x * 16, y * 16, 16, 16);
        }
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter;
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(HALF * 2 - 1, 1.5),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
      );
      banner.position.set(0, 4.2, 0);
      banner.userData.noOutline = true;
      group.add(banner);
    }

    outlineHierarchy(group, { widthPx: 2.0 });
    enableEdgeLines(group);
    return group;
  }

  private _n = new THREE.Vector3();

  /** Gates ride the waves: sample height + tilt with the surface normal. */
  update(time: number, camera: THREE.Camera): void {
    this.ribbonMat.uniforms.uTime.value = time;
    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i];
      const bx = gate.userData.baseX as number;
      const bz = gate.userData.baseZ as number;
      // cull far gates cheaply
      const dx = bx - (camera as THREE.PerspectiveCamera).position.x;
      const dz = bz - (camera as THREE.PerspectiveCamera).position.z;
      const distSq = dx * dx + dz * dz;
      gate.visible = distSq < 340 * 340;
      if (!gate.visible) continue;

      const h = getWaterHeight(bx, bz, time);
      gate.position.y = h - 0.25;
      getWaterNormal(bx, bz, time, this._n);
      // gentle tilt toward the wave normal + slow bob
      const yaw = gate.userData.yaw as number;
      gate.rotation.set(this._n.z * 0.35, yaw, -this._n.x * 0.35, "YXZ");
    }
  }

  /** closest arc-length param near a previous estimate (local search) */
  projectParam(x: number, z: number, prevT: number): number {
    let best = prevT;
    let bestD = Infinity;
    const p = new THREE.Vector3();
    // coarse-to-fine local search around the previous param
    for (let radius = 0.02, step = 0.002; radius >= 0.005; radius /= 2, step /= 2) {
      for (let dt = -radius; dt <= radius; dt += step) {
        let t = best + dt;
        t -= Math.floor(t);
        this.curve.getPointAt(t, p);
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
    return best - Math.floor(best);
  }
}
