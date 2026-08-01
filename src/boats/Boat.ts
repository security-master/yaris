/**
 * A race boat: procedural mesh + physics + (later) rider.
 * Owns nothing about race rules; RaceManager tracks laps/progress.
 */

import * as THREE from "three";
import { BoatPhysics } from "./BoatPhysics";
import { buildBoatMesh, BoatMeshResult, Livery } from "./BoatMesh";
import { outlineHierarchy } from "../render/Outline";
import { BoatWakeEmitter } from "../water/FoamSplats";

export class Boat {
  readonly physics: BoatPhysics;
  readonly group: THREE.Group;
  readonly meshParts: BoatMeshResult;
  readonly livery: Livery;
  readonly index: number;
  readonly isPlayer: boolean;
  readonly wake = new BoatWakeEmitter();

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
    outlineHierarchy(this.group, { widthPx: 2.4 });
    scene.add(this.group);
    this.syncVisual();
  }

  /** copy the physics transform onto the mesh */
  syncVisual(): void {
    this.group.position.copy(this.physics.position);
    this.group.quaternion.copy(this.physics.quaternion);
  }

  update(dt: number): void {
    this.syncVisual();
  }
}
