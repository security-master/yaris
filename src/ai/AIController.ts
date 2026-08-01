/**
 * AI racers: spline-following with lookahead steering, per-racer
 * personality, gentle rubber-banding, boat-boat avoidance, and honest
 * mistakes — they sometimes take a bad line, so beating them is earned.
 */

import * as THREE from "three";
import type { Boat } from "../boats/Boat";
import type { Course } from "../race/Course";
import type { RaceManager, RacerState } from "../race/RaceManager";
import { mulberry32 } from "../render/Sky";

export interface AIPersonality {
  name: string;
  /** cornering competence 0..1: entry speed judgement, apex accuracy */
  skill: number;
  /** willingness to hold throttle and drift 0..1 */
  aggression: number;
  /** frequency of wobbles / bad lines 0..1 */
  erratic: number;
  /** preferred lateral offset from the racing line, metres */
  lineBias: number;
}

export const AI_PERSONALITIES: AIPersonality[] = [
  { name: "RIPTIDE", skill: 0.93, aggression: 0.55, erratic: 0.08, lineBias: -1.6 }, // the clean one
  { name: "WASP", skill: 0.78, aggression: 0.62, erratic: 0.85, lineBias: 2.4 }, // the wild one
  { name: "CORSAIR", skill: 0.86, aggression: 0.95, erratic: 0.28, lineBias: 0.6 }, // the shark
];

const _target = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _toOther = new THREE.Vector3();

export class AIController {
  private wobbleTimer: number;
  private wobbleActive = 0;
  private wobbleSteer = 0;
  private rng: () => number;

  constructor(
    readonly boat: Boat,
    readonly personality: AIPersonality,
    seed: number
  ) {
    this.rng = mulberry32(seed * 7919 + 17);
    this.wobbleTimer = 4 + this.rng() * 8;
  }

  update(
    dt: number,
    course: Course,
    race: RaceManager,
    state: RacerState,
    allBoats: Boat[],
    playerState: RacerState | null
  ): void {
    const phys = this.boat.physics;
    const c = phys.controls;
    const p = this.personality;
    const speed = Math.abs(phys.speed);

    // ------------------------------------------------------------------
    // Lookahead target on the spline (+ personal lateral bias)
    // ------------------------------------------------------------------
    const lookMetres = 16 + speed * (0.75 + p.skill * 0.3);
    const lookT = (state.param + lookMetres / course.length) % 1;
    course.pointAtRel(lookT, _target);
    course.tangentAtRel(lookT, _tan);
    // wander the bias slowly so AI lines breathe instead of railroading
    const bias = p.lineBias + Math.sin(state.progress * 21 + this.boat.index * 3.1) * 1.7;
    _target.x += -_tan.z * bias;
    _target.z += _tan.x * bias;

    // ------------------------------------------------------------------
    // Avoidance: steer around boats ahead, lift slightly if boxed in
    // ------------------------------------------------------------------
    _fwd.set(0, 0, 1).applyQuaternion(phys.quaternion);
    let avoid = 0;
    let boxed = false;
    for (const other of allBoats) {
      if (other === this.boat) continue;
      _toOther.copy(other.physics.position).sub(phys.position);
      const dist = Math.hypot(_toOther.x, _toOther.z);
      if (dist > 14) continue;
      const ahead = _toOther.x * _fwd.x + _toOther.z * _fwd.z;
      if (ahead < 0.5) continue; // only care about boats in front
      const side = _toOther.x * _fwd.z - _toOther.z * _fwd.x;
      const closeness = 1 - dist / 14;
      avoid += (side > 0 ? -1 : 1) * closeness * 0.85;
      if (dist < 6.5) boxed = true;
    }

    // ------------------------------------------------------------------
    // Steering toward the target
    // ------------------------------------------------------------------
    const dx = _target.x - phys.position.x;
    const dz = _target.z - phys.position.z;
    const targetYaw = Math.atan2(dx, dz);
    let err = targetYaw - phys.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    let steer = THREE.MathUtils.clamp(err * (1.7 + p.skill * 0.8), -1, 1);

    // mistakes: periodic wobbles scaled by how erratic this racer is
    this.wobbleTimer -= dt;
    if (this.wobbleTimer <= 0) {
      this.wobbleTimer = 5 + this.rng() * (16 - p.erratic * 10);
      if (this.rng() < 0.25 + p.erratic * 0.6) {
        this.wobbleActive = 0.7 + this.rng() * 0.9;
        this.wobbleSteer = (this.rng() - 0.5) * (0.4 + p.erratic * 0.5);
      }
    }
    if (this.wobbleActive > 0) {
      this.wobbleActive -= dt;
      steer += this.wobbleSteer;
    }

    steer = THREE.MathUtils.clamp(steer + avoid, -1, 1);
    c.steer = steer;

    // ------------------------------------------------------------------
    // Throttle: read curvature ahead, brake for hairpins, lift for chicanes
    // ------------------------------------------------------------------
    const preview = race.cornerPreview(state); // -1..1
    const sharp = Math.abs(preview);
    // desired speed falls with corner sharpness; skill carries more speed
    const cornerSpeed = 34 - sharp * (26 - p.skill * 9 - p.aggression * 4);
    let throttle = speed < cornerSpeed ? 1 : 0.25;
    let brake = 0;
    if (speed > cornerSpeed + 6) {
      brake = 0.75;
      throttle = 0;
    }
    if (boxed) throttle = Math.min(throttle, 0.72);

    // drift through sharp corners when carrying speed (aggression-gated)
    c.drift = sharp > 0.5 && speed > 17 && p.aggression > 0.5 + this.rng() * 0.05;

    // ------------------------------------------------------------------
    // Rubber-banding: stay in the fight without feeling scripted
    // ------------------------------------------------------------------
    if (playerState && !state.finished) {
      const gap = playerState.progress - state.progress; // + = player ahead
      const band = THREE.MathUtils.clamp(gap * 2.6, -0.09, 0.13);
      phys.thrustMul = 1 + band;
    } else {
      phys.thrustMul = 1;
    }

    c.throttle = throttle;
    c.brake = brake;
  }
}
