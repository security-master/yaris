/**
 * Foam system: hull rings, wake ribbons, spray particles.
 * Crest foam lives in the water shader; this handles boat-driven foam.
 */
import * as THREE from 'three';
import { Palette } from '../palette';
import { sampleGerstner, type WaveSample } from './gerstner';

interface WakePoint {
  x: number;
  z: number;
  age: number;
  width: number;
  strength: number;
}

interface Spray {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const MAX_WAKE = 180;
const MAX_SPRAY = 120;
const MAX_WAKE_SEGMENTS = 400;
const WAKE_LIFETIME = 3.2;
const WAKE_SURFACE_OFFSET = 0.075;

const wakeVert = /* glsl */ `
attribute float aAlpha;
attribute float aSide;
attribute float aFlow;

varying float vAlpha;
varying float vSide;
varying float vFlow;
varying vec3 vWorldPos;

void main() {
  vAlpha = aAlpha;
  vSide = aSide;
  vFlow = aFlow;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const wakeFrag = /* glsl */ `
uniform vec3 uFoam;
uniform float uTime;

varying float vAlpha;
varying float vSide;
varying float vFlow;
varying vec3 vWorldPos;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float side = abs(vSide);
  float edgeSeed = hash21(floor(vWorldPos.xz * 1.4 + vec2(floor(vFlow * 0.21), 0.0)));
  float raggedWidth = 0.82 + edgeSeed * 0.16;
  float sideMask = step(side, raggedWidth);

  float movingStripe = step(0.42, fract(vFlow * 0.82 - uTime * 1.8));
  float fleck = step(0.18, hash21(floor(vWorldPos.xz * 1.8) + floor(uTime * 4.0)));
  float coreRibbon = step(side, 0.50);
  float foamMask = sideMask * max(coreRibbon, movingStripe * fleck);

  float lifeAlpha = clamp(vAlpha, 0.0, 1.0);
  float alpha = 0.16 + floor(lifeAlpha * 5.0) * 0.16;
  if (foamMask < 0.5 || lifeAlpha <= 0.04) discard;
  gl_FragColor = vec4(uFoam, alpha);
}
`;

function createHullFoamGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const side of [-1, 1]) {
    positions.push(
      -0.15, 0, side * 0.62,
      -1.35, 0, side * 1.22,
      -2.85, 0, side * 0.82,
      -0.15, 0, side * 0.62,
      -2.85, 0, side * 0.82,
      -1.65, 0, side * 0.36,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export class FoamWake {
  readonly group = new THREE.Group();
  private wakeGeo: THREE.BufferGeometry;
  private wakePos: Float32Array;
  private wakeAlpha: Float32Array;
  private wakeSide: Float32Array;
  private wakeFlow: Float32Array;
  private wakeMesh: THREE.Mesh;
  private readonly trails: WakePoint[][];
  private emitSlot = 0;
  private readonly maxTrailPoints: number;
  private sprays: Spray[] = [];
  private sprayMesh: THREE.InstancedMesh;
  private sprayDummy = new THREE.Object3D();
  private ringMeshes: THREE.Mesh[] = [];
  private wakeSample: WaveSample = {
    height: 0,
    dispX: 0,
    dispZ: 0,
    normal: new THREE.Vector3(0, 1, 0),
    crest: 0,
  };

  constructor(boatCount = 4) {
    const trailCount = Math.max(1, boatCount);
    this.trails = Array.from({ length: trailCount }, () => []);
    this.maxTrailPoints = Math.max(8, Math.floor(MAX_WAKE / trailCount));

    // Wake ribbon as triangle strip-ish ribbon via BufferGeometry quads
    this.wakePos = new Float32Array(MAX_WAKE_SEGMENTS * 2 * 3 * 3); // quads as 2 tris
    this.wakeAlpha = new Float32Array(MAX_WAKE_SEGMENTS * 2 * 3);
    this.wakeSide = new Float32Array(MAX_WAKE_SEGMENTS * 2 * 3);
    this.wakeFlow = new Float32Array(MAX_WAKE_SEGMENTS * 2 * 3);
    this.wakeGeo = new THREE.BufferGeometry();
    this.wakeGeo.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3));
    this.wakeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.wakeAlpha, 1));
    this.wakeGeo.setAttribute('aSide', new THREE.BufferAttribute(this.wakeSide, 1));
    this.wakeGeo.setAttribute('aFlow', new THREE.BufferAttribute(this.wakeFlow, 1));
    this.wakeGeo.setDrawRange(0, 0);

    const wakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uFoam: { value: new THREE.Color(Palette.foam) },
        uTime: { value: 0 },
      },
      vertexShader: wakeVert,
      fragmentShader: wakeFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.wakeMesh = new THREE.Mesh(this.wakeGeo, wakeMat);
    this.wakeMesh.frustumCulled = false;
    this.wakeMesh.renderOrder = 2;
    this.group.add(this.wakeMesh);

    // Hull foam wing cards: white, low-opacity shapes instead of UI-like rings.
    const hullFoamGeo = createHullFoamGeometry();
    for (let i = 0; i < boatCount; i++) {
      const ring = new THREE.Mesh(
        hullFoamGeo,
        new THREE.MeshBasicMaterial({
          color: Palette.foam,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.renderOrder = 3;
      this.ringMeshes.push(ring);
      this.group.add(ring);
    }

    // Spray instanced cards
    const sprayGeo = new THREE.PlaneGeometry(0.35, 0.35);
    const sprayMat = new THREE.MeshBasicMaterial({
      color: Palette.foam,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.sprayMesh = new THREE.InstancedMesh(sprayGeo, sprayMat, MAX_SPRAY);
    this.sprayMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sprayMesh.frustumCulled = false;
    this.group.add(this.sprayMesh);
  }

  emitWake(x: number, z: number, heading: number, speed: number, strength: number): void {
    const trail = this.trails[this.emitSlot];
    this.emitSlot = (this.emitSlot + 1) % this.trails.length;
    if (speed < 1.2 || strength < 0.05) return;
    const side = Math.sin(heading);
    const fwd = Math.cos(heading);
    const wakeX = x - fwd * 2.45;
    const wakeZ = z - side * 2.45;
    const last = trail[trail.length - 1];
    const width = 0.8 + Math.min(speed * 0.075, 1.9);
    const wakeStrength = THREE.MathUtils.clamp(strength * 1.25 + speed * 0.012, 0, 1);

    if (last && Math.hypot(last.x - wakeX, last.z - wakeZ) < 0.42) {
      last.width = Math.max(last.width, width);
      last.strength = Math.max(last.strength, wakeStrength);
      return;
    }

    // Emit behind boat
    trail.push({
      x: wakeX,
      z: wakeZ,
      age: 0,
      width,
      strength: wakeStrength,
    });
    while (trail.length > this.maxTrailPoints) trail.shift();
  }

  emitSpray(origin: THREE.Vector3, amount: number, heading: number): void {
    for (let i = 0; i < amount; i++) {
      if (this.sprays.length >= MAX_SPRAY) this.sprays.shift();
      const a = heading + (Math.random() - 0.5) * 1.8;
      const sp = 3 + Math.random() * 6;
      this.sprays.push({
        pos: origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.5, (Math.random() - 0.5) * 1.5)),
        vel: new THREE.Vector3(Math.sin(a) * sp * 0.3, 4 + Math.random() * 5, Math.cos(a) * sp * 0.3),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      });
    }
  }

  updateRing(index: number, x: number, z: number, heading: number, t: number, speed: number): void {
    const ring = this.ringMeshes[index];
    if (!ring) return;
    const sample = sampleGerstner(x, z, t);
    ring.visible = speed > 1.4;
    ring.position.set(x + sample.dispX, sample.height + 0.065, z + sample.dispZ);
    ring.rotation.set(0, -heading, 0);
    ring.scale.set(
      0.95 + Math.min(speed * 0.035, 0.85),
      1,
      0.9 + Math.min(speed * 0.025, 0.45),
    );
    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.opacity = THREE.MathUtils.clamp(0.12 + speed * 0.01, 0.12, 0.27);
  }

  update(dt: number, t: number): void {
    this.emitSlot = 0;

    // Age wake
    for (const trail of this.trails) {
      for (const p of trail) {
        p.age += dt;
        p.width += dt * 2.0;
        p.strength *= Math.max(0, 1 - dt * 0.65);
      }
      let write = 0;
      for (const p of trail) {
        if (p.age < WAKE_LIFETIME && p.strength > 0.035) trail[write++] = p;
      }
      trail.length = write;
    }

    const wakeMat = this.wakeMesh.material as THREE.ShaderMaterial;
    wakeMat.uniforms.uTime.value = t;

    // Rebuild wake mesh as paired quads along each boat trail.
    let vi = 0;
    let ai = 0;
    let segmentCount = 0;
    const writeWakeVertex = (x: number, z: number, side: number, flow: number, alpha: number): void => {
      const sample = sampleGerstner(x, z, t, this.wakeSample);
      this.wakePos[vi++] = x + sample.dispX;
      this.wakePos[vi++] = sample.height + WAKE_SURFACE_OFFSET;
      this.wakePos[vi++] = z + sample.dispZ;
      this.wakeAlpha[ai] = alpha;
      this.wakeSide[ai] = side;
      this.wakeFlow[ai] = flow;
      ai++;
    };

    for (const trail of this.trails) {
      for (let i = 0; i < trail.length - 1 && segmentCount < MAX_WAKE_SEGMENTS; i++) {
        const a = trail[i];
        const b = trail[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.05 || dist > 14) continue;

        const px = -dz / dist;
        const pz = dx / dist;
        const wa = a.width * 0.5;
        const wb = b.width * 0.5;
        const alphaA = THREE.MathUtils.clamp(a.strength * (1 - a.age / WAKE_LIFETIME), 0, 1);
        const alphaB = THREE.MathUtils.clamp(b.strength * (1 - b.age / WAKE_LIFETIME), 0, 1);
        const flowA = a.age * 5.0 + i;
        const flowB = b.age * 5.0 + i + 1;

        writeWakeVertex(a.x - px * wa, a.z - pz * wa, -1, flowA, alphaA);
        writeWakeVertex(a.x + px * wa, a.z + pz * wa, 1, flowA, alphaA);
        writeWakeVertex(b.x + px * wb, b.z + pz * wb, 1, flowB, alphaB);
        writeWakeVertex(a.x - px * wa, a.z - pz * wa, -1, flowA, alphaA);
        writeWakeVertex(b.x + px * wb, b.z + pz * wb, 1, flowB, alphaB);
        writeWakeVertex(b.x - px * wb, b.z - pz * wb, -1, flowB, alphaB);
        segmentCount++;
      }
    }
    (this.wakeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.wakeGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (this.wakeGeo.attributes.aSide as THREE.BufferAttribute).needsUpdate = true;
    (this.wakeGeo.attributes.aFlow as THREE.BufferAttribute).needsUpdate = true;
    this.wakeGeo.setDrawRange(0, ai);
    if (ai > 0) this.wakeGeo.computeBoundingSphere();

    // Spray
    let alive = 0;
    for (const s of this.sprays) {
      s.life += dt;
      s.vel.y -= 18 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.life < s.maxLife) {
        this.sprayDummy.position.copy(s.pos);
        this.sprayDummy.scale.setScalar(1 - s.life / s.maxLife);
        this.sprayDummy.lookAt(
          s.pos.x + s.vel.x,
          s.pos.y + s.vel.y,
          s.pos.z + s.vel.z,
        );
        this.sprayDummy.updateMatrix();
        this.sprayMesh.setMatrixAt(alive++, this.sprayDummy.matrix);
      }
    }
    this.sprays = this.sprays.filter((s) => s.life < s.maxLife);
    for (let i = alive; i < MAX_SPRAY; i++) {
      this.sprayDummy.position.set(0, -999, 0);
      this.sprayDummy.scale.setScalar(0);
      this.sprayDummy.updateMatrix();
      this.sprayMesh.setMatrixAt(i, this.sprayDummy.matrix);
    }
    this.sprayMesh.instanceMatrix.needsUpdate = true;
    this.sprayMesh.count = MAX_SPRAY;
  }
}
