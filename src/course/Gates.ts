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
    const mat = createCelMaterial({
      color: Palette.gate,
      accent: Palette.racingLineGlow,
      rimColor: 0xc0ffe0,
      matcapMix: 0.25,
    });
    const postGeo = new THREE.BoxGeometry(0.45, 6, 0.45);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(0, 3, side * 5);
      post.userData.celShaded = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 10.4), mat);
    beam.position.set(0, 6.1, 0);
    beam.userData.celShaded = true;
    g.add(beam);

    // Buoy markers
    const buoyMat = createCelMaterial({ color: Palette.hudAccent, accent: Palette.gate, matcapMix: 0.3 });
    for (const side of [-1, 1]) {
      const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), buoyMat);
      buoy.position.set(0, 0.4, side * 5);
      buoy.userData.celShaded = true;
      g.add(buoy);
    }

    addInvertedHullOutlines(g, 1.0);
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
