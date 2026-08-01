/**
 * A race boat: procedural mesh + physics + (later) rider.
 * Owns nothing about race rules; RaceManager tracks laps/progress.
 */

import * as THREE from "three";
import { BoatPhysics } from "./BoatPhysics";
import { buildBoatMesh, BoatMeshResult, Livery } from "./BoatMesh";
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
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.add(this.group);
    this.syncVisual();
  }

  setHullColor(hex: number): void {
    this.meshParts.setHullColor(hex);
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
