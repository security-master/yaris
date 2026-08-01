/**
 * Arcade boat physics with multi-point Gerstner buoyancy.
 * Throttle, speed-sensitive steering, drift/boost, airtime + landing impact.
 */
import * as THREE from 'three';
import { sampleGerstner, type WaveSample } from '../water/gerstner';

export interface BoatInput {
  throttle: number; // -1..1
  steer: number; // -1..1
  drift: boolean;
  boost: boolean;
}

export interface BoatPhysicsState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  yawRate: number;
  speed: number; // signed forward
  boostMeter: number;
  drifting: boolean;
  airborne: boolean;
  airTime: number;
  landingImpact: number;
  rpm: number;
}

const SAMPLE_OFFSETS = [
  new THREE.Vector3(1.6, 0, 0),
  new THREE.Vector3(-1.4, 0, 0),
  new THREE.Vector3(0.2, 0, 0.55),
  new THREE.Vector3(0.2, 0, -0.55),
  new THREE.Vector3(0.9, 0, 0.35),
  new THREE.Vector3(0.9, 0, -0.35),
];

export class BoatPhysics {
  readonly state: BoatPhysicsState = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    yawRate: 0,
    speed: 0,
    boostMeter: 1,
    drifting: false,
    airborne: false,
    airTime: 0,
    landingImpact: 0,
    rpm: 0,
  };

  maxSpeed = 38;
  accel = 22;
  brake = 28;
  turnRate = 2.1;
  driftTurnMul = 1.55;
  linearDrag = 0.55;
  lateralGrip = 6.5;
  mass = 1;

  private tmp = new THREE.Vector3();
  private sample: WaveSample = {
    height: 0,
    dispX: 0,
    dispZ: 0,
    normal: new THREE.Vector3(0, 1, 0),
    crest: 0,
  };
  private wasAirborne = false;

  setPose(x: number, z: number, yaw: number): void {
    this.state.position.set(x, 0, z);
    this.state.yaw = yaw;
    this.state.velocity.set(0, 0, 0);
  }

  fixedUpdate(dt: number, t: number, input: BoatInput): void {
    const s = this.state;
    s.landingImpact = Math.max(0, s.landingImpact - dt * 3);

    // Sample buoyancy points
    const cos = Math.cos(s.yaw);
    const sin = Math.sin(s.yaw);
    let avgY = 0;
    let avgNx = 0;
    let avgNy = 0;
    let avgNz = 0;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const off of SAMPLE_OFFSETS) {
      const wx = s.position.x + off.x * cos - off.z * sin;
      const wz = s.position.z + off.x * sin + off.z * cos;
      sampleGerstner(wx, wz, t, this.sample);
      const y = this.sample.height;
      avgY += y;
      avgNx += this.sample.normal.x;
      avgNy += this.sample.normal.y;
      avgNz += this.sample.normal.z;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const n = SAMPLE_OFFSETS.length;
    avgY /= n;
    const normal = this.tmp.set(avgNx / n, avgNy / n, avgNz / n).normalize();

    // Forward speed
    const forward = new THREE.Vector3(Math.cos(s.yaw), 0, Math.sin(s.yaw));
    const right = new THREE.Vector3(-Math.sin(s.yaw), 0, Math.cos(s.yaw));
    let fwdSpeed = s.velocity.dot(forward);

    // Drive
    const throttle = input.throttle;
    if (throttle > 0) fwdSpeed += this.accel * throttle * dt;
    else if (throttle < 0) fwdSpeed += this.brake * throttle * dt;

    // Boost from drift payoff
    if (input.boost && s.boostMeter > 0.05 && !s.airborne) {
      fwdSpeed += 28 * dt;
      s.boostMeter = Math.max(0, s.boostMeter - dt * 0.45);
    } else {
      s.boostMeter = Math.min(1, s.boostMeter + dt * 0.12);
    }

    const speedAbs = Math.abs(fwdSpeed);
    const speedNorm = THREE.MathUtils.clamp(speedAbs / this.maxSpeed, 0, 1);

    // Steering tightens with speed; drift loosens grip & increases turn
    s.drifting = input.drift && speedAbs > 8 && Math.abs(input.steer) > 0.1 && !s.airborne;
    const turnMul = (0.35 + speedNorm * 0.9) * (s.drifting ? this.driftTurnMul : 1);
    const steerEff = input.steer * this.turnRate * turnMul;
    s.yawRate = THREE.MathUtils.lerp(s.yawRate, steerEff, 1 - Math.exp(-8 * dt));
    s.yaw += s.yawRate * dt;

    if (s.drifting) {
      s.boostMeter = Math.min(1, s.boostMeter + dt * 0.35);
      fwdSpeed *= 1 - dt * 0.15;
    }

    // Cap
    fwdSpeed = THREE.MathUtils.clamp(fwdSpeed, -this.maxSpeed * 0.35, this.maxSpeed);
    if (!input.throttle) fwdSpeed *= 1 - this.linearDrag * dt;

    // Lateral slip
    let lat = s.velocity.dot(right);
    const grip = s.drifting ? this.lateralGrip * 0.25 : this.lateralGrip;
    lat *= Math.exp(-grip * dt);

    s.velocity.copy(forward).multiplyScalar(fwdSpeed).addScaledVector(right, lat);

    // Airborne detection via crest drop
    const waterY = avgY;
    const hullClearance = 0.35;
    const verticalVel = s.velocity.y;
    if (s.position.y > waterY + hullClearance + 0.6 && (maxY - minY > 1.0 || s.airborne)) {
      s.airborne = true;
    }
    if (s.airborne) {
      s.airTime += dt;
      s.velocity.y -= 22 * dt;
      s.position.x += s.velocity.x * dt;
      s.position.z += s.velocity.z * dt;
      s.position.y += s.velocity.y * dt;
      if (s.position.y <= waterY + hullClearance) {
        const impact = Math.min(Math.abs(s.velocity.y) / 12, 1);
        s.landingImpact = impact;
        s.velocity.y *= -0.15;
        s.position.y = waterY + hullClearance;
        s.airborne = false;
        s.airTime = 0;
        this.wasAirborne = true;
      }
    } else {
      // Buoyancy spring toward water
      const targetY = waterY + hullClearance;
      s.position.y = THREE.MathUtils.lerp(s.position.y, targetY, 1 - Math.exp(-10 * dt));
      s.velocity.y = (targetY - s.position.y) * 4;
      s.position.x += s.velocity.x * dt;
      s.position.z += s.velocity.z * dt;

      // Launch off steep faces at speed
      if (speedAbs > 18 && normal.y < 0.82 && avgY > 0.8) {
        s.airborne = true;
        s.velocity.y = 6 + speedAbs * 0.12;
      }
      this.wasAirborne = false;
    }

    // Attitude from wave normal + turn lean
    const targetPitch = -normal.z * forward.x + -normal.x * forward.z + THREE.MathUtils.clamp(-s.velocity.y * 0.04, -0.4, 0.35);
    const targetRoll = -normal.x * right.x - normal.z * right.z + -input.steer * (0.2 + speedNorm * 0.35) - (s.drifting ? input.steer * 0.25 : 0);
    s.pitch = THREE.MathUtils.lerp(s.pitch, targetPitch, 1 - Math.exp(-6 * dt));
    s.roll = THREE.MathUtils.lerp(s.roll, targetRoll, 1 - Math.exp(-7 * dt));

    s.speed = fwdSpeed;
    s.rpm = THREE.MathUtils.clamp(speedNorm * 0.75 + Math.abs(throttle) * 0.25 + (input.boost ? 0.2 : 0), 0, 1);
  }

  consumeLandingImpact(): number {
    const v = this.state.landingImpact;
    return v;
  }
}
