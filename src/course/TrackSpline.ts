/**
 * Closed racing circuit on open water — straights, hairpin, sweeper, chicane, swell-airtime section.
 */
import * as THREE from 'three';

export function createTrackCurve(): THREE.CatmullRomCurve3 {
  // Designed layout in XZ (Y=0); interesting rhythm
  const pts = [
    new THREE.Vector3(0, 0, 0), // start / finish
    new THREE.Vector3(40, 0, 8), // fast straight
    new THREE.Vector3(90, 0, 12),
    new THREE.Vector3(130, 0, -10), // into sweeper
    new THREE.Vector3(150, 0, -55), // wide sweeper
    new THREE.Vector3(130, 0, -100),
    new THREE.Vector3(80, 0, -120),
    new THREE.Vector3(30, 0, -110), // hairpin entry
    new THREE.Vector3(5, 0, -85), // hairpin apex
    new THREE.Vector3(20, 0, -55), // hairpin exit
    new THREE.Vector3(55, 0, -40), // chicane
    new THREE.Vector3(70, 0, -20),
    new THREE.Vector3(50, 0, 5),
    new THREE.Vector3(25, 0, 25), // across primary swell (airtime)
    new THREE.Vector3(-20, 0, 40),
    new THREE.Vector3(-60, 0, 20),
    new THREE.Vector3(-70, 0, -20),
    new THREE.Vector3(-40, 0, -40),
    new THREE.Vector3(-10, 0, -20),
  ];
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.35);
}

export function trackLength(curve: THREE.CatmullRomCurve3): number {
  return curve.getLength();
}

export function getTrackFrame(curve: THREE.CatmullRomCurve3, u: number): {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  yaw: number;
} {
  const position = curve.getPointAt(((u % 1) + 1) % 1);
  const tangent = curve.getTangentAt(((u % 1) + 1) % 1).normalize();
  const yaw = Math.atan2(tangent.z, tangent.x);
  return { position, tangent, yaw };
}
