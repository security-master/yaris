/**
 * The rider: a cel-shaded character rigged and animated entirely in code.
 *
 * Skeleton: a hierarchy of Groups (pelvis / spine / neck / shoulders /
 * elbows / hips / knees) with capsule & sphere meshes. No T-poses, no
 * rigid props:
 *
 *  - arms use analytic two-bone IK so the hands STAY on the handlebar
 *    grips no matter how the body leans
 *  - leans into turns (hips + spine + counter-tilted head)
 *  - weight shifts back under throttle, forward under braking
 *  - crouch impulse on hard landings, legs extended in airtime
 *  - idle bob synced to the boat's real wave motion
 *  - one-armed fist-pump celebration on finishing
 */

import * as THREE from "three";
import { makeToonMaterial } from "../render/ToonMaterial";
import { outlineHierarchy } from "../render/Outline";
import type { BoatPhysics } from "../boats/BoatPhysics";
import type { Livery } from "../boats/BoatMesh";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** capsule mesh whose origin is at its TOP (hangs from the joint) */
function limb(
  radius: number,
  length: number,
  mat: THREE.Material
): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(radius, length, 4, 10);
  geo.translate(0, -length / 2, 0);
  return new THREE.Mesh(geo, mat);
}

export interface RiderPoseInput {
  phys: BoatPhysics;
  time: number;
  celebrating: boolean;
}

export class Rider {
  readonly group: THREE.Group;

  // joints
  private pelvis = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private shoulderL = new THREE.Group();
  private shoulderR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();

  // rig constants
  private readonly upperArm = 0.27;
  private readonly foreArm = 0.28;

  // animation state
  private crouch = 0;
  private crouchVel = 0;
  private lean = 0;
  private accelLean = 0;
  private celebT = 0;

  private gripLLocal: THREE.Vector3;
  private gripRLocal: THREE.Vector3;

  constructor(livery: Livery, seatAnchor: THREE.Object3D, gripL: THREE.Object3D, gripR: THREE.Object3D) {
    this.group = new THREE.Group();
    this.group.name = "rider";
    this.group.position.copy(seatAnchor.position);

    // grip targets in rider-root space (rider root == seat anchor)
    this.gripLLocal = gripL.position.clone().sub(seatAnchor.position);
    this.gripRLocal = gripR.position.clone().sub(seatAnchor.position);

    const suit = makeToonMaterial({ color: livery.trim, specular: 0.35, rim: 0.75, shininess: 40 });
    const suitLight = makeToonMaterial({ color: livery.deck, specular: 0.3, rim: 0.6 });
    const skin = makeToonMaterial({ color: 0xf2b58c, specular: 0.15, rim: 0.5 });
    const helmet = makeToonMaterial({ color: livery.hull, specular: 0.9, shininess: 130, rim: 0.9, matcap: 0.18 });
    const visor = makeToonMaterial({ color: 0x2a3d66, specular: 1.0, shininess: 200, rim: 0.9, matcap: 0.5 });
    const glove = makeToonMaterial({ color: 0x22284a, specular: 0.2, rim: 0.4 });

    // ---------------- pelvis / torso / head ----------------
    this.pelvis.position.set(0, 0.12, 0);
    this.group.add(this.pelvis);

    const hipsMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), suit);
    hipsMesh.scale.set(1.25, 0.85, 1.0);
    this.pelvis.add(hipsMesh);

    this.spine.position.set(0, 0.13, 0.02);
    this.pelvis.add(this.spine);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.26, 6, 12), suit);
    torso.position.set(0, 0.2, 0);
    torso.scale.set(1.15, 1, 0.82);
    this.spine.add(torso);
    // chest accent panel
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.14, 6, 12), suitLight);
    chest.position.set(0, 0.24, 0.055);
    chest.scale.set(0.95, 0.8, 0.6);
    this.spine.add(chest);

    this.neck.position.set(0, 0.42, 0.02);
    this.spine.add(this.neck);

    const headBase = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), skin);
    headBase.position.set(0, 0.05, 0);
    this.neck.add(headBase);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), helmet);
    helm.position.set(0, 0.12, 0.01);
    helm.scale.set(1, 1.05, 1.08);
    this.neck.add(helm);
    const visorMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 14, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.34),
      visor
    );
    visorMesh.position.set(0, 0.12, 0.028);
    visorMesh.scale.set(1, 1.05, 1.06);
    this.neck.add(visorMesh);

    // ---------------- arms ----------------
    for (const side of [-1, 1] as const) {
      const shoulder = side < 0 ? this.shoulderL : this.shoulderR;
      const elbow = side < 0 ? this.elbowL : this.elbowR;
      shoulder.position.set(0.205 * side, 0.36, 0.02);
      this.spine.add(shoulder);
      shoulder.add(limb(0.062, this.upperArm, suit));
      elbow.position.set(0, -this.upperArm, 0);
      shoulder.add(elbow);
      elbow.add(limb(0.052, this.foreArm, suitLight));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 8), glove);
      hand.position.set(0, -this.foreArm, 0);
      elbow.add(hand);
    }

    // ---------------- legs (seated, feet on the footwells) ----------------
    for (const side of [-1, 1] as const) {
      const hip = side < 0 ? this.hipL : this.hipR;
      const knee = side < 0 ? this.kneeL : this.kneeR;
      hip.position.set(0.11 * side, -0.02, 0.05);
      this.pelvis.add(hip);
      hip.add(limb(0.075, 0.34, suit));
      knee.position.set(0, -0.34, 0);
      hip.add(knee);
      knee.add(limb(0.06, 0.32, suitLight));
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), glove);
      boot.position.set(0, -0.34, 0.06);
      knee.add(boot);
    }

    // ink outlines for the whole character, slightly thinner than the boat
    outlineHierarchy(this.group, { widthPx: 1.9 });
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.name.endsWith("_outline")) {
        o.userData.noOutline = true; // boat pass must not re-outline us
      }
    });
  }

  // ------------------------------------------------------------------
  // Two-bone IK: place the elbow explicitly, then derive joint rotations
  // from segment directions. All math in rider-root space.
  // ------------------------------------------------------------------
  private static _S = new THREE.Vector3();
  private static _D = new THREE.Vector3();
  private static _pole = new THREE.Vector3();
  private static _axis = new THREE.Vector3();
  private static _elbowPos = new THREE.Vector3();
  private static _upperDir = new THREE.Vector3();
  private static _foreDir = new THREE.Vector3();
  private static _qA = new THREE.Quaternion();
  private static _qB = new THREE.Quaternion();
  private static _qParent = new THREE.Quaternion();
  private static _NEG_Y = new THREE.Vector3(0, -1, 0);

  private solveArm(shoulder: THREE.Group, elbow: THREE.Group, targetRider: THREE.Vector3, side: number): void {
    const a = this.upperArm;
    const b = this.foreArm;

    // shoulder position in rider-root space
    Rider._S.copy(shoulder.position);
    this.spine.localToWorld(Rider._S);
    this.group.worldToLocal(Rider._S);

    Rider._D.copy(targetRider).sub(Rider._S);
    let d = Rider._D.length();
    d = THREE.MathUtils.clamp(d, Math.abs(a - b) + 0.01, (a + b) * 0.995);
    Rider._D.normalize();

    // angle between the chain axis and the upper arm (law of cosines)
    const cosShoulder = (a * a + d * d - b * b) / (2 * a * d);
    const bend = Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));

    // elbow pole: out to the side, down and a little back
    Rider._pole.set(side * 0.85, -0.5, -0.2).normalize();
    Rider._axis.crossVectors(Rider._D, Rider._pole);
    if (Rider._axis.lengthSq() < 1e-8) Rider._axis.set(0, 0, 1);
    Rider._axis.normalize();

    // upper-arm direction: chain dir rotated by 'bend' toward the pole
    Rider._qA.setFromAxisAngle(Rider._axis, bend);
    Rider._upperDir.copy(Rider._D).applyQuaternion(Rider._qA);

    Rider._elbowPos.copy(Rider._S).addScaledVector(Rider._upperDir, a);
    Rider._foreDir.copy(targetRider).sub(Rider._elbowPos).normalize();

    // shoulder orientation (rider space): local -Y -> upperDir
    const qShoulderRS = new THREE.Quaternion().setFromUnitVectors(Rider._NEG_Y, Rider._upperDir);

    // to spine-local: qLocal = qSpineWorld^-1 * qRootWorld * qRS
    this.group.getWorldQuaternion(Rider._qB); // root -> world
    const qWorld = Rider._qB.clone().multiply(qShoulderRS);
    this.spine.getWorldQuaternion(Rider._qParent);
    shoulder.quaternion.copy(Rider._qParent.clone().invert().multiply(qWorld));

    // elbow local rotation: rotate the forearm from upperDir to foreDir
    // (both known in rider space; express relative to the upper arm)
    const qElbowRS = new THREE.Quaternion().setFromUnitVectors(Rider._upperDir, Rider._foreDir);
    // elbow local = qShoulderRS^-1 * qElbowRS * qShoulderRS  (change of basis)
    elbow.quaternion
      .copy(qShoulderRS)
      .invert()
      .multiply(qElbowRS)
      .multiply(qShoulderRS);
  }

  update(dt: number, input: RiderPoseInput): void {
    const { phys, time, celebrating } = input;
    const speedT = THREE.MathUtils.clamp(Math.abs(phys.speed) / 33, 0, 1);

    // ---------------- derive pose parameters ----------------
    const leanTarget =
      phys.controls.steer * (0.30 + speedT * 0.35) * (phys.driftActive ? 1.5 : 1);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 6);

    const accelTarget =
      phys.controls.throttle * 0.45 - phys.controls.brake * 0.6 + (phys.boostTime > 0 ? 0.3 : 0);
    this.accelLean += (accelTarget - this.accelLean) * Math.min(1, dt * 4);

    // crouch spring: slams push it down, it recovers with overshoot
    if (phys.slam) this.crouchVel += phys.slam.strength * 9;
    const airTarget = phys.airborne ? -0.55 : 0;
    this.crouchVel += (airTarget - this.crouch) * dt * 26 - this.crouchVel * dt * 9;
    this.crouch += this.crouchVel * dt;
    this.crouch = THREE.MathUtils.clamp(this.crouch, -0.7, 1);

    // idle bob synced to the actual water motion under the boat
    const bob = Math.sin(time * 2.1 + phys.position.x * 0.11) * 0.014 * (1 - speedT * 0.6);

    if (celebrating) this.celebT += dt;
    else this.celebT = 0;

    // ---------------- apply to the skeleton ----------------
    const crouchAmt = Math.max(0, this.crouch);
    const stretchAmt = Math.max(0, -this.crouch);

    this.pelvis.position.y = 0.12 - crouchAmt * 0.055 + stretchAmt * 0.05 + bob;
    this.pelvis.rotation.set(
      -this.accelLean * 0.18 + crouchAmt * 0.1,
      0,
      -this.lean * 0.35
    );

    this.spine.rotation.set(
      0.48 - this.accelLean * 0.34 + crouchAmt * 0.38 - stretchAmt * 0.18,
      -this.lean * 0.22,
      -this.lean * 0.42
    );

    // head: look into the corner, counter-tilt against the lean
    this.neck.rotation.set(
      -0.32 + this.accelLean * 0.15 - crouchAmt * 0.22,
      this.lean * 0.55,
      this.lean * 0.5
    );

    // legs: seated; knees pump with crouch
    const thigh = -1.28 + crouchAmt * 0.2 - stretchAmt * 0.35;
    const shin = 1.15 - crouchAmt * 0.12 + stretchAmt * 0.4;
    this.hipL.rotation.set(thigh, 0.12, 0.1 + this.lean * 0.12);
    this.hipR.rotation.set(thigh, -0.12, -0.1 + this.lean * 0.12);
    this.kneeL.rotation.set(shin, 0, 0);
    this.kneeR.rotation.set(shin, 0, 0);

    // ---------------- arms ----------------
    this.group.updateWorldMatrix(true, true);
    if (celebrating) {
      // left hand stays on the bar, right fist pumps the sky
      this.solveArm(this.shoulderL, this.elbowL, this.gripLLocal, -1);
      const pump = Math.sin(this.celebT * 6.5);
      this.shoulderR.rotation.set(Math.PI * 0.92 + pump * 0.18, 0, -0.5 + pump * 0.1);
      this.elbowR.rotation.set(-0.45 - pump * 0.25, 0, 0);
      // head up, chest open
      this.neck.rotation.x = -0.55;
      this.spine.rotation.x = 0.18;
    } else {
      this.solveArm(this.shoulderL, this.elbowL, this.gripLLocal, -1);
      this.solveArm(this.shoulderR, this.elbowR, this.gripRLocal, 1);
    }
  }
}
