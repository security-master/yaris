/**
 * Floating checkpoint gates + wrong-way detection helpers.
 */
import * as THREE from 'three';
import { createCelMaterial } from '../rendering/CelMaterial';
import { addInvertedHullOutlines } from '../rendering/Outline';
import { sampleGerstner } from '../water/gerstner';
import { getTrackFrame } from './TrackSpline';
import { Palette } from '../palette';

export interface Gate {
  index: number;
  u: number;
  group: THREE.Group;
  width: number;
}

export class GateField {
  readonly group = new THREE.Group();
  readonly gates: Gate[] = [];
  private curve: THREE.CatmullRomCurve3;

  constructor(curve: THREE.CatmullRomCurve3, count = 10) {
    this.curve = curve;
    for (let i = 0; i < count; i++) {
      const u = i / count;
      const g = this.makeGate(i);
      this.gates.push({ index: i, u, group: g, width: 10 });
      this.group.add(g);
    }
  }

  private makeGate(index: number): THREE.Group {
    const g = new THREE.Group();
    const postMat = createCelMaterial({
      color: Palette.gate,
      accent: Palette.racingLineGlow,
      rimColor: 0xd8ffe9,
      matcapMix: 0.22,
      bandBias: 1.0,
    });
    const beamMat = createCelMaterial({
      color: Palette.racingLineGlow,
      accent: Palette.white,
      rimColor: 0xffffff,
      matcapMix: 0.18,
      bandBias: 1.12,
      shadeMul: 1.22,
    });
    const baseMat = createCelMaterial({
      color: Palette.hudAccent,
      accent: Palette.gate,
      rimColor: 0xfff1a8,
      matcapMix: 0.26,
    });

    const postGeo = new THREE.CylinderGeometry(0.22, 0.5, 5.55, 4, 1);
    const baseGeo = new THREE.CylinderGeometry(0.82, 1.05, 0.42, 8, 1);
    const baseStripeGeo = new THREE.BoxGeometry(0.32, 0.26, 1.45);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(0, 2.95, side * 4.65);
      post.rotation.y = Math.PI / 4;
      post.userData.celShaded = true;
      g.add(post);

      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set(0, 0.24, side * 4.75);
      base.userData.celShaded = true;
      g.add(base);

      const baseStripe = new THREE.Mesh(baseStripeGeo, beamMat);
      baseStripe.position.set(0, 0.58, side * 4.75);
      baseStripe.userData.celShaded = true;
      g.add(baseStripe);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 9.5), beamMat);
    beam.position.set(0, 5.78, 0);
    beam.userData.celShaded = true;
    g.add(beam);

    addInvertedHullOutlines(g, 0.92);

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.58, 9.75),
      new THREE.MeshBasicMaterial({
        color: Palette.racingLineGlow,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    glow.position.copy(beam.position);
    glow.renderOrder = 2;
    glow.userData.skipEdge = true;
    g.add(glow);

    g.userData.gateIndex = index;
    return g;
  }

  update(t: number): void {
    for (const gate of this.gates) {
      const frame = getTrackFrame(this.curve, gate.u);
      const s = sampleGerstner(frame.position.x, frame.position.z, t);
      gate.group.position.set(
        frame.position.x + s.dispX,
        s.height,
        frame.position.z + s.dispZ,
      );
      gate.group.rotation.y = -frame.yaw + Math.PI / 2;
    }
  }

  /** Progress along track 0..1 */
  progressOf(x: number, z: number): number {
    // Approximate by nearest sample
    let bestU = 0;
    let bestD = Infinity;
    const steps = 120;
    for (let i = 0; i < steps; i++) {
      const u = i / steps;
      const p = this.curve.getPointAt(u);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestU = u;
      }
    }
    return bestU;
  }

  isWrongWay(x: number, z: number, yaw: number): boolean {
    const u = this.progressOf(x, z);
    const { tangent } = getTrackFrame(this.curve, u);
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    return fx * tangent.x + fz * tangent.z < -0.2;
  }

  nextCornerYaw(u: number, lookahead = 0.08): number {
    const { yaw } = getTrackFrame(this.curve, u + lookahead);
    return yaw;
  }
}
