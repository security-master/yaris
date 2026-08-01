import * as THREE from 'three';
import { createBoatVisual } from './BoatMesh';
import { BoatPhysics, type BoatInput } from './BoatPhysics';
import { Rider } from '../riders/Rider';
import { RiderAnim } from '../riders/RiderAnim';
import { Palette } from '../palette';

export class Boat {
  readonly id: number;
  readonly isPlayer: boolean;
  readonly name: string;
  readonly group = new THREE.Group();
  readonly physics = new BoatPhysics();
  readonly rider: Rider;
  readonly riderAnim = new RiderAnim();
  readonly color: THREE.Color;
  private visual;

  constructor(id: number, isPlayer: boolean, name: string, hullColor: number) {
    this.id = id;
    this.isPlayer = isPlayer;
    this.name = name;
    this.color = new THREE.Color(hullColor);
    const accent = isPlayer ? Palette.playerAccent : Palette.metalBand;
    this.visual = createBoatVisual(hullColor, accent);
    this.group.add(this.visual.group);
    this.rider = new Rider(hullColor, accent);
    this.group.add(this.rider.root);
  }

  spawn(x: number, z: number, yaw: number): void {
    this.physics.setPose(x, z, yaw);
    this.syncTransform();
  }

  fixedUpdate(dt: number, t: number, input: BoatInput): void {
    this.physics.fixedUpdate(dt, t, input);
  }

  updateVisual(dt: number, t: number, throttleInput: number): void {
    this.syncTransform();
    this.riderAnim.update(dt, this.physics.state, throttleInput, t);
    this.riderAnim.apply(this.rider);
  }

  private syncTransform(): void {
    const s = this.physics.state;
    this.group.position.copy(s.position);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = -s.yaw + Math.PI / 2;
    this.group.rotation.x = s.pitch;
    this.group.rotation.z = s.roll;
  }
}
