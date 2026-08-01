import type { Rider, RiderPose } from './Rider';
import type { BoatPhysicsState } from '../boats/BoatPhysics';

export class RiderAnim {
  private pose: RiderPose = {
    lean: 0,
    pitchLean: 0,
    throttle: 0,
    crouch: 0,
    bob: 0,
    celebrate: 0,
  };
  celebrating = false;

  update(dt: number, boat: BoatPhysicsState, throttleInput: number, t: number): void {
    const speedNorm = Math.min(Math.abs(boat.speed) / 38, 1);
    const targetLean = THREE_clamp(boat.roll * 1.4 + (boat.drifting ? Math.sign(boat.yawRate || 1) * 0.35 : 0), -1, 1);
    const targetPitch = THREE_clamp(-boat.pitch * 0.8 + (throttleInput > 0 ? -0.15 : throttleInput < 0 ? 0.35 : 0), -1, 1);
    const targetCrouch = boat.airborne
      ? Math.min(boat.airTime * 1.5, 1)
      : boat.landingImpact > 0.2
        ? boat.landingImpact
        : 0;

    this.pose.lean = damp(this.pose.lean, targetLean, 8, dt);
    this.pose.pitchLean = damp(this.pose.pitchLean, targetPitch, 7, dt);
    this.pose.throttle = damp(this.pose.throttle, Math.max(0, throttleInput), 6, dt);
    this.pose.crouch = damp(this.pose.crouch, targetCrouch, 10, dt);
    this.pose.bob = Math.sin(t * (2.5 + speedNorm * 3.0)) * (0.4 + speedNorm * 0.6);
    this.pose.celebrate = damp(this.pose.celebrate, this.celebrating ? 1 : 0, 4, dt);
  }

  apply(rider: Rider): void {
    rider.applyPose(this.pose);
  }
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function THREE_clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
