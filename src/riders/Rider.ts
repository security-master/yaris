/**
 * Procedural cel-shaded rider with hierarchical joints animated in code.
 */
import * as THREE from 'three';
import { createCelMaterial } from '../rendering/CelMaterial';
import { addInvertedHullOutlines } from '../rendering/Outline';
import { Palette } from '../palette';

export interface RiderPose {
  lean: number; // -1..1 roll lean
  pitchLean: number; // accel/brake
  throttle: number;
  crouch: number;
  bob: number;
  celebrate: number;
}

export class Rider {
  readonly root = new THREE.Group();
  readonly outlines: THREE.Mesh[];
  private hips: THREE.Group;
  private torso: THREE.Group;
  private head: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;

  constructor(suitColor: THREE.ColorRepresentation, accent: THREE.ColorRepresentation) {
    this.root.name = 'Rider';

    const suit = createCelMaterial({ color: suitColor, accent, rimPower: 2.4, matcapMix: 0.2, bandBias: 0.9 });
    const skin = createCelMaterial({ color: 0xf0c8a0, accent: 0xffe0c0, rimColor: 0xffd0a0, matcapMix: 0.12 });
    const helm = createCelMaterial({ color: accent, accent: suitColor, matcapMix: 0.35, rimPower: 2.2 });

    this.hips = new THREE.Group();
    this.hips.position.set(0.1, 0.78, 0);
    this.root.add(this.hips);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.35), suit);
    pelvis.userData.celShaded = true;
    this.hips.add(pelvis);

    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.2, 0);
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.32), suit);
    chest.position.y = 0.28;
    chest.userData.celShaded = true;
    this.torso.add(chest);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.65, 0);
    this.torso.add(this.head);
    const helmMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), helm);
    helmMesh.scale.set(1, 1.05, 1.1);
    helmMesh.userData.celShaded = true;
    this.head.add(helmMesh);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.12, 0.08),
      createCelMaterial({ color: 0x1a2030, accent: 0x4af0ff, matcapMix: 0.5 }),
    );
    visor.position.set(0, 0, 0.16);
    visor.userData.celShaded = true;
    this.head.add(visor);

    this.armL = this.makeArm(suit, skin, -1);
    this.armR = this.makeArm(suit, skin, 1);
    this.torso.add(this.armL, this.armR);

    this.legL = this.makeLeg(suit, -1);
    this.legR = this.makeLeg(suit, 1);
    this.hips.add(this.legL, this.legR);

    this.outlines = addInvertedHullOutlines(this.root, 0.95);
  }

  private makeArm(suit: THREE.Material, skin: THREE.Material, side: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(side * 0.32, 0.45, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), suit);
    upper.position.y = -0.15;
    upper.userData.celShaded = true;
    g.add(upper);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), skin);
    lower.position.y = -0.42;
    lower.userData.celShaded = true;
    g.add(lower);
    return g;
  }

  private makeLeg(suit: THREE.Material, side: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(side * 0.14, -0.05, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.18), suit);
    upper.position.y = -0.18;
    upper.userData.celShaded = true;
    g.add(upper);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.16), suit);
    lower.position.y = -0.48;
    lower.userData.celShaded = true;
    g.add(lower);
    return g;
  }

  applyPose(pose: RiderPose): void {
    const lean = pose.lean;
    const crouch = pose.crouch;
    const bob = pose.bob;
    const cel = pose.celebrate;

    this.root.position.y = bob * 0.04 - crouch * 0.12;
    this.hips.rotation.z = lean * 0.45;
    this.hips.rotation.x = pose.pitchLean * 0.25 - crouch * 0.35;
    this.torso.rotation.z = lean * 0.25;
    this.torso.rotation.x = pose.pitchLean * 0.15 + cel * -0.4;
    this.head.rotation.z = -lean * 0.15;
    this.head.rotation.x = cel * -0.3;

    // Arms work the throttle / bars
    const throttleReach = 0.4 + pose.throttle * 0.5;
    this.armL.rotation.x = -0.9 - throttleReach * 0.3 + cel * -1.2;
    this.armR.rotation.x = -0.9 - throttleReach * 0.35 + cel * -1.2;
    this.armL.rotation.z = 0.35 + lean * 0.2;
    this.armR.rotation.z = -0.35 + lean * 0.2;
    this.armL.rotation.y = cel * 0.8;
    this.armR.rotation.y = -cel * 0.8;

    this.legL.rotation.x = 0.55 + crouch * 0.5;
    this.legR.rotation.x = 0.55 + crouch * 0.5;
    this.legL.rotation.z = 0.08 + lean * 0.1;
    this.legR.rotation.z = -0.08 + lean * 0.1;
  }
}
