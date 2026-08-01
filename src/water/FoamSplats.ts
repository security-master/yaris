/**
 * World-space foam splat map.
 *
 * Boats stamp foam "splats" (wake trail discs, hull rings, slam bursts,
 * drift arcs) into a top-down orthographic render target that follows the
 * main camera. The ocean fragment shader samples this map by world
 * position, quantizes it into hard bands, and mixes foam color — so all
 * boat foam automatically rides the Gerstner waves with zero decals.
 *
 * Implementation: one InstancedMesh of quads, one draw call, additive
 * blending into an R8 target. Splats live in a ring-buffer pool.
 */

import * as THREE from "three";

const MAP_SIZE = 288; // metres covered by the splat map
const RT_RES = 1024;
const MAX_SPLATS = 900;

interface Splat {
  x: number;
  z: number;
  yaw: number;
  born: number;
  life: number;
  size0: number;
  growth: number;
  stretch: number; // x/z aspect
  intensity: number;
  fadeIn: number;
}

export class FoamSplats {
  readonly texture: THREE.Texture;
  readonly center = new THREE.Vector2();
  readonly size = MAP_SIZE;

  private rt: THREE.WebGLRenderTarget;
  private splatScene: THREE.Scene;
  private ortho: THREE.OrthographicCamera;
  private mesh: THREE.InstancedMesh;
  private aFade: THREE.InstancedBufferAttribute;
  private splats: Splat[] = [];
  private head = 0;
  private dummy = new THREE.Object3D();

  constructor() {
    // R = foam intensity, G = hull contact shadow
    this.rt = new THREE.WebGLRenderTarget(RT_RES, RT_RES, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.texture = this.rt.texture;

    this.splatScene = new THREE.Scene();
    const half = MAP_SIZE / 2;
    this.ortho = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
    // explicit top-down basis: +u = world +x, +v = world -z
    // (matches the ocean shader's foam UV mapping; a naive lookAt straight
    // down has a degenerate up vector and mirrors the map)
    this.ortho.position.set(0, 50, 0);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(0, 0, 0);
    this.splatScene.add(this.ortho);

    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute float aFade;
        varying vec2 vUvL;
        varying float vFade;
        void main() {
          vUvL = uv;
          vFade = aFade;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUvL;
        varying float vFade;
        void main() {
          vec2 p = vUvL - 0.5;
          float r2 = dot(p, p) * 4.0;
          float fall = pow(max(0.0, 1.0 - r2), 1.6);
          gl_FragColor = vec4(fall * vFade, 0.0, 0.0, fall * vFade);
        }
      `,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_SPLATS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const fades = new Float32Array(MAX_SPLATS);
    this.aFade = new THREE.InstancedBufferAttribute(fades, 1);
    this.aFade.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aFade", this.aFade);
    this.splatScene.add(this.mesh);

    for (let i = 0; i < MAX_SPLATS; i++) {
      this.splats.push({ x: 0, z: 0, yaw: 0, born: -100, life: 1, size0: 1, growth: 0, stretch: 1, intensity: 0, fadeIn: 0.05 });
    }

    // ---- hull contact shadows: one elongated soft stamp per boat (G) ----
    const shGeo = new THREE.PlaneGeometry(1, 1);
    shGeo.rotateX(-Math.PI / 2);
    const shMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aFade;
        varying vec2 vUvL;
        varying float vFade;
        void main() {
          vUvL = uv;
          vFade = aFade;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUvL;
        varying float vFade;
        void main() {
          vec2 p = vUvL - 0.5;
          float r2 = dot(p, p) * 4.0;
          float fall = pow(max(0.0, 1.0 - r2), 1.2);
          gl_FragColor = vec4(0.0, fall * vFade, 0.0, fall * vFade);
        }
      `,
    });
    this.shadowMesh = new THREE.InstancedMesh(shGeo, shMat, 4);
    this.shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadowMesh.frustumCulled = false;
    const shFades = new Float32Array(4);
    this.shadowFade = new THREE.InstancedBufferAttribute(shFades, 1);
    this.shadowFade.setUsage(THREE.DynamicDrawUsage);
    shGeo.setAttribute("aFade", this.shadowFade);
    this.splatScene.add(this.shadowMesh);
  }

  private shadowMesh!: THREE.InstancedMesh;
  private shadowFade!: THREE.InstancedBufferAttribute;

  /** stamp this frame's hull shadows (call before render) */
  updateShadows(boats: { x: number; z: number; yaw: number; intensity: number }[]): void {
    let count = 0;
    for (const b of boats) {
      if (b.intensity <= 0.01) continue;
      this.dummy.position.set(b.x, 0, b.z);
      this.dummy.rotation.set(0, b.yaw, 0);
      this.dummy.scale.set(4.2, 1, 6.4);
      this.dummy.updateMatrix();
      this.shadowMesh.setMatrixAt(count, this.dummy.matrix);
      this.shadowFade.setX(count, b.intensity);
      count++;
    }
    this.shadowMesh.count = count;
    this.shadowMesh.instanceMatrix.needsUpdate = true;
    this.shadowFade.needsUpdate = true;
  }

  spawn(s: Partial<Splat> & { x: number; z: number }, time: number): void {
    const sp = this.splats[this.head];
    this.head = (this.head + 1) % MAX_SPLATS;
    sp.x = s.x;
    sp.z = s.z;
    sp.yaw = s.yaw ?? 0;
    sp.born = time;
    sp.life = s.life ?? 2.5;
    sp.size0 = s.size0 ?? 2;
    sp.growth = s.growth ?? 2;
    sp.stretch = s.stretch ?? 1;
    sp.intensity = s.intensity ?? 1;
    sp.fadeIn = s.fadeIn ?? 0.05;
  }

  /** Rebuild instances and render the splat map. Call once per frame. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, time: number): void {
    // snap the map to texel grid so foam doesn't shimmer as the camera moves
    const texel = MAP_SIZE / RT_RES;
    const cx = Math.round(camera.position.x / texel) * texel;
    const cz = Math.round(camera.position.z / texel) * texel;
    this.center.set(cx, cz);
    this.ortho.position.set(cx, 50, cz);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(cx, 0, cz);
    this.ortho.updateMatrixWorld();

    let count = 0;
    for (const sp of this.splats) {
      const age = time - sp.born;
      if (age < 0 || age > sp.life) continue;
      const t01 = age / sp.life;
      const fadeIn = Math.min(1, age / sp.fadeIn);
      const fade = sp.intensity * fadeIn * (1 - t01) * (1 - t01);
      if (fade < 0.01) continue;
      const size = sp.size0 + sp.growth * age;
      this.dummy.position.set(sp.x, 0, sp.z);
      this.dummy.rotation.set(0, sp.yaw, 0);
      this.dummy.scale.set(size * sp.stretch, 1, size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count, this.dummy.matrix);
      this.aFade.setX(count, fade);
      count++;
      if (count >= MAX_SPLATS) break;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aFade.needsUpdate = true;

    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.splatScene, this.ortho);
    renderer.setRenderTarget(prevRT);
  }
}

// ---------------------------------------------------------------------
// Boat-driven foam emission helper
// ---------------------------------------------------------------------

import type { BoatPhysics } from "../boats/BoatPhysics";

const _stern = new THREE.Vector3();
const _side = new THREE.Vector3();

export class BoatWakeEmitter {
  private lastX = 0;
  private lastZ = 0;
  private initialized = false;
  private ringTimer = 0;

  update(dt: number, time: number, phys: BoatPhysics, foam: FoamSplats): void {
    const speed = Math.abs(phys.speed);
    const pos = phys.position;

    if (!this.initialized) {
      this.lastX = pos.x;
      this.lastZ = pos.z;
      this.initialized = true;
    }

    // hull contact ring: constantly re-stamped while in the water
    this.ringTimer -= dt;
    if (phys.wetness > 0 && this.ringTimer <= 0) {
      this.ringTimer = 0.05;
      foam.spawn(
        {
          x: pos.x,
          z: pos.z,
          yaw: phys.yaw,
          life: 0.55,
          size0: 4.6,
          growth: 0.9,
          stretch: 0.8,
          intensity: 0.85 + Math.min(0.45, speed * 0.02),
          fadeIn: 0.001,
        },
        time
      );
    }

    // wake trail: stamp growing discs along the path travelled
    const dx = pos.x - this.lastX;
    const dz = pos.z - this.lastZ;
    const dist = Math.hypot(dx, dz);
    const spacing = 1.3;
    if (dist > spacing && phys.wetness > 0 && speed > 3) {
      const steps = Math.min(4, Math.floor(dist / spacing));
      for (let i = 0; i < steps; i++) {
        const f = (i + 1) / steps;
        const px = this.lastX + dx * f;
        const pz = this.lastZ + dz * f;
        // stern offset: behind the boat
        _stern.set(0, 0, -2.2).applyQuaternion(phys.quaternion);
        const drifting = phys.driftActive;
        foam.spawn(
          {
            x: px + _stern.x,
            z: pz + _stern.z,
            yaw: phys.yaw,
            life: 2.6 + speed * 0.03,
            size0: 1.8,
            growth: 1.5 + (drifting ? 1.3 : 0),
            stretch: 0.62,
            intensity: Math.min(1.3, 0.55 + speed * 0.028) * (drifting ? 1.25 : 1),
            fadeIn: 0.001,
          },
          time
        );
      }
      this.lastX = pos.x;
      this.lastZ = pos.z;
    } else if (dist > spacing) {
      this.lastX = pos.x;
      this.lastZ = pos.z;
    }

    // bow spray: the hull cutting the water throws small splats out to the sides
    if (phys.wetness > 0.3 && speed > 10 && Math.random() < dt * 22) {
      const side = Math.random() < 0.5 ? 1 : -1;
      _side.set(side * (0.9 + Math.random() * 0.7), 0, 1.4 + Math.random() * 0.6).applyQuaternion(phys.quaternion);
      foam.spawn(
        {
          x: pos.x + _side.x,
          z: pos.z + _side.z,
          life: 0.5 + Math.random() * 0.3,
          size0: 1.0,
          growth: 2.8,
          intensity: 0.7,
          fadeIn: 0.001,
        },
        time
      );
    }

    // slam burst
    if (phys.slam) {
      foam.spawn(
        {
          x: pos.x,
          z: pos.z,
          life: 1.6,
          size0: 4.5,
          growth: 6.5 * phys.slam.strength,
          intensity: 0.8 + phys.slam.strength * 0.5,
        },
        time
      );
    }

    // hard drift: side spray arcs
    if (phys.driftActive && Math.abs(phys.slide) > 2) {
      _side.set(Math.sign(phys.slide) * 1.4, 0, -0.6).applyQuaternion(phys.quaternion);
      foam.spawn(
        {
          x: pos.x + _side.x,
          z: pos.z + _side.z,
          life: 0.9,
          size0: 1.8,
          growth: 2.6,
          intensity: 0.55,
        },
        time
      );
    }
  }
}
