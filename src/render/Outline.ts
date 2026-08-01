/**
 * Inverted-hull ink outlines.
 *
 * A duplicate of the mesh is rendered with front faces culled and its
 * vertices pushed along *smoothed* normals (position-averaged, so hard
 * edges don't split the shell). The push distance is computed in clip
 * space and scaled by w, giving a constant screen-space line width:
 * no fat lines up close, no vanishing lines in the distance.
 */

import * as THREE from "three";
import { Palette } from "../core/Palette";

const _v = new THREE.Vector3();

/** Average normals across coincident vertices -> "aSmoothNormal". */
export function addSmoothedNormals(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute("aSmoothNormal")) return;
  const pos = geometry.getAttribute("position");
  const nrm = geometry.getAttribute("normal");
  const count = pos.count;
  const map = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const key = `${pos.getX(i).toFixed(4)}_${pos.getY(i).toFixed(4)}_${pos.getZ(i).toFixed(4)}`;
    let arr = map.get(key);
    if (!arr) map.set(key, (arr = []));
    arr.push(i);
  }
  const smooth = new Float32Array(count * 3);
  for (const idxs of map.values()) {
    _v.set(0, 0, 0);
    for (const i of idxs) {
      _v.x += nrm.getX(i);
      _v.y += nrm.getY(i);
      _v.z += nrm.getZ(i);
    }
    _v.normalize();
    for (const i of idxs) {
      smooth[i * 3] = _v.x;
      smooth[i * 3 + 1] = _v.y;
      smooth[i * 3 + 2] = _v.z;
    }
  }
  geometry.setAttribute("aSmoothNormal", new THREE.BufferAttribute(smooth, 3));
}

export interface OutlineOptions {
  /** line width in CSS pixels at any distance (default 2.2) */
  widthPx?: number;
  color?: number;
}

/** Shared uniform so resize updates all outlines at once. */
export const OUTLINE_RESOLUTION = { value: new THREE.Vector2(1920, 1080) };

export function makeOutlineMaterial(opts: OutlineOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "InkOutline",
    side: THREE.BackSide,
    uniforms: {
      uWidth: { value: opts.widthPx ?? 2.2 },
      uColor: { value: new THREE.Color(opts.color ?? Palette.ink) },
      uResolution: OUTLINE_RESOLUTION,
      uHorizonColor: { value: new THREE.Color(Palette.skyHorizon) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aSmoothNormal;
      uniform float uWidth;
      uniform vec2 uResolution;
      varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec4 clip = projectionMatrix * mv;
        vec3 vn = normalize(normalMatrix * aSmoothNormal);
        // project the normal to clip space, push in screen pixels * w
        vec2 screenN = normalize((projectionMatrix * vec4(vn, 0.0)).xy + vec2(1e-6));
        clip.xy += screenN * (uWidth * 2.0 / uResolution.y) * clip.w;
        // tiny depth push so the shell never z-fights its own mesh
        clip.z += 0.00012 * clip.w;
        vDist = -mv.z;
        gl_Position = clip;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uHorizonColor;
      varying float vDist;
      void main() {
        // lines fade into the fog like everything else
        float f = 1.0 - exp(-vDist * 0.00115);
        vec3 col = mix(uColor, uHorizonColor, clamp(f * f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Attach an inverted-hull outline as a child of the mesh.
 * Shares the geometry (with an added aSmoothNormal attribute).
 */
export function addOutline(mesh: THREE.Mesh, opts: OutlineOptions = {}): THREE.Mesh {
  addSmoothedNormals(mesh.geometry);
  const outline = new THREE.Mesh(mesh.geometry, makeOutlineMaterial(opts));
  outline.name = mesh.name + "_outline";
  outline.frustumCulled = mesh.frustumCulled;
  mesh.add(outline);
  return outline;
}

/** Outline every mesh in a hierarchy (skips existing outlines). */
export function outlineHierarchy(root: THREE.Object3D, opts: OutlineOptions = {}): void {
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.name.endsWith("_outline") && !o.userData.noOutline) {
      targets.push(o as THREE.Mesh);
    }
  });
  for (const m of targets) addOutline(m, opts);
}
