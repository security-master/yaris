/**
 * Inverted-hull outlines with screen-space constant width.
 * Duplicate mesh, BackSide, push along normals scaled by distance.
 */
import * as THREE from 'three';
import { Palette } from '../palette';

const outlineVert = /* glsl */ `
uniform float uWidth;
varying vec3 vNormal;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Screen-space constant line width: scale push by w (perspective)
  float distScale = clip.w * uWidth * 0.0034;
  vec3 pushed = position + normal * distScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pushed, 1.0);
}
`;

const outlineFrag = /* glsl */ `
uniform vec3 uInk;
void main() {
  gl_FragColor = vec4(uInk, 1.0);
}
`;

export function createOutlineMaterial(width = 1.0, ink: THREE.ColorRepresentation = Palette.ink): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: width },
      uInk: { value: new THREE.Color(ink) },
    },
    vertexShader: outlineVert,
    fragmentShader: outlineFrag,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
}

/** Attach inverted-hull outline children for every Mesh under root. */
export function addInvertedHullOutlines(root: THREE.Object3D, width = 1.15): THREE.Mesh[] {
  const outlines: THREE.Mesh[] = [];
  const mat = createOutlineMaterial(width);
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && !(obj as THREE.Object3D).userData.isOutline) {
      const mesh = obj as THREE.Mesh;
      const outline = new THREE.Mesh(mesh.geometry, mat.clone());
      outline.userData.isOutline = true;
      outline.renderOrder = mesh.renderOrder - 1;
      outline.frustumCulled = true;
      mesh.add(outline);
      outlines.push(outline);
    }
  });
  return outlines;
}

export function setOutlineWidth(outlines: THREE.Mesh[], width: number): void {
  for (const m of outlines) {
    const mat = m.material as THREE.ShaderMaterial;
    if (mat.uniforms?.uWidth) mat.uniforms.uWidth.value = width;
  }
}
