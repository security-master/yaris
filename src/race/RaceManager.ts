/**
 * Race logic: lap counting, gate checkpoints, wrong-way detection,
 * live positions, lap/split times, and finish results.
 *
 * Progress is continuous (lap + spline param), so positions are exact
 * at every moment and rubber-banding AI can read precise gaps.
 */

import * as THREE from "three";
import type { Boat } from "../boats/Boat";
import type { Course } from "./Course";

export const TOTAL_LAPS = 3;
const GATE_CAPTURE_RADIUS = 24; // metres from gate centre that counts

export interface RacerState {
  boat: Boat;
  param: number;
  /** continuous progress: laps + param (starts at 0) */
  progress: number;
  lap: number; // 1-based current lap
  nextGate: number;
  missedGates: number;
  gateFlash: number; // seconds remaining of "gate passed" flash
  wrongWayTimer: number;
  wrongWay: boolean;
  finished: boolean;
  finishTime: number;
  lapTimes: number[];
  lapStartTime: number;
  position: number; // 1..4, updated every frame
}

export class RaceManager {
  readonly course: Course;
  readonly racers: RacerState[] = [];
  raceTime = 0;
  running = false;
  /** set true the moment the player finishes */
  playerFinished = false;

  constructor(course: Course) {
    this.course = course;
  }

  addBoat(boat: Boat): RacerState {
    const p = boat.physics.position;
    const state: RacerState = {
      boat,
      param: this.course.projectParamRel(p.x, p.z, 0),
      progress: 0,
      lap: 1,
      nextGate: 0,
      missedGates: 0,
      gateFlash: 0,
      wrongWayTimer: 0,
      wrongWay: false,
      finished: false,
      finishTime: 0,
      lapTimes: [],
      lapStartTime: 0,
      position: this.racers.length + 1,
    };
    // grid starts just behind the line: progress starts slightly negative
    const t = state.param;
    state.progress = t > 0.5 ? t - 1 : t;
    this.racers.push(state);
    return state;
  }

  start(): void {
    this.running = true;
    this.raceTime = 0;
    for (const r of this.racers) {
      r.lapStartTime = 0;
    }
  }

  private _gatePos = new THREE.Vector3();

  update(dt: number): void {
    if (!this.running) return;
    this.raceTime += dt;

    for (const r of this.racers) {
      if (r.finished) {
        r.gateFlash = Math.max(0, r.gateFlash - dt);
        continue;
      }
      const pos = r.boat.physics.position;
      const newParam = this.course.projectParamRel(pos.x, pos.z, r.param);
      let delta = newParam - r.param;
      if (delta > 0.5) delta -= 1;
      if (delta < -0.5) delta += 1;
      r.param = newParam;
      r.progress += delta;
      r.gateFlash = Math.max(0, r.gateFlash - dt);

      // ---- lap bookkeeping ----
      const lapNow = Math.floor(r.progress) + 1;
      if (lapNow > r.lap) {
        r.lapTimes.push(this.raceTime - r.lapStartTime);
        r.lapStartTime = this.raceTime;
        r.lap = lapNow;
        if (lapNow > TOTAL_LAPS) {
          r.finished = true;
          // +3s penalty per missed gate keeps the gates honest
          r.finishTime = this.raceTime + r.missedGates * 3;
          if (r.boat.isPlayer) this.playerFinished = true;
        }
      } else if (lapNow < r.lap) {
        r.lap = lapNow; // drove backwards over the line
      }

      // ---- gate checkpoints ----
      const gateT = this.course.gateParams[r.nextGate];
      const lapFrac = r.progress - Math.floor(r.progress);
      let ahead = gateT - lapFrac;
      if (ahead < -0.5) ahead += 1;
      if (ahead > 0.5) ahead -= 1;
      // just crossed the gate's param line going forward
      if (ahead < 0 && ahead > -0.06 && delta > 0) {
        this.course.pointAtRel(gateT, this._gatePos);
        const d = Math.hypot(this._gatePos.x - pos.x, this._gatePos.z - pos.z);
        if (d <= GATE_CAPTURE_RADIUS) {
          r.gateFlash = 0.8;
        } else {
          r.missedGates++;
        }
        r.nextGate = (r.nextGate + 1) % this.course.gateParams.length;
      }

      // ---- wrong way ----
      const speed = Math.abs(r.boat.physics.speed);
      if (delta < -1e-6 && speed > 4) {
        r.wrongWayTimer += dt;
      } else if (delta > 1e-6) {
        r.wrongWayTimer = 0;
      }
      r.wrongWay = r.wrongWayTimer > 1.4;
    }

    // ---- live positions ----
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    sorted.forEach((r, i) => (r.position = i + 1));
  }

  /**
   * Corner preview for the HUD: signed curvature a short distance ahead.
   * Negative = left turn, positive = right turn, magnitude 0..1.
   */
  private _ta = new THREE.Vector3();
  private _tb = new THREE.Vector3();
  private _tc = new THREE.Vector3();

  cornerPreview(r: RacerState): number {
    const t0 = r.param;
    const t1 = (t0 + 90 / this.course.length) % 1;
    const t2 = (t0 + 170 / this.course.length) % 1;
    const a = this.course.tangentAtRel(t0, this._ta);
    const b = this.course.tangentAtRel(t1, this._tb);
    const c = this.course.tangentAtRel(t2, this._tc);
    const cross1 = a.x * b.z - a.z * b.x;
    const cross2 = b.x * c.z - b.z * c.x;
    const turn = (cross1 + cross2) * -1.6;
    return THREE.MathUtils.clamp(turn, -1, 1);
  }
}
