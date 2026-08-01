/**
 * Foam system: hull rings, wake ribbons, spray particles.
 * Crest foam lives in the water shader; this handles boat-driven foam.
 */
import * as THREE from 'three';
import { Palette } from '../palette';
import { sampleGerstner } from './gerstner';

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

export class FoamWake {
  readonly group = new THREE.Group();
  private wakeGeo: THREE.BufferGeometry;
  private wakePos: Float32Array;
  private wakeCol: Float32Array;
  private wakeMesh: THREE.Mesh;
  private points: WakePoint[] = [];
  private sprays: Spray[] = [];
  private sprayMesh: THREE.InstancedMesh;
  private sprayDummy = new THREE.Object3D();
  private ringMeshes: THREE.Mesh[] = [];

  constructor(boatCount = 4) {
    // Wake ribbon as triangle strip-ish ribbon via BufferGeometry quads
    this.wakePos = new Float32Array(MAX_WAKE * 2 * 3 * 3); // quads as 2 tris
    this.wakeCol = new Float32Array(MAX_WAKE * 2 * 3 * 3);
    this.wakeGeo = new THREE.BufferGeometry();
    this.wakeGeo.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3));
    this.wakeGeo.setAttribute('color', new THREE.BufferAttribute(this.wakeCol, 3));

    const wakeMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.wakeMesh = new THREE.Mesh(this.wakeGeo, wakeMat);
    this.wakeMesh.frustumCulled = false;
    this.wakeMesh.renderOrder = 2;
    this.group.add(this.wakeMesh);

    // Hull foam rings
    for (let i = 0; i < boatCount; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 2.4, 24),
        new THREE.MeshBasicMaterial({
          color: Palette.foam,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
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
    if (speed < 2 || strength < 0.05) return;
    const side = Math.sin(heading);
    const fwd = Math.cos(heading);
    // Emit behind boat
    this.points.push({
      x: x - fwd * 2.2,
      z: z - side * 2.2,
      age: 0,
      width: 0.8 + Math.min(speed * 0.08, 2.2),
      strength,
    });
    if (this.points.length > MAX_WAKE) this.points.shift();
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

  updateRing(index: number, x: number, z: number, t: number, speed: number): void {
    const ring = this.ringMeshes[index];
    if (!ring) return;
    const sample = sampleGerstner(x, z, t);
    ring.position.set(x + sample.dispX, sample.height + 0.08, z + sample.dispZ);
    const scale = 1.3 + Math.min(speed * 0.06, 1.8);
    ring.scale.setScalar(scale);
    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.opacity = THREE.MathUtils.clamp(0.25 + speed * 0.03, 0.2, 0.7);
  }

  update(dt: number, t: number): void {
    // Age wake
    for (const p of this.points) {
      p.age += dt;
      p.width += dt * 1.8;
      p.strength *= 1 - dt * 0.55;
    }
    this.points = this.points.filter((p) => p.age < 3.5 && p.strength > 0.04);

    // Rebuild wake mesh as paired quads along trail
    let vi = 0;
    let ci = 0;
    const foam = new THREE.Color(Palette.foam);
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const sa = sampleGerstner(a.x, a.z, t);
      const sb = sampleGerstner(b.x, b.z, t);
      const ax = a.x + sa.dispX;
      const az = a.z + sa.dispZ;
      const bx = b.x + sb.dispX;
      const bz = b.z + sb.dispZ;
      const ay = sa.height + 0.06;
      const by = sb.height + 0.06;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      const wa = a.width * 0.5;
      const wb = b.width * 0.5;
      // quad
      const verts = [
        ax - px * wa, ay, az - pz * wa,
        ax + px * wa, ay, az + pz * wa,
        bx + px * wb, by, bz + pz * wb,
        ax - px * wa, ay, az - pz * wa,
        bx + px * wb, by, bz + pz * wb,
        bx - px * wb, by, bz - pz * wb,
      ];
      for (let k = 0; k < verts.length; k++) this.wakePos[vi++] = verts[k];
      const alphaA = a.strength;
      const alphaB = b.strength;
      for (let k = 0; k < 6; k++) {
        const al = k < 3 ? alphaA : alphaB;
        this.wakeCol[ci++] = foam.r * al;
        this.wakeCol[ci++] = foam.g * al;
        this.wakeCol[ci++] = foam.b * al;
      }
    }
    // Zero rest
    for (let i = vi; i < this.wakePos.length; i++) this.wakePos[i] = 0;
    for (let i = ci; i < this.wakeCol.length; i++) this.wakeCol[i] = 0;
    (this.wakeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.wakeGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.wakeGeo.computeBoundingSphere();

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
