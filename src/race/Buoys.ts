/**
 * Corner buoys: inked orange cones with a white band, auto-placed on the
 * OUTSIDE of every significant corner (found by sampling spline curvature),
 * bobbing on the real wave field like everything else.
 */

import * as THREE from "three";
import { Palette } from "../core/Palette";
import { makeToonMaterial } from "../render/ToonMaterial";
import { outlineHierarchy } from "../render/Outline";
import { enableEdgeLines } from "../render/PostPipeline";
import { getWaterHeight, getWaterNormal } from "../water/waves";
import type { Course } from "./Course";

export class Buoys {
  private buoys: THREE.Group[] = [];
  private _n = new THREE.Vector3();

  constructor(scene: THREE.Scene, course: Course) {
    const N = 220;
    const pts: THREE.Vector3[] = [];
    const tans: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      pts.push(course.curve.getPointAt(i / N, new THREE.Vector3()));
      tans.push(course.curve.getTangentAt(i / N, new THREE.Vector3()));
    }

    const coneMat = makeToonMaterial({ color: Palette.orange, specular: 0.35, rim: 0.6 });
    const bandMat = makeToonMaterial({ color: Palette.white, specular: 0.25, rim: 0.5 });

    let lastPlaced = -10;
    for (let i = 0; i < N; i++) {
      const a = tans[i];
      const b = tans[(i + 4) % N];
      // signed curvature over ~30 m
      const cross = a.x * b.z - a.z * b.x;
      if (Math.abs(cross) < 0.14) continue;
      const distSinceLast = ((i - lastPlaced + N) % N) * (course.length / N);
      if (distSinceLast < 34) continue;
      lastPlaced = i;

      // outside of the corner: opposite the turn direction
      const side = Math.sign(cross); // + = turning right => outside is left
      const nx = -a.z * side;
      const nz = a.x * side;
      const off = 13 + Math.random() * 2;
      const bx = pts[i].x + nx * off;
      const bz = pts[i].z + nz * off;

      const buoy = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.6, 10), coneMat);
      cone.position.y = 1.1;
      buoy.add(cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.45, 10), bandMat);
      band.position.y = 1.35;
      buoy.add(band);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.5, 12), bandMat);
      base.position.y = 0.05;
      buoy.add(base);

      outlineHierarchy(buoy, { widthPx: 2.0 });
      enableEdgeLines(buoy);
      buoy.position.set(bx, 0, bz);
      buoy.userData.phase = Math.random() * 10;
      this.buoys.push(buoy);
      scene.add(buoy);
    }
  }

  update(time: number, camera: THREE.Camera): void {
    const cam = camera as THREE.PerspectiveCamera;
    for (const b of this.buoys) {
      const dx = b.position.x - cam.position.x;
      const dz = b.position.z - cam.position.z;
      b.visible = dx * dx + dz * dz < 300 * 300;
      if (!b.visible) continue;
      const h = getWaterHeight(b.position.x, b.position.z, time);
      b.position.y = h - 0.18;
      getWaterNormal(b.position.x, b.position.z, time, this._n);
      const ph = b.userData.phase as number;
      b.rotation.set(
        this._n.z * 0.5 + Math.sin(time * 0.9 + ph) * 0.05,
        ph,
        -this._n.x * 0.5 + Math.cos(time * 0.7 + ph) * 0.05
      );
    }
  }
}
