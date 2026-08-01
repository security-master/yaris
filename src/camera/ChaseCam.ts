/**
 * Spring-damped chase cam, FOV kick, slam shake, cinematic orbit for countdown/results.
 */
import * as THREE from 'three';

export type CameraMode = 'chase' | 'orbit' | 'aerial' | 'bow';

export class ChaseCam {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';
  private pos = new THREE.Vector3(0, 8, -16);
  private look = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private shake = 0;
  private orbitAngle = 0;
  private baseFov = 58;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.5, 900);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(
    dt: number,
    t: number,
    target: THREE.Vector3,
    yaw: number,
    speed: number,
    landingImpact: number,
  ): void {
    if (landingImpact > 0.25) this.addShake(landingImpact * 0.45);
    this.shake = Math.max(0, this.shake - dt * 2.2);

    const speedNorm = Math.min(Math.abs(speed) / 38, 1);
    this.camera.fov = this.baseFov + speedNorm * 10;
    this.camera.updateProjectionMatrix();

    if (this.mode === 'orbit') {
      this.orbitAngle += dt * 0.35;
      const r = 18;
      this.camera.position.set(
        target.x + Math.cos(this.orbitAngle) * r,
        target.y + 7,
        target.z + Math.sin(this.orbitAngle) * r,
      );
      this.camera.lookAt(target.x, target.y + 1.2, target.z);
      return;
    }
    if (this.mode === 'aerial') {
      this.camera.position.set(target.x, target.y + 55, target.z - 10);
      this.camera.lookAt(target.x, target.y, target.z);
      return;
    }
    if (this.mode === 'bow') {
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      this.camera.position.set(
        target.x - fx * 3.5,
        target.y + 3.2,
        target.z - fz * 3.5,
      );
      this.camera.lookAt(target.x + fx * 12, target.y + 1.2, target.z + fz * 12);
      return;
    }

    // Chase — stay well above water surface; never sit inside the wave mesh
    const back = 14 + speedNorm * 4;
    const height = 6.5 + speedNorm * 1.2;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    const desired = new THREE.Vector3(
      target.x - fx * back,
      Math.max(target.y + height, target.y + 5.5),
      target.z - fz * back,
    );
    // Spring-damper
    const stiffness = 48;
    const damping = 12;
    const ax = (desired.x - this.pos.x) * stiffness - this.vel.x * damping;
    const ay = (desired.y - this.pos.y) * stiffness - this.vel.y * damping;
    const az = (desired.z - this.pos.z) * stiffness - this.vel.z * damping;
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.vel.z += az * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    const lookDesired = new THREE.Vector3(
      target.x + fx * 8,
      target.y + 1.2,
      target.z + fz * 8,
    );
    this.look.lerp(lookDesired, 1 - Math.exp(-6 * dt));

    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake * 0.35;
      sy = (Math.random() - 0.5) * this.shake * 0.25;
    }

    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.camera.lookAt(this.look.x, this.look.y, this.look.z);
    void t;
  }

  snapBehind(target: THREE.Vector3, yaw: number): void {
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    this.pos.set(target.x - fx * 16, target.y + 7.5, target.z - fz * 16);
    this.vel.set(0, 0, 0);
    this.look.set(target.x + fx * 6, target.y + 1.5, target.z + fz * 6);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
