/**
 * Procedural boat hull + accents — all BufferGeometry in code.
 */
import * as THREE from 'three';
import { createCelMaterial } from '../rendering/CelMaterial';
import { addInvertedHullOutlines } from '../rendering/Outline';
import { Palette } from '../palette';

function makeCelMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.celShaded = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function makeIndexedGeometry(vertices: number[][], faces: number[][]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      vertices.flatMap(([x, y, z]) => [THREE.MathUtils.mapLinear(x, -2.2, 2.5, 0, 1), THREE.MathUtils.mapLinear(y + z * 0.08, -0.6, 1.2, 0, 1)]),
      2,
    ),
  );
  geo.setIndex(faces.flat());
  geo.computeVertexNormals();
  return geo;
}

function buildHullGeometry(): THREE.BufferGeometry {
  // Local +X is the bow/forward axis. Cross sections taper hard into a pointed bow and V keel.
  const sections = [
    { x: 2.35, deckY: 0.2, deckHalf: 0.05, chineY: 0.04, chineHalf: 0.09, keelY: -0.18 },
    { x: 1.45, deckY: 0.43, deckHalf: 0.52, chineY: -0.05, chineHalf: 0.68, keelY: -0.46 },
    { x: 0.05, deckY: 0.47, deckHalf: 0.82, chineY: -0.08, chineHalf: 0.98, keelY: -0.56 },
    { x: -1.32, deckY: 0.36, deckHalf: 1.02, chineY: -0.15, chineHalf: 1.13, keelY: -0.43 },
    { x: -1.82, deckY: 0.28, deckHalf: 1.0, chineY: -0.22, chineHalf: 1.08, keelY: -0.32 },
  ];

  const vertices: number[][] = [];
  for (const s of sections) {
    vertices.push(
      [s.x, s.deckY, -s.deckHalf],
      [s.x, s.deckY, s.deckHalf],
      [s.x, s.chineY, s.chineHalf],
      [s.x, s.keelY, 0],
      [s.x, s.chineY, -s.chineHalf],
    );
  }

  const faces: number[][] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * 5;
    const b = (i + 1) * 5;
    for (let j = 0; j < 5; j++) {
      const n = (j + 1) % 5;
      faces.push([a + j, b + j, b + n], [a + j, b + n, a + n]);
    }
  }
  faces.push([0, 1, 2], [0, 2, 3], [0, 3, 4]);
  const stern = (sections.length - 1) * 5;
  faces.push([stern, stern + 3, stern + 2], [stern, stern + 2, stern + 1], [stern, stern + 4, stern + 3]);

  return makeIndexedGeometry(vertices, faces);
}

function buildDeckGeometry(): THREE.BufferGeometry {
  const vertices = [
    [1.48, 0.43, -0.36],
    [1.48, 0.43, 0.36],
    [-1.12, 0.36, 0.78],
    [-1.12, 0.36, -0.78],
    [1.28, 0.62, -0.28],
    [1.28, 0.62, 0.28],
    [-1.02, 0.57, 0.62],
    [-1.02, 0.57, -0.62],
  ];
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [4, 6, 5],
    [4, 7, 6],
    [0, 4, 5],
    [0, 5, 1],
    [1, 5, 6],
    [1, 6, 2],
    [2, 6, 7],
    [2, 7, 3],
    [3, 7, 4],
    [3, 4, 0],
  ];
  return makeIndexedGeometry(vertices, faces);
}

function buildKeelGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(3.1, 0.22, 0.16);
  geo.translate(0.0, -0.36, 0);
  return geo;
}

function buildFinGeometry(side: number): THREE.BufferGeometry {
  const z0 = side * 0.02;
  const z1 = side * 0.2;
  const vertices = [
    [-0.95, 0.38, z0],
    [-1.55, 0.35, z0],
    [-1.42, 0.92, z0],
    [-0.95, 0.38, z1],
    [-1.55, 0.35, z1],
    [-1.42, 0.92, z1],
  ];
  const capFaces = side > 0 ? [[0, 1, 2], [3, 5, 4]] : [[0, 2, 1], [3, 4, 5]];
  const faces = [
    ...capFaces,
    [0, 3, 4],
    [0, 4, 1],
    [1, 4, 5],
    [1, 5, 2],
    [2, 5, 3],
    [2, 3, 0],
  ];
  return makeIndexedGeometry(vertices, faces);
}

function buildWindshieldGeometry(): THREE.BufferGeometry {
  const vertices = [
    [0.0, -0.22, -0.46],
    [0.0, -0.22, 0.46],
    [0.0, 0.24, -0.34],
    [0.0, 0.24, 0.34],
    [0.08, -0.18, -0.5],
    [0.08, -0.18, 0.5],
    [0.08, 0.2, -0.37],
    [0.08, 0.2, 0.37],
  ];
  const faces = [
    [0, 1, 3],
    [0, 3, 2],
    [4, 6, 7],
    [4, 7, 5],
    [0, 4, 5],
    [0, 5, 1],
    [2, 3, 7],
    [2, 7, 6],
    [0, 2, 6],
    [0, 6, 4],
    [1, 5, 7],
    [1, 7, 3],
  ];
  return makeIndexedGeometry(vertices, faces);
}

export interface BoatVisual {
  group: THREE.Group;
  outlines: THREE.Mesh[];
  hull: THREE.Mesh;
}

export function createBoatVisual(hullColor: THREE.ColorRepresentation, accent: THREE.ColorRepresentation): BoatVisual {
  const group = new THREE.Group();
  group.name = 'Boat';

  const hullMat = createCelMaterial({
    color: hullColor,
    accent,
    rimColor: 0xffe8c0,
    rimPower: 2.6,
    matcapMix: 0.28,
    bandBias: 0.92,
  });
  const deckMat = createCelMaterial({
    color: Palette.deck,
    accent: Palette.metalBand,
    rimColor: 0xfff0d0,
    matcapMix: 0.18,
    bandBias: 0.9,
  });
  const darkMat = createCelMaterial({
    color: 0x2a2430,
    accent: 0x4a3a30,
    rimColor: 0xc0a080,
    matcapMix: 0.15,
  });
  const glassMat = createCelMaterial({ color: 0x64d4ff, accent: 0xdaf9ff, matcapMix: 0.5, rimPower: 2.0, bandBias: 1.05 });
  const accentMat = createCelMaterial({ color: accent, accent: hullColor, matcapMix: 0.24, rimPower: 2.4 });
  const metalMat = createCelMaterial({ color: 0x444452, accent: 0xbfc7d4, matcapMix: 0.35, rimPower: 2.1 });

  const hull = makeCelMesh(buildHullGeometry(), hullMat, 'BoatHull');
  group.add(hull);

  const deck = makeCelMesh(buildDeckGeometry(), deckMat, 'BoatDeck');
  group.add(deck);

  const keel = makeCelMesh(buildKeelGeometry(), darkMat, 'BoatKeel');
  group.add(keel);

  const cockpit = makeCelMesh(new THREE.BoxGeometry(0.82, 0.08, 0.52), darkMat, 'BoatCockpitWell');
  cockpit.position.set(0.02, 0.62, 0);
  group.add(cockpit);

  const noseStripe = makeCelMesh(new THREE.BoxGeometry(1.65, 0.045, 0.16), accentMat, 'BoatNoseStripe');
  noseStripe.position.set(0.78, 0.67, 0);
  noseStripe.rotation.z = -0.04;
  group.add(noseStripe);

  const shield = makeCelMesh(buildWindshieldGeometry(), glassMat, 'BoatWindshield');
  shield.position.set(0.68, 0.84, 0);
  shield.rotation.z = -0.34;
  group.add(shield);

  const engine = makeCelMesh(new THREE.BoxGeometry(0.72, 0.5, 0.76), metalMat, 'BoatEngineCowling');
  engine.position.set(-1.42, 0.58, 0);
  engine.rotation.z = 0.06;
  group.add(engine);

  const cowlStripe = makeCelMesh(new THREE.BoxGeometry(0.76, 0.08, 0.82), accentMat, 'BoatEngineStripe');
  cowlStripe.position.set(-1.42, 0.86, 0);
  cowlStripe.rotation.z = 0.06;
  group.add(cowlStripe);

  const outboard = makeCelMesh(new THREE.BoxGeometry(0.28, 0.58, 0.32), darkMat, 'BoatOutboardLower');
  outboard.position.set(-1.92, 0.09, 0);
  group.add(outboard);

  const exhaustGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.62, 8);
  exhaustGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const exhaust = makeCelMesh(exhaustGeo.clone(), darkMat, `BoatExhaust${side}`);
    exhaust.position.set(-1.88, 0.43, side * 0.25);
    group.add(exhaust);
  }

  const stripeGeo = new THREE.BoxGeometry(1.7, 0.11, 0.045);
  for (const side of [-1, 1]) {
    const stripe = makeCelMesh(stripeGeo.clone(), accentMat, `BoatSideStripe${side}`);
    stripe.position.set(0.1, 0.14, side * 1.04);
    stripe.rotation.z = -0.08;
    group.add(stripe);

    const rail = makeCelMesh(new THREE.BoxGeometry(2.05, 0.08, 0.06), deckMat, `BoatGunwale${side}`);
    rail.position.set(-0.1, 0.52, side * 0.88);
    rail.rotation.z = -0.04;
    group.add(rail);

    const fin = makeCelMesh(buildFinGeometry(side), accentMat, `BoatTailFin${side}`);
    fin.position.z = side * 0.93;
    group.add(fin);
  }

  const outlines = addInvertedHullOutlines(group, 1.55);
  for (const outline of outlines) outline.userData.celShaded = true;
  return { group, outlines, hull };
}
