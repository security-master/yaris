/**
 * Procedural boat hull + accents — all BufferGeometry in code.
 */
import * as THREE from 'three';
import { createCelMaterial } from '../rendering/CelMaterial';
import { addInvertedHullOutlines } from '../rendering/Outline';
import { Palette } from '../palette';

function buildHullGeometry(): THREE.BufferGeometry {
  // Custom hull via lathe-like manual vertices
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, -0.2);
  shape.lineTo(-0.9, 0.55);
  shape.lineTo(0.2, 0.7);
  shape.lineTo(2.4, 0.35);
  shape.lineTo(2.6, 0.0);
  shape.lineTo(2.2, -0.35);
  shape.lineTo(0.0, -0.5);
  shape.lineTo(-1.0, -0.4);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.6,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.1,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(-Math.PI / 2);
  geo.translate(0, 0.15, 0);
  geo.computeVertexNormals();
  return geo;
}

function buildDeckGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(3.6, 0.12, 1.35);
  geo.translate(0.15, 0.55, 0);
  return geo;
}

function buildKeelGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(2.8, 0.35, 0.25);
  geo.translate(0.1, -0.15, 0);
  return geo;
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

  const hull = new THREE.Mesh(buildHullGeometry(), hullMat);
  hull.userData.celShaded = true;
  hull.castShadow = false;
  group.add(hull);

  const deck = new THREE.Mesh(buildDeckGeometry(), deckMat);
  deck.userData.celShaded = true;
  group.add(deck);

  const keel = new THREE.Mesh(buildKeelGeometry(), darkMat);
  keel.userData.celShaded = true;
  group.add(keel);

  // Windshield
  const shield = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.55, 1.1),
    createCelMaterial({ color: 0x7ec8e8, accent: 0xd0f0ff, matcapMix: 0.45, rimPower: 2.2 }),
  );
  shield.position.set(-0.55, 0.95, 0);
  shield.userData.celShaded = true;
  group.add(shield);

  // Engine block
  const engine = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.45, 0.7),
    createCelMaterial({ color: 0x3a3540, accent, matcapMix: 0.3 }),
  );
  engine.position.set(-1.55, 0.55, 0);
  engine.userData.celShaded = true;
  group.add(engine);

  // Stripe fins
  const finGeo = new THREE.BoxGeometry(0.9, 0.35, 0.08);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(
      finGeo,
      createCelMaterial({ color: accent, accent: hullColor, matcapMix: 0.2 }),
    );
    fin.position.set(0.4, 0.75, side * 0.72);
    fin.rotation.z = side * 0.15;
    fin.userData.celShaded = true;
    group.add(fin);
  }

  const outlines = addInvertedHullOutlines(group, 1.2);
  return { group, outlines, hull };
}
