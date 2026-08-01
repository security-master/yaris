/**
 * Spring-damped chase camera with speed-driven FOV kick, slam shake,
 * and cinematic orbit modes for the countdown / results screens.
 */

import * as THREE from "three";
import { getWaterHeight } from "../water/waves";

export type CameraMode = "chase" | "orbit" | "finish";

export interface ChaseTarget {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** current speed m/s (for FOV kick) */
  speed: number;
  /** world velocity (for spring lag feed-forward) */
  velocity: THREE.Vector3;
}

const _fwd = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = "orbit";

  private vel = new THREE.Vector3();
  private pos = new THREE.Vector3(0, 8, 20);
  private lookAt = new THREE.Vector3();
  private smoothedLook = new THREE.Vector3();
  private shake = 0;
  private shakeTime = 0;
  private baseFov = 62;
  private orbitAngle = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.3, 20000);
    this.camera.position.copy(this.pos);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  snapBehind(target: ChaseTarget): void {
    _fwd.set(0, 0, 1).applyQuaternion(target.quaternion);
    _fwd.y = 0;
    _fwd.normalize();
    this.pos.copy(target.position).addScaledVector(_fwd, -11).add(new THREE.Vector3(0, 4.5, 0));
    this.vel.set(0, 0, 0);
    this.smoothedLook.copy(target.position);
  }

  update(dt: number, time: number, target: ChaseTarget): void {
    const cam = this.camera;

    if (this.mode === "orbit" || this.mode === "finish") {
      // cinematic orbit around the boat
      this.orbitAngle += dt * (this.mode === "orbit" ? 0.22 : 0.16);
      const r = this.mode === "orbit" ? 15 : 17;
      const h = this.mode === "orbit" ? 5.2 : 6.0;
      _desired.set(
        target.position.x + Math.cos(this.orbitAngle) * r,
        target.position.y + h,
        target.position.z + Math.sin(this.orbitAngle) * r
      );
      this.pos.lerp(_desired, Math.min(1, dt * 2.2));
      this.lookAt.copy(target.position).add(new THREE.Vector3(0, 1.2, 0));
      this.smoothedLook.lerp(this.lookAt, Math.min(1, dt * 4));
      cam.fov += (58 - cam.fov) * Math.min(1, dt * 2);
    } else {
      // ----- chase -----
      _fwd.set(0, 0, 1).applyQuaternion(target.quaternion);
      _fwd.y = 0;
      _fwd.normalize();

      const speedT = THREE.MathUtils.clamp(target.speed / 34, 0, 1);
      const back = 10.2 + speedT * 2.6;
      const height = 4.3 - speedT * 0.7;

      // critically-damped spring toward the desired position
      const stiffness = 48;
      const damping = 2 * Math.sqrt(stiffness) * 1.05;

      _desired
        .copy(target.position)
        .addScaledVector(_fwd, -back)
        .add(new THREE.Vector3(0, height, 0));
      // feed-forward: cancel the spring's steady-state lag at speed
      _desired.x += target.velocity.x * (damping / stiffness);
      _desired.z += target.velocity.z * (damping / stiffness);
      const ax = (_desired.x - this.pos.x) * stiffness - this.vel.x * damping;
      const ay = (_desired.y - this.pos.y) * (stiffness * 1.4) - this.vel.y * (damping * 1.2);
      const az = (_desired.z - this.pos.z) * stiffness - this.vel.z * damping;
      this.vel.x += ax * dt;
      this.vel.y += ay * dt;
      this.vel.z += az * dt;
      this.pos.addScaledVector(this.vel, dt);

      // never let the camera dip under the waves
      const wh = getWaterHeight(this.pos.x, this.pos.z, time);
      if (this.pos.y < wh + 1.6) this.pos.y = wh + 1.6;

      _look.copy(target.position).addScaledVector(_fwd, 6.5).add(new THREE.Vector3(0, 1.0, 0));
      this.smoothedLook.lerp(_look, Math.min(1, dt * 9));

      // FOV kick with speed
      const targetFov = this.baseFov + speedT * speedT * 16;
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 3.5);
    }

    // screenshake: decaying band-limited jitter
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.shakeTime += dt * 31;
    const s = this.shake * this.shake * 0.45;
    const ox = (Math.sin(this.shakeTime * 1.13) + Math.sin(this.shakeTime * 2.71)) * 0.5 * s;
    const oy = (Math.sin(this.shakeTime * 1.47 + 2.1) + Math.sin(this.shakeTime * 3.11)) * 0.5 * s;

    cam.position.copy(this.pos);
    cam.position.x += ox;
    cam.position.y += oy;
    cam.lookAt(this.smoothedLook);
    cam.rotation.z += ox * 0.05;
    cam.updateProjectionMatrix();
  }
}
