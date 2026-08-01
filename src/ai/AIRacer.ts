/**
 * Spline-following AI with personality, rubber-banding, avoidance, and mistakes.
 */
import * as THREE from 'three';
import type { BoatInput } from '../boats/BoatPhysics';
import type { BoatPhysics } from '../boats/BoatPhysics';
import { getTrackFrame } from '../course/TrackSpline';

export type Personality = 'aggressive' | 'clean' | 'erratic';

export interface AIConfig {
  personality: Personality;
  skill: number; // 0..1
}

export class AIRacer {
  config: AIConfig;
  private mistakeTimer = 0;
  private mistakeSteer = 0;
  private progress = 0;

  constructor(config: AIConfig) {
    this.config = config;
  }

  getProgress(): number {
    return this.progress;
  }

  setProgress(u: number): void {
    this.progress = u;
  }

  think(
    dt: number,
    t: number,
    physics: BoatPhysics,
    curve: THREE.CatmullRomCurve3,
    rivals: { x: number; z: number; id: number }[],
    selfId: number,
    playerProgress: number,
    racing: boolean,
  ): BoatInput {
    void t;
    if (!racing) {
      return { throttle: 0, steer: 0, drift: false, boost: false };
    }

    const pos = physics.state.position;
    // Update progress via nearest + forward bias
    let bestU = this.progress;
    let bestD = Infinity;
    for (let i = 0; i < 80; i++) {
      const u = (this.progress + i / 80 * 0.2) % 1;
      const p = curve.getPointAt(u);
      const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestU = u;
      }
    }
    this.progress = bestU;

    // Personality lookahead
    let look = 0.04;
    if (this.config.personality === 'aggressive') look = 0.055;
    if (this.config.personality === 'clean') look = 0.07;
    if (this.config.personality === 'erratic') look = 0.035 + Math.sin(t * 1.7) * 0.02;

    const target = getTrackFrame(curve, this.progress + look);
    // Line offset by personality
    let offset = 0;
    if (this.config.personality === 'aggressive') offset = Math.sin(t * 0.8) * 2.5;
    if (this.config.personality === 'erratic') offset = Math.sin(t * 2.3) * 4.0;
    const right = new THREE.Vector3(-target.tangent.z, 0, target.tangent.x);
    const aim = target.position.clone().addScaledVector(right, offset);

    const toAimX = aim.x - pos.x;
    const toAimZ = aim.z - pos.z;
    const desiredYaw = Math.atan2(toAimZ, toAimX);
    let yawErr = desiredYaw - physics.state.yaw;
    while (yawErr > Math.PI) yawErr -= Math.PI * 2;
    while (yawErr < -Math.PI) yawErr += Math.PI * 2;

    // Mistakes
    this.mistakeTimer -= dt;
    if (this.mistakeTimer <= 0) {
      const chance = this.config.personality === 'erratic' ? 0.35 : this.config.personality === 'aggressive' ? 0.18 : 0.08;
      if (Math.random() < chance * dt * 2) {
        this.mistakeTimer = 0.4 + Math.random() * 0.8;
        this.mistakeSteer = (Math.random() - 0.5) * 1.4;
      }
    }

    let steer = THREE.MathUtils.clamp(yawErr * 1.8, -1, 1);
    if (this.mistakeTimer > 0) steer = THREE.MathUtils.clamp(steer + this.mistakeSteer, -1, 1);

    // Collision avoidance
    for (const r of rivals) {
      if (r.id === selfId) continue;
      const dx = r.x - pos.x;
      const dz = r.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 8) {
        const away = Math.atan2(-dz, -dx);
        let aerr = away - physics.state.yaw;
        while (aerr > Math.PI) aerr -= Math.PI * 2;
        while (aerr < -Math.PI) aerr += Math.PI * 2;
        steer += THREE.MathUtils.clamp(aerr * (1 - dist / 8) * 0.8, -0.6, 0.6);
      }
    }

    // Rubber band vs player
    let progDiff = playerProgress - this.progress;
    if (progDiff > 0.5) progDiff -= 1;
    if (progDiff < -0.5) progDiff += 1;
    let throttle = 0.75 + this.config.skill * 0.25;
    if (progDiff > 0.05) throttle += Math.min(progDiff * 1.5, 0.35); // behind player — catch up
    if (progDiff < -0.08) throttle -= Math.min(-progDiff * 0.8, 0.25); // ahead — ease

    if (this.config.personality === 'aggressive') throttle += 0.08;
    if (this.config.personality === 'clean') throttle *= 0.95;

    const speed = Math.abs(physics.state.speed);
    const drift = Math.abs(steer) > 0.7 && speed > 16 && this.config.personality !== 'clean';
    const boost = physics.state.boostMeter > 0.4 && Math.abs(steer) < 0.35 && speed > 12 && (this.config.personality === 'aggressive' || Math.random() > 0.7);

    return {
      throttle: THREE.MathUtils.clamp(throttle, 0.2, 1),
      steer: THREE.MathUtils.clamp(steer, -1, 1),
      drift,
      boost,
    };
  }
}
