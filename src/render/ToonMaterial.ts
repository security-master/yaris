/**
 * Surface materials — photorealistic PBR (MeshPhysicalMaterial).
 * Kept filename for import stability across the codebase.
 * Palette accents still seed base colours; lighting is physically based.
 */

import * as THREE from "three";
import { Palette } from "../core/Palette";

export const TOON_SUN = new THREE.Vector3(0.42, 0.55, 0.28).normalize();

export interface ToonOptions {
  color: number;
  specular?: number;
  shininess?: number;
  rim?: number;
  matcap?: number;
  emissive?: number;
  flatShaded?: boolean;
  transparent?: boolean;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  clearcoat?: number;
}

export function makeToonMaterial(opts: ToonOptions): THREE.MeshPhysicalMaterial {
  const metalness = opts.metalness ?? (opts.matcap && opts.matcap > 0.2 ? 0.55 : 0.12);
  const roughness = opts.roughness ?? THREE.MathUtils.clamp(1.05 - (opts.shininess ?? 60) / 160, 0.12, 0.85);
  const mat = new THREE.MeshPhysicalMaterial({
    color: opts.color,
    metalness,
    roughness,
    clearcoat: opts.clearcoat ?? (opts.specular && opts.specular > 0.6 ? 0.55 : 0.15),
    clearcoatRoughness: 0.25,
    emissive: new THREE.Color(opts.color).multiplyScalar(opts.emissive ?? 0),
    emissiveIntensity: opts.emissive ? 1.2 : 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    flatShading: opts.flatShaded ?? false,
    side: opts.transparent ? THREE.DoubleSide : THREE.FrontSide,
    envMapIntensity: 1.0,
  });
  return mat;
}

/** no-op kept for call sites that used to push a shared sun uniform */
export function setToonSun(dir: THREE.Vector3): void {
  TOON_SUN.copy(dir);
}

/** Convenience glass */
export function makeGlassMaterial(color = 0x88b8d8): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.05,
    transmission: 0.85,
    thickness: 0.4,
    ior: 1.4,
    transparent: true,
    opacity: 1,
    envMapIntensity: 1.2,
  });
}

// Retain palette export usage for HUD accents
void Palette;
