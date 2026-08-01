/**
 * World-space direction arrows along the racing line — large chevrons
 * that sit just above the water and face along the track so the next
 * turn is always obvious.
 */

import * as THREE from "three";
import type { Course } from "./Course";
import { getWaterHeight } from "../water/waves";

export class GuideArrows {
  private markers: THREE.Group[] = [];
  private readonly count = 28;

  constructor(scene: THREE.Scene, private course: Course) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffcc33,
      emissive: 0xaa7700,
      emissiveIntensity: 0.55,
      metalness: 0.2,
      roughness: 0.4,
    });
    const shape = new THREE.Shape();
    // chevron / arrow pointing +Z
    shape.moveTo(0, 1.1);
    shape.lineTo(0.7, -0.3);
    shape.lineTo(0.28, -0.3);
    shape.lineTo(0.28, -1.0);
    shape.lineTo(-0.28, -1.0);
    shape.lineTo(-0.28, -0.3);
    shape.lineTo(-0.7, -0.3);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.center();

    for (let i = 0; i < this.count; i++) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      g.add(mesh);
      g.userData.t = i / this.count;
      this.markers.push(g);
      scene.add(g);
    }
  }

  /** Place arrows ahead of the player along the track. */
  update(time: number, playerRelParam: number): void {
    for (let i = 0; i < this.markers.length; i++) {
      const ahead = ((i + 1) / (this.count + 1)) * 0.22; // next ~22% of lap
      const rel = (playerRelParam + ahead) % 1;
      const abs = this.course.absParam(rel);
      const p = this.course.curve.getPointAt(abs);
      const tan = this.course.curve.getTangentAt(abs);
      const h = getWaterHeight(p.x, p.z, time);
      const m = this.markers[i];
      m.position.set(p.x, h + 1.35 + Math.sin(time * 3 + i) * 0.08, p.z);
      m.rotation.y = Math.atan2(tan.x, tan.z);
      // fade the nearest few so they don't block the bow
      const near = ahead < 0.03;
      m.visible = !near;
      const s = 1.1 + (1 - i / this.count) * 0.35;
      m.scale.setScalar(s);
    }
  }
}
