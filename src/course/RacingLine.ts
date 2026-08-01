/**
 * Glowing green racing line ribbon that rides Gerstner waves with the water.
 */
import * as THREE from 'three';
import { sampleGerstner } from '../water/gerstner';
import { Palette } from '../palette';

export class RacingLine {
  readonly mesh: THREE.Mesh;
  private positions: Float32Array;
  private curve: THREE.CatmullRomCurve3;
  private samples: number;
  private halfWidth = 1.1;

  constructor(curve: THREE.CatmullRomCurve3, samples = 280) {
    this.curve = curve;
    this.samples = samples;
    const verts = (samples + 1) * 2;
    this.positions = new Float32Array(verts * 3);
    const indices: number[] = [];
    const uvs = new Float32Array(verts * 2);

    for (let i = 0; i <= samples; i++) {
      uvs[i * 4] = i / samples;
      uvs[i * 4 + 1] = 0;
      uvs[i * 4 + 2] = i / samples;
      uvs[i * 4 + 3] = 1;
      if (i < samples) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(Palette.racingLine) },
        uGlow: { value: new THREE.Color(Palette.racingLineGlow) },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uGlow;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float edge = abs(vUv.y - 0.5) * 2.0;
          float core = 1.0 - smoothstep(0.15, 0.55, edge);
          // Hard cel bands
          float band = step(0.35, core) * 0.55 + step(0.7, core);
          float pulse = step(0.5, fract(vUv.x * 40.0 - uTime * 2.0));
          vec3 col = mix(uColor, uGlow, pulse * 0.5);
          float alpha = band * 0.85;
          if (alpha < 0.05) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.userData.skipEdge = true;
  }

  update(t: number): void {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    for (let i = 0; i <= this.samples; i++) {
      const u = i / this.samples;
      const p = this.curve.getPointAt(u);
      const tan = this.curve.getTangentAt(u).normalize();
      const px = -tan.z;
      const pz = tan.x;
      const s = sampleGerstner(p.x, p.z, t);
      const y = s.height + 0.12;
      const cx = p.x + s.dispX;
      const cz = p.z + s.dispZ;
      const i0 = i * 2 * 3;
      this.positions[i0] = cx - px * this.halfWidth;
      this.positions[i0 + 1] = y;
      this.positions[i0 + 2] = cz - pz * this.halfWidth;
      this.positions[i0 + 3] = cx + px * this.halfWidth;
      this.positions[i0 + 4] = y;
      this.positions[i0 + 5] = cz + pz * this.halfWidth;
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
