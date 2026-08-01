/**
 * A race boat: procedural mesh + physics + (later) rider.
 * Owns nothing about race rules; RaceManager tracks laps/progress.
 */

import * as THREE from "three";
import { BoatPhysics } from "./BoatPhysics";
import { buildBoatMesh, BoatMeshResult, Livery } from "./BoatMesh";
import { outlineHierarchy } from "../render/Outline";
import { BoatWakeEmitter } from "../water/FoamSplats";
import { Rider } from "../riders/Rider";

export class Boat {
  readonly physics: BoatPhysics;
  readonly group: THREE.Group;
  readonly meshParts: BoatMeshResult;
  readonly livery: Livery;
  readonly index: number;
  readonly isPlayer: boolean;
  readonly wake = new BoatWakeEmitter();
  readonly rider: Rider;
  /** set by Game when this boat finishes the race */
  celebrating = false;

  constructor(
    scene: THREE.Scene,
    livery: Livery,
    index: number,
    isPlayer: boolean,
    x: number,
    z: number,
    yaw: number
  ) {
    this.livery = livery;
    this.index = index;
    this.isPlayer = isPlayer;
    this.physics = new BoatPhysics(x, z, yaw);
    this.meshParts = buildBoatMesh(livery);
    this.group = this.meshParts.group;
    this.rider = new Rider(livery, this.meshParts.seatAnchor, this.meshParts.gripL, this.meshParts.gripR);
    this.group.add(this.rider.group);
    outlineHierarchy(this.group, { widthPx: 2.4 });
    scene.add(this.group);
    this.syncVisual();
  }

  /** copy the physics transform onto the mesh */
  syncVisual(): void {
    this.group.position.copy(this.physics.position);
    this.group.quaternion.copy(this.physics.quaternion);
  }

  update(dt: number, time: number): void {
    this.syncVisual();
    this.rider.update(dt, { phys: this.physics, time, celebrating: this.celebrating });
  }
}
