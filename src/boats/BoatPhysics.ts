/**
 * Arcade boat dynamics. Not a rigid-body sim — a hand-tuned model built
 * for feel, but grounded in the real Gerstner field:
 *
 *  - Buoyancy is sampled at 5 hull points from the same wave function the
 *    GPU renders, so the boat genuinely pitches, rolls, launches off
 *    crests and slams into troughs.
 *  - Steering tightens with speed; drift drops lateral grip, cranks yaw,
 *    and charges a boost that pays off on release.
 *  - Wave slope pushes the hull around, so water feels like a force,
 *    not a floor.
 */

import * as THREE from "three";
import { getWaterHeight, getWaterNormal } from "../water/waves";

export interface BoatControls {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  drift: boolean;
}

export interface SlamEvent {
  strength: number; // 0..1
  position: THREE.Vector3;
}

// hull sample points in boat space (y = keel-ish depth)
const HULL_POINTS = [
  new THREE.Vector3(0, -0.05, 2.0), // bow
  new THREE.Vector3(-0.75, -0.2, 0.4), // mid left
  new THREE.Vector3(0.75, -0.2, 0.4), // mid right
  new THREE.Vector3(-0.7, -0.18, -1.7), // stern left
  new THREE.Vector3(0.7, -0.18, -1.7), // stern right
];

const G = 12.0; // heavier-than-real gravity => punchy, non-floaty jumps
const BUOY_K = 26.0; // spring per point per metre of submersion
const BUOY_DAMP = 2.6;
const THRUST = 11.5;
const BOOST_THRUST = 9.0;
const DRAG = 0.0102; // quadratic; vmax ~= sqrt(THRUST/DRAG) ~ 33.5 m/s
const LATERAL_GRIP = 6.5; // 1/s decay of sideways velocity
const DRIFT_GRIP = 1.9;
const SLOPE_PUSH = 3.4;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _n = new THREE.Vector3();

export class BoatPhysics {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();

  yaw = 0;
  pitch = 0;
  roll = 0;
  private pitchVel = 0;
  private rollVel = 0;
  private yawVel = 0;

  /** forward speed, m/s (signed) */
  speed = 0;
  /** lateral slide speed, m/s (for spray/audio) */
  slide = 0;
  /** 0..1 how much hull is in the water */
  wetness = 0;
  airborne = false;
  airTime = 0;

  boostCharge = 0; // 0..1, earned by drifting
  boostTime = 0; // seconds of boost remaining
  driftActive = false;

  /** set by step() when the hull slams down; consumed by Game */
  slam: SlamEvent | null = null;

  controls: BoatControls = { throttle: 0, brake: 0, steer: 0, drift: false };

  constructor(x: number, z: number, yaw: number) {
    this.position.set(x, getWaterHeight(x, z, 0) + 0.4, z);
    this.yaw = yaw;
    this.updateQuaternion();
  }

  private updateQuaternion(): void {
    _e.set(this.pitch, this.yaw, this.roll, "YXZ");
    this.quaternion.setFromEuler(_e);
  }

  step(dt: number, time: number): void {
    const c = this.controls;
    this.slam = null;

    this.updateQuaternion();
    _fwd.set(0, 0, 1).applyQuaternion(this.quaternion);
    _fwd.y = 0;
    _fwd.normalize();
    _right.set(_fwd.z, 0, -_fwd.x);

    // ------------------------------------------------------------------
    // Buoyancy at hull points -> heave force + pitch/roll torques
    // ------------------------------------------------------------------
    let buoyAcc = 0;
    let pitchTorque = 0;
    let rollTorque = 0;
    let wetPoints = 0;

    for (let i = 0; i < HULL_POINTS.length; i++) {
      const hp = HULL_POINTS[i];
      _p.copy(hp).applyQuaternion(this.quaternion).add(this.position);
      const wy = getWaterHeight(_p.x, _p.z, time);
      const depth = wy - _p.y;
      if (depth > 0) {
        const d = Math.min(depth, 1.4);
        buoyAcc += d * BUOY_K;
        wetPoints++;
        // torque arm ~ boat-space offsets
        pitchTorque += d * hp.z; // bow deep => pitch bow up
        rollTorque += d * -hp.x; // left deep => roll left up
      }
    }
    const wasAirborne = this.airborne;
    this.wetness = wetPoints / HULL_POINTS.length;
    this.airborne = wetPoints === 0;
    this.airTime = this.airborne ? this.airTime + dt : 0;

    // vertical motion
    this.velocity.y += (buoyAcc - G) * dt;
    if (wetPoints > 0) {
      this.velocity.y -= this.velocity.y * BUOY_DAMP * this.wetness * dt * 3.2;
    }

    // slam detection: landing hard after airtime
    if (wasAirborne && !this.airborne && this.velocity.y < -3.2) {
      const strength = THREE.MathUtils.clamp((-this.velocity.y - 3.2) / 7, 0.12, 1);
      this.slam = { strength, position: this.position.clone() };
    }

    // ------------------------------------------------------------------
    // Pitch & roll: water torques + control feel kicks
    // ------------------------------------------------------------------
    const speedT = THREE.MathUtils.clamp(Math.abs(this.speed) / 33, 0, 1);

    this.pitchVel += (-pitchTorque * 0.85 - this.pitch * 2.2 - this.pitchVel * 4.2) * dt * 3.2;
    // throttle squat: nose lifts under power, dips under braking
    this.pitchVel += (c.throttle * 0.55 - c.brake * 0.9) * this.wetness * dt * 3.0;
    // airborne: nose settles down for the landing
    if (this.airborne) this.pitchVel += 0.55 * dt;

    this.rollVel += (rollTorque * 0.8 - this.roll * 3.0 - this.rollVel * 4.5) * dt * 3.4;
    // lean INTO the turn like a jetski — key to the arcade feel
    const leanTarget = -c.steer * (0.24 + speedT * 0.3) * (this.driftActive ? 1.5 : 1);
    this.rollVel += (leanTarget - this.roll) * dt * 6.5 * this.wetness;

    this.pitch += this.pitchVel * dt;
    this.roll += this.rollVel * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.6, 0.6);
    this.roll = THREE.MathUtils.clamp(this.roll, -0.75, 0.75);

    // ------------------------------------------------------------------
    // Steering & drift
    // ------------------------------------------------------------------
    this.driftActive = c.drift && Math.abs(this.speed) > 8 && this.wetness > 0;
    const steerGain = (0.55 + speedT * 1.15) * (this.driftActive ? 1.75 : 1);
    const targetYawVel = -c.steer * steerGain * (this.speed >= 0 ? 1 : -1);
    const yawResponse = this.wetness > 0 ? 7.5 : 1.6; // little authority in the air
    this.yawVel += (targetYawVel - this.yawVel) * Math.min(1, dt * yawResponse);
    this.yaw += this.yawVel * dt * Math.min(1, Math.abs(this.speed) / 6 + 0.15);

    // boost: charge while drifting, pay off on release
    if (this.driftActive) {
      this.boostCharge = Math.min(1, this.boostCharge + Math.abs(this.yawVel) * dt * 0.55);
    } else if (this.boostCharge > 0) {
      if (this.boostCharge > 0.3) {
        this.boostTime = Math.max(this.boostTime, this.boostCharge * 1.9);
      }
      this.boostCharge = 0;
    }
    this.boostTime = Math.max(0, this.boostTime - dt);

    // ------------------------------------------------------------------
    // Longitudinal + lateral dynamics in the boat frame
    // ------------------------------------------------------------------
    let vf = this.velocity.dot(_fwd);
    let vl = this.velocity.dot(_right);

    const waterFactor = this.wetness > 0 ? 0.45 + 0.55 * this.wetness : 0;
    vf += c.throttle * THRUST * waterFactor * dt;
    if (this.boostTime > 0) vf += BOOST_THRUST * waterFactor * dt;
    // brake / reverse
    vf -= c.brake * (vf > 0.5 ? 14 : 4.5) * waterFactor * dt;
    vf = Math.max(vf, -7);
    // quadratic drag + a light linear term so it coasts down naturally
    vf -= (DRAG * vf * Math.abs(vf) + vf * 0.045) * dt * (this.wetness > 0 ? 1 : 0.25);

    // lateral grip: water resists sliding; drift lets it slide
    const grip = this.driftActive ? DRIFT_GRIP : LATERAL_GRIP;
    vl -= vl * Math.min(1, grip * this.wetness * dt);
    // drifting throws the tail out
    if (this.driftActive) vl += -c.steer * 3.4 * dt * Math.abs(this.speed) * 0.06;

    // wave slope push: slide down the face of the swell
    if (this.wetness > 0) {
      getWaterNormal(this.position.x, this.position.z, time, _n);
      vf += _n.dot(_fwd) * SLOPE_PUSH * this.wetness * dt;
      vl += _n.dot(_right) * SLOPE_PUSH * this.wetness * dt;
    }

    this.speed = vf;
    this.slide = vl;

    this.velocity.x = _fwd.x * vf + _right.x * vl;
    this.velocity.z = _fwd.z * vf + _right.z * vl;

    // integrate
    this.position.addScaledVector(this.velocity, dt);

    // safety: never tunnel deep under the surface
    const centerWater = getWaterHeight(this.position.x, this.position.z, time);
    if (this.position.y < centerWater - 1.0) {
      this.position.y = centerWater - 1.0;
      this.velocity.y = Math.max(this.velocity.y, 0);
    }

    this.updateQuaternion();
  }
}
