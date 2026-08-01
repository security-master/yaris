/**
 * Procedural race boat, built entirely in code.
 * A lofted planing hull (keel / V-bottom / chine / gunwale sections),
 * crowned deck, cockpit, windshield, engine cowl, spoiler and rub rail.
 * All parts use the shared toon material; ink outlines are added by the
 * caller via outlineHierarchy().
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeGlassMaterial, makeToonMaterial } from "../render/ToonMaterial";
import { Palette } from "../core/Palette";

interface Section {
  z: number;
  keelY: number;
  vX: number;
  vY: number;
  chineX: number;
  chineY: number;
  gunX: number;
  gunY: number;
  deckY: number;
}

// Bow at +z, transom at -z. Tuned for a chunky arcade hydroplane stance.
const SECTIONS: Section[] = [
  { z: 2.3, keelY: 0.46, vX: 0.015, vY: 0.5, chineX: 0.02, chineY: 0.54, gunX: 0.025, gunY: 0.6, deckY: 0.62 },
  { z: 1.7, keelY: 0.1, vX: 0.2, vY: 0.22, chineX: 0.3, chineY: 0.38, gunX: 0.34, gunY: 0.66, deckY: 0.8 },
  { z: 0.9, keelY: -0.18, vX: 0.42, vY: -0.02, chineX: 0.62, chineY: 0.22, gunX: 0.68, gunY: 0.6, deckY: 0.88 },
  { z: 0.0, keelY: -0.3, vX: 0.5, vY: -0.12, chineX: 0.78, chineY: 0.14, gunX: 0.84, gunY: 0.56, deckY: 0.84 },
  { z: -1.0, keelY: -0.3, vX: 0.5, vY: -0.14, chineX: 0.8, chineY: 0.12, gunX: 0.84, gunY: 0.54, deckY: 0.78 },
  { z: -2.1, keelY: -0.26, vX: 0.46, vY: -0.12, chineX: 0.76, chineY: 0.12, gunX: 0.8, gunY: 0.52, deckY: 0.72 },
];

/** hull ring: keel, R v, R chine, R gunwale, L gunwale, L chine, L v (closed via keel) */
function hullRing(s: Section): THREE.Vector3[] {
  return [
    new THREE.Vector3(0, s.keelY, s.z),
    new THREE.Vector3(s.vX, s.vY, s.z),
    new THREE.Vector3(s.chineX, s.chineY, s.z),
    new THREE.Vector3(s.gunX, s.gunY, s.z),
    new THREE.Vector3(-s.gunX, s.gunY, s.z),
    new THREE.Vector3(-s.chineX, s.chineY, s.z),
    new THREE.Vector3(-s.vX, s.vY, s.z),
  ];
}

/** deck strip: R gunwale -> crowned center -> L gunwale */
function deckRing(s: Section): THREE.Vector3[] {
  return [
    new THREE.Vector3(s.gunX, s.gunY, s.z),
    new THREE.Vector3(s.gunX * 0.5, s.deckY, s.z),
    new THREE.Vector3(0, s.deckY + 0.02, s.z),
    new THREE.Vector3(-s.gunX * 0.5, s.deckY, s.z),
    new THREE.Vector3(-s.gunX, s.gunY, s.z),
  ];
}

/** Lofts rings (equal point counts) into an indexed BufferGeometry. */
function loft(rings: THREE.Vector3[][], closeRing: boolean): THREE.BufferGeometry {
  const n = rings[0].length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) {
    for (const p of ring) positions.push(p.x, p.y, p.z);
  }
  const cols = closeRing ? n : n - 1;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < cols; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i;
      const d = (r + 1) * n + ((i + 1) % n);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Flat cap across a ring (transom). */
function cap(ring: THREE.Vector3[], flip: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const center = new THREE.Vector3();
  for (const p of ring) center.add(p);
  center.divideScalar(ring.length);
  positions.push(center.x, center.y, center.z);
  for (const p of ring) positions.push(p.x, p.y, p.z);
  for (let i = 0; i < ring.length; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % ring.length);
    if (flip) indices.push(0, b, a);
    else indices.push(0, a, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export interface Livery {
  hull: number;
  deck: number;
  trim: number;
  name: string;
}

export interface BoatMeshResult {
  group: THREE.Group;
  /** where the rider sits, in boat space */
  seatAnchor: THREE.Object3D;
  /** handlebar grip targets for the rider's hands (L, R) */
  gripL: THREE.Object3D;
  gripR: THREE.Object3D;
  hullMat: THREE.MeshPhysicalMaterial;
  setHullColor: (hex: number) => void;
}

export function buildBoatMesh(livery: Livery): BoatMeshResult {
  const group = new THREE.Group();
  group.name = "boat";

  const hullMat = makeToonMaterial({ color: livery.hull, specular: 0.85, shininess: 110, metalness: 0.25, roughness: 0.28, clearcoat: 0.85 });
  const deckMat = makeToonMaterial({ color: livery.deck, specular: 0.4, shininess: 50, metalness: 0.05, roughness: 0.45, clearcoat: 0.35 });
  const trimMat = makeToonMaterial({ color: livery.trim, specular: 0.6, shininess: 80, metalness: 0.55, roughness: 0.35 });
  const glassMat = makeGlassMaterial(0xa8d4ef);

  // hull + transom
  const hullGeo = loft(SECTIONS.map(hullRing), false);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.name = "hull";
  group.add(hull);
  const transom = new THREE.Mesh(cap(hullRing(SECTIONS[SECTIONS.length - 1]).concat(deckRing(SECTIONS[SECTIONS.length - 1]).slice(1, -1).reverse()), false), hullMat);
  transom.name = "transom";
  group.add(transom);

  // deck
  const deckGeo = loft(SECTIONS.map(deckRing), false);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.name = "deck";
  group.add(deck);

  // cockpit tub (where the rider sits): shallow rounded box, trim color
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.3, 1.15, 1, 1, 1), trimMat);
  tub.position.set(0, 0.74, -0.55);
  tub.name = "cockpit";
  group.add(tub);

  // windshield: swept wedge in front of the cockpit
  const shieldGeo = new THREE.CylinderGeometry(0.42, 0.5, 0.26, 12, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  const shield = new THREE.Mesh(shieldGeo, glassMat);
  shield.position.set(0, 0.97, 0.3);
  shield.rotation.x = -0.52;
  shield.scale.z = 0.75;
  shield.name = "windshield";
  group.add(shield);

  // engine cowl behind the cockpit: capsule lying flat
  const cowl = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 6, 12), deckMat);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.set(0, 0.82, -1.45);
  cowl.scale.set(1.15, 1, 0.75);
  cowl.name = "cowl";
  group.add(cowl);

  // twin exhaust tips
  for (const sx of [-0.18, 0.18]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.22, 10), trimMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx, 0.62, -2.14);
    pipe.name = "exhaust";
    group.add(pipe);
  }

  // spoiler: thin swept aerofoil on two raked struts, with endplates
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.045, 0.3), trimMat);
  wing.position.set(0, 1.22, -1.95);
  wing.rotation.x = 0.16;
  wing.scale.z = 1;
  wing.name = "wing";
  group.add(wing);
  for (const sx of [-0.68, 0.68]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.34), hullMat);
    plate.position.set(sx, 1.24, -1.95);
    plate.rotation.x = 0.16;
    plate.name = "endplate";
    group.add(plate);
  }
  for (const sx of [-0.42, 0.42]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.46, 0.12), trimMat);
    strut.position.set(sx, 1.0, -1.9);
    strut.rotation.x = 0.3;
    strut.name = "strut";
    group.add(strut);
  }

  // rub rail: tube following the gunwale line
  const gunPts: THREE.Vector3[] = [];
  for (const s of SECTIONS) gunPts.push(new THREE.Vector3(s.gunX, s.gunY + 0.02, s.z));
  for (let i = SECTIONS.length - 1; i >= 0; i--) {
    const s = SECTIONS[i];
    gunPts.push(new THREE.Vector3(-s.gunX, s.gunY + 0.02, s.z));
  }
  const railCurve = new THREE.CatmullRomCurve3(gunPts, true, "catmullrom", 0.15);
  const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 64, 0.045, 6, true), trimMat);
  rail.name = "rubrail";
  group.add(rail);

  // bow trim stripe: thin box along the foredeck centerline
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 1.7), trimMat);
  stripe.position.set(0, 0.86, 1.35);
  stripe.rotation.x = 0.1;
  stripe.name = "stripe";
  group.add(stripe);

  // handlebar column + bar
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 8), trimMat);
  column.position.set(0, 0.98, 0.02);
  column.rotation.x = 0.5;
  column.name = "column";
  group.add(column);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.66, 8), trimMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.16, 0.12);
  bar.name = "handlebar";
  group.add(bar);
  for (const sx of [-0.31, 0.31]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), makeToonMaterial({ color: Palette.ink, specular: 0.2 }));
    grip.rotation.z = Math.PI / 2;
    grip.position.set(sx, 1.16, 0.12);
    grip.name = "grip";
    group.add(grip);
  }

  // ------------------------------------------------------------------
  // Draw-call pass: merge every static part that shares a material into
  // a single mesh (hull set, deck set, trim set...). Cuts each boat from
  // ~20 meshes (+20 outline shells) down to ~5 (+5).
  // ------------------------------------------------------------------
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const toRemove: THREE.Mesh[] = [];
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) continue;
    mesh.updateMatrix();
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    // drop UVs; the toon shader doesn't use them and merge needs
    // identical attribute sets
    g.deleteAttribute("uv");
    const mat = mesh.material as THREE.Material;
    let list = byMaterial.get(mat);
    if (!list) byMaterial.set(mat, (list = []));
    list.push(g);
    toRemove.push(mesh);
  }
  for (const m of toRemove) group.remove(m);
  for (const [mat, geos] of byMaterial) {
    const merged = mergeGeometries(geos, false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = "boat_part";
    group.add(mesh);
  }

  const seatAnchor = new THREE.Object3D();
  seatAnchor.position.set(0, 0.9, -0.62);
  group.add(seatAnchor);

  const gripL = new THREE.Object3D();
  gripL.position.set(-0.31, 1.16, 0.12);
  group.add(gripL);
  const gripR = new THREE.Object3D();
  gripR.position.set(0.31, 1.16, 0.12);
  group.add(gripR);

  const setHullColor = (hex: number) => {
    hullMat.color.setHex(hex);
    livery.hull = hex;
  };

  return { group, seatAnchor, gripL, gripR, hullMat, setHullColor };
}
