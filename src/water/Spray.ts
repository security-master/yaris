/**
 * Cel spray particles: hard-edged white droplets thrown by slams, drifts
 * and the rooster tail at speed. One InstancedMesh, one draw call.
 * Billboarding + hard-disc alpha test in the shader keeps it graphic —
 * these read as anime droplets, not photorealistic mist.
 */

import * as THREE from "three";
import { Palette } from "../core/Palette";

const MAX = 320;
const G = 22;

interface P {
  born: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

export class Spray {
  private mesh: THREE.InstancedMesh;
  private pool: P[] = [];
  private head = 0;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: false,
      alphaTest: 0.5,
      uniforms: {
        uColor: { value: new THREE.Color(Palette.foam) },
        uInk: { value: new THREE.Color(Palette.inkSoft) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // camera-facing billboard, stretched vertically so droplets read
          // as flung splash streaks rather than bubbles
          vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float scale = length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z));
          mvPos.xy += (uv - 0.5) * vec2(scale * 0.62, scale * 1.35);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uInk;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r2 = dot(p, p) * 4.0;
          if (r2 > 1.0) discard;
          // solid white splash chip — flat, graphic, no bubble ring
          gl_FragColor = vec4(uColor, 1.0);
        }
      `,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOutline = true;
    scene.add(this.mesh);

    for (let i = 0; i < MAX; i++) {
      this.pool.push({ born: -100, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.2 });
    }
  }

  emit(
    time: number,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    count: number,
    spread: number,
    sizeBase: number
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.head];
      this.head = (this.head + 1) % MAX;
      p.born = time;
      p.life = 0.3 + Math.random() * 0.32;
      p.x = pos.x + (Math.random() - 0.5) * 0.6;
      p.y = pos.y + Math.random() * 0.3;
      p.z = pos.z + (Math.random() - 0.5) * 0.6;
      p.vx = vel.x + (Math.random() - 0.5) * spread;
      p.vy = vel.y + Math.random() * spread * 0.9;
      p.vz = vel.z + (Math.random() - 0.5) * spread;
      p.size = sizeBase * (0.6 + Math.random() * 0.8);
    }
  }

  update(time: number): void {
    let count = 0;
    for (const p of this.pool) {
      const age = time - p.born;
      if (age < 0 || age > p.life) continue;
      const t01 = age / p.life;
      // ballistic path
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age - 0.5 * G * age * age;
      const z = p.z + p.vz * age;
      if (y < -1.5) continue;
      // quantized size steps: pop in, hold, shrink in chunks
      const sizeStep = t01 < 0.15 ? 0.7 : t01 < 0.7 ? 1.0 : 0.45;
      this.dummy.position.set(x, y, z);
      this.dummy.scale.setScalar(p.size * sizeStep * 0.8);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count, this.dummy.matrix);
      count++;
      if (count >= MAX) break;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------
// Per-boat spray emission driven by the physics state
// ---------------------------------------------------------------------

import type { BoatPhysics } from "../boats/BoatPhysics";

const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();

export class BoatSprayEmitter {
  private accum = 0;

  update(dt: number, time: number, phys: BoatPhysics, spray: Spray): void {
    const speed = Math.abs(phys.speed);

    // slam: big radial burst
    if (phys.slam) {
      _pos.copy(phys.position);
      _pos.y += 0.2;
      _vel.set(phys.velocity.x * 0.3, 2.5 + phys.slam.strength * 4, phys.velocity.z * 0.3);
      spray.emit(time, _pos, _vel, Math.round(10 + phys.slam.strength * 14), 5.5, 0.5);
    }

    if (phys.wetness <= 0) return;

    this.accum += dt;
    const interval = 1 / 30;
    while (this.accum > interval) {
      this.accum -= interval;

      // bow spray when planing fast
      if (speed > 14) {
        const side = Math.random() < 0.5 ? 1 : -1;
        _pos.set(side * 0.85, 0.05, 1.6).applyQuaternion(phys.quaternion).add(phys.position);
        _vel.set(side * (1.6 + speed * 0.06), 1.4 + speed * 0.045, 0).applyQuaternion(phys.quaternion);
        _vel.x += phys.velocity.x * 0.35;
        _vel.z += phys.velocity.z * 0.35;
        spray.emit(time, _pos, _vel, 1, 1.4, 0.3);
      }

      // rooster tail
      if (speed > 20 && phys.controls.throttle > 0.5) {
        _pos.set(0, 0.1, -2.2).applyQuaternion(phys.quaternion).add(phys.position);
        _vel.set(0, 2.6 + speed * 0.05, -4.5).applyQuaternion(phys.quaternion);
        spray.emit(time, _pos, _vel, 1, 1.8, 0.42);
      }

      // drift side sheet
      if (phys.driftActive && Math.abs(phys.slide) > 1.5) {
        const s = Math.sign(phys.slide);
        _pos.set(s * 1.1, 0.05, -0.4).applyQuaternion(phys.quaternion).add(phys.position);
        _vel.set(s * (3 + Math.abs(phys.slide) * 0.5), 2.2, 0).applyQuaternion(phys.quaternion);
        spray.emit(time, _pos, _vel, 2, 2.2, 0.36);
      }
    }
  }
}
