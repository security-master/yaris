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
  private forearmL: THREE.Group;
  private forearmR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private shinL: THREE.Group;
  private shinR: THREE.Group;

  constructor(suitColor: THREE.ColorRepresentation, accent: THREE.ColorRepresentation) {
    this.root.name = 'Rider';

    const suit = createCelMaterial({ color: suitColor, accent, rimPower: 2.4, matcapMix: 0.2, bandBias: 0.9 });
    const glove = createCelMaterial({ color: Palette.ink, accent, rimColor: 0x504858, matcapMix: 0.18 });
    const helm = createCelMaterial({ color: accent, accent: suitColor, matcapMix: 0.35, rimPower: 2.2 });
    const visorMat = createCelMaterial({ color: 0x111a28, accent: 0x62ecff, matcapMix: 0.55, rimPower: 1.9 });
    const barMat = createCelMaterial({ color: 0x2a2430, accent: 0xb7c7d8, matcapMix: 0.25 });

    this.hips = new THREE.Group();
    this.hips.position.set(-0.3, 0.82, 0);
    this.root.add(this.hips);

    const pelvis = makeCelMesh(new THREE.BoxGeometry(0.46, 0.24, 0.44), suit, 'RiderPelvis');
    pelvis.rotation.z = -0.14;
    this.hips.add(pelvis);

    this.torso = new THREE.Group();
    this.torso.position.set(0.08, 0.2, 0);
    this.hips.add(this.torso);
    const chest = makeCelMesh(new THREE.BoxGeometry(0.38, 0.6, 0.5), suit, 'RiderChest');
    chest.position.set(0.06, 0.29, 0);
    chest.rotation.z = -0.12;
    this.torso.add(chest);

    const chestStripe = makeCelMesh(new THREE.BoxGeometry(0.04, 0.45, 0.54), helm, 'RiderChestStripe');
    chestStripe.position.set(0.26, 0.31, 0);
    chestStripe.rotation.z = -0.12;
    this.torso.add(chestStripe);

    this.head = new THREE.Group();
    this.head.position.set(0.18, 0.78, 0);
    this.torso.add(this.head);
    const helmMesh = makeCelMesh(new THREE.SphereGeometry(0.24, 14, 10), helm, 'RiderHelmet');
    helmMesh.scale.set(1.18, 1.08, 1.0);
    this.head.add(helmMesh);
    const visor = makeCelMesh(new THREE.BoxGeometry(0.1, 0.13, 0.34), visorMat, 'RiderVisor');
    visor.position.set(0.22, 0.02, 0);
    this.head.add(visor);
    const chinGuard = makeCelMesh(new THREE.BoxGeometry(0.16, 0.13, 0.38), helm, 'RiderChinGuard');
    chinGuard.position.set(0.16, -0.12, 0);
    this.head.add(chinGuard);

    const armsL = this.makeArm(suit, glove, -1);
    const armsR = this.makeArm(suit, glove, 1);
    this.armL = armsL.upper;
    this.forearmL = armsL.forearm;
    this.armR = armsR.upper;
    this.forearmR = armsR.forearm;
    this.torso.add(this.armL, this.armR);

    const legsL = this.makeLeg(suit, glove, -1);
    const legsR = this.makeLeg(suit, glove, 1);
    this.legL = legsL.thigh;
    this.shinL = legsL.shin;
    this.legR = legsR.thigh;
    this.shinR = legsR.shin;
    this.hips.add(this.legL, this.legR);

    this.root.add(this.makeHandlebars(barMat, glove));

    this.outlines = addInvertedHullOutlines(this.root, 0.95);
    for (const outline of this.outlines) outline.userData.celShaded = true;
  }

  private makeArm(suit: THREE.Material, glove: THREE.Material, side: number): { upper: THREE.Group; forearm: THREE.Group } {
    const upper = new THREE.Group();
    upper.position.set(0.08, 0.52, side * 0.29);

    const bicep = makeCelMesh(new THREE.BoxGeometry(0.34, 0.13, 0.14), suit, `RiderUpperArm${side}`);
    bicep.position.set(0.17, -0.02, side * 0.01);
    upper.add(bicep);

    const forearm = new THREE.Group();
    forearm.position.set(0.34, -0.04, side * 0.01);
    upper.add(forearm);

    const sleeve = makeCelMesh(new THREE.BoxGeometry(0.36, 0.11, 0.12), suit, `RiderForearm${side}`);
    sleeve.position.set(0.18, -0.02, 0);
    forearm.add(sleeve);

    const hand = makeCelMesh(new THREE.SphereGeometry(0.07, 8, 6), glove, `RiderGlove${side}`);
    hand.scale.set(1.15, 0.85, 0.85);
    hand.position.set(0.39, -0.02, 0);
    forearm.add(hand);

    return { upper, forearm };
  }

  private makeLeg(suit: THREE.Material, boot: THREE.Material, side: number): { thigh: THREE.Group; shin: THREE.Group } {
    const thigh = new THREE.Group();
    thigh.position.set(-0.12, -0.04, side * 0.17);

    const upper = makeCelMesh(new THREE.BoxGeometry(0.38, 0.16, 0.18), suit, `RiderThigh${side}`);
    upper.position.set(0.18, -0.08, side * 0.03);
    thigh.add(upper);

    const shin = new THREE.Group();
    shin.position.set(0.35, -0.14, side * 0.03);
    thigh.add(shin);

    const lower = makeCelMesh(new THREE.BoxGeometry(0.34, 0.14, 0.16), suit, `RiderShin${side}`);
    lower.position.set(0.16, -0.02, 0);
    shin.add(lower);

    const foot = makeCelMesh(new THREE.BoxGeometry(0.24, 0.09, 0.2), boot, `RiderBoot${side}`);
    foot.position.set(0.35, -0.09, 0);
    shin.add(foot);

    return { thigh, shin };
  }

  private makeHandlebars(barMat: THREE.Material, gripMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    g.name = 'RiderHandlebars';
    g.position.set(0.2, 1.12, 0);

    const stem = makeCelMesh(new THREE.BoxGeometry(0.1, 0.32, 0.08), barMat, 'RiderHandlebarStem');
    stem.position.set(0.1, -0.12, 0);
    stem.rotation.z = -0.35;
    g.add(stem);

    const crossGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.58, 8);
    crossGeo.rotateX(Math.PI / 2);
    const crossbar = makeCelMesh(crossGeo, barMat, 'RiderHandlebarCrossbar');
    crossbar.position.set(0.24, 0.02, 0);
    g.add(crossbar);

    for (const side of [-1, 1]) {
      const gripGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.22, 8);
      gripGeo.rotateX(Math.PI / 2);
      const grip = makeCelMesh(gripGeo, gripMat, `RiderHandlebarGrip${side}`);
      grip.position.set(0.25, 0.02, side * 0.37);
      g.add(grip);
    }

    return g;
  }

  applyPose(pose: RiderPose): void {
    const lean = pose.lean;
    const crouch = pose.crouch;
    const bob = pose.bob;
    const cel = pose.celebrate;

    this.root.position.y = bob * 0.04 - crouch * 0.12;
    this.hips.rotation.x = lean * 0.38;
    this.hips.rotation.z = pose.pitchLean * 0.2 - crouch * 0.22;
    this.torso.rotation.x = lean * 0.28;
    this.torso.rotation.z = pose.pitchLean * 0.35 - crouch * 0.42 + cel * 0.38;
    this.head.rotation.x = -lean * 0.22;
    this.head.rotation.z = -pose.pitchLean * 0.12 + cel * 0.16;

    // Normal pose plants hands on the bars; celebration lifts them without changing the hierarchy.
    const throttleReach = pose.throttle * 0.28 + crouch * 0.14;
    this.armL.rotation.z = mix(-0.5 - throttleReach, 1.15, cel);
    this.armR.rotation.z = mix(-0.52 - throttleReach * 1.1, 1.2, cel);
    this.armL.rotation.x = lean * 0.14;
    this.armR.rotation.x = lean * 0.14;
    this.armL.rotation.y = mix(0.16 + lean * 0.08, -0.75, cel);
    this.armR.rotation.y = mix(-0.16 + lean * 0.08, 0.75, cel);
    this.forearmL.rotation.z = mix(-0.22 - pose.throttle * 0.08, 0.38, cel);
    this.forearmR.rotation.z = mix(-0.25 - pose.throttle * 0.1, 0.42, cel);

    this.legL.rotation.x = lean * 0.08;
    this.legR.rotation.x = lean * 0.08;
    this.legL.rotation.z = -0.72 - crouch * 0.32 + pose.pitchLean * 0.08;
    this.legR.rotation.z = -0.72 - crouch * 0.32 + pose.pitchLean * 0.08;
    this.shinL.rotation.z = 0.92 + crouch * 0.45;
    this.shinR.rotation.z = 0.92 + crouch * 0.45;
  }
}

function makeCelMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.celShaded = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
