/**
 * Soft "rail" that keeps racers near the racing line.
 * Beyond OUTER metres, a strong centripetal force + throttle cut
 * pulls the boat back — you can take a racing line, but you can't
 * wander into open ocean.
 */

import * as THREE from "three";
import type { Course } from "./Course";
import type { BoatPhysics } from "../boats/BoatPhysics";

const INNER = 14; // free racing line width
const OUTER = 28; // hard soft-wall
const PULL = 42;
const _line = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _to = new THREE.Vector3();

export class TrackRail {
  constructor(private course: Course) {}

  /** Returns lateral distance from the racing line (metres). */
  apply(phys: BoatPhysics, relParam: number, dt: number): number {
    this.course.pointAtRel(relParam, _line);
    this.course.tangentAtRel(relParam, _tan);
    _tan.y = 0;
    _tan.normalize();

    _to.set(phys.position.x - _line.x, 0, phys.position.z - _line.z);
    // lateral component (signed): left negative via cross with forward
    const lateral = _to.x * _tan.z - _to.z * _tan.x;
    const absLat = Math.abs(lateral);

    if (absLat > INNER) {
      const over = absLat - INNER;
      const t = THREE.MathUtils.clamp(over / (OUTER - INNER), 0, 1);
      // direction back toward the line
      const sideX = _tan.z * Math.sign(lateral);
      const sideZ = -_tan.x * Math.sign(lateral);
      phys.velocity.x -= sideX * PULL * t * t * dt;
      phys.velocity.z -= sideZ * PULL * t * t * dt;
      // choke throttle authority when far outside
      phys.thrustMul = Math.min(phys.thrustMul, 1 - t * 0.85);
      if (absLat > OUTER) {
        // hard clamp position onto the outer ring
        const push = absLat - OUTER;
        phys.position.x -= sideX * push;
        phys.position.z -= sideZ * push;
      }
    }
    return lateral;
  }
}
