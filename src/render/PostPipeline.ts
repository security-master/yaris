/**
 * Post pipeline: EffectComposer with a screen-space ink-edge pass.
 *
 * The inverted-hull shells give clean exterior silhouettes; this pass adds
 * the *interior* lines the hull trick can't produce (panel creases, part
 * boundaries, cockpit seams). It runs a normal/depth prepass over "prop"
 * objects only (layer 1: boats, riders, gates, buoys — never the ocean),
 * then a Sobel filter over view-space normals + linearized depth draws
 * ink where geometry creases. Water stays clean, props get their line art.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Palette } from "../core/Palette";

/** Objects on this layer get screen-space interior edge lines. */
export const EDGE_LAYER = 1;

export class PostPipeline {
  private composer: EffectComposer;
  private normalRT: THREE.WebGLRenderTarget;
  private normalMaterial = new THREE.MeshNormalMaterial();
  private edgePass: ShaderPass;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    this.normalRT = new THREE.WebGLRenderTarget(size.x, size.y, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });
    this.normalRT.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.edgePass = new ShaderPass({
      name: "InkEdgePass",
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.normalRT.texture },
        tDepth: { value: this.normalRT.depthTexture },
        uResolution: { value: new THREE.Vector2(size.x, size.y) },
        uInk: { value: new THREE.Color(Palette.ink) },
        uCameraNear: { value: 0.3 },
        uCameraFar: { value: 20000 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tNormal;
        uniform sampler2D tDepth;
        uniform vec2 uResolution;
        uniform vec3 uInk;
        uniform float uCameraNear;
        uniform float uCameraFar;
        varying vec2 vUv;

        float readDepth(vec2 uv) {
          float z = texture2D(tDepth, uv).x;
          float viewZ = perspectiveDepthToViewZ(z, uCameraNear, uCameraFar);
          return -viewZ; // metres in front of the camera
        }

        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          vec2 px = 1.0 / uResolution;

          // 3x3 Sobel over view-space normals and linear depth.
          // Normal RT alpha is 0 where nothing was drawn (non-prop pixels).
          float dX = 0.0;
          float dY = 0.0;
          vec3 nX = vec3(0.0);
          vec3 nY = vec3(0.0);
          float cover = 0.0;

          for (int i = -1; i <= 1; i++) {
            for (int j = -1; j <= 1; j++) {
              vec2 uv = vUv + vec2(float(i), float(j)) * px;
              vec4 nrm = texture2D(tNormal, uv);
              float d = readDepth(uv);
              float kx = float(i) * (j == 0 ? 2.0 : 1.0);
              float ky = float(j) * (i == 0 ? 2.0 : 1.0);
              nX += nrm.xyz * kx;
              nY += nrm.xyz * ky;
              dX += d * kx;
              dY += d * ky;
              cover += nrm.a;
            }
          }
          if (cover < 0.5) { gl_FragColor = color; return; }

          float centerDepth = readDepth(vUv);
          float normalEdge = length(nX) + length(nY);
          // depth edge threshold scales with distance (perspective)
          float depthEdge = (abs(dX) + abs(dY)) / max(centerDepth, 1.0);

          float edge = 0.0;
          edge = max(edge, smoothstep(1.35, 2.1, normalEdge));
          edge = max(edge, smoothstep(0.02, 0.05, depthEdge));

          // thin the lines with distance so far boats don't turn to mush
          edge *= 1.0 - smoothstep(140.0, 260.0, centerDepth);

          gl_FragColor = vec4(mix(color.rgb, uInk, edge * 0.85), color.a);
        }
      `,
    });
    // edge pass is the final pass — no OutputPass: the NPR palette is
    // authored in display space and must reach the screen untouched.
    this.composer.addPass(this.edgePass);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.normalRT.setSize(size.x, size.y);
    (this.edgePass.uniforms.uResolution.value as THREE.Vector2).set(size.x, size.y);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    // ---- normal/depth prepass over prop layer only ----
    const prevLayers = camera.layers.mask;
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;
    camera.layers.set(EDGE_LAYER);
    scene.overrideMaterial = this.normalMaterial;
    scene.background = null;

    const prevRT = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.normalRT);
    this.renderer.setClearColor(0x000000, 0); // alpha 0 marks "no prop here"
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(prevRT);

    camera.layers.mask = prevLayers;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;

    this.edgePass.uniforms.uCameraNear.value = camera.near;
    this.edgePass.uniforms.uCameraFar.value = camera.far;

    // ---- main render through the composer ----
    this.composer.render();
  }
}

/** Put a hierarchy's meshes on the edge-detection layer. */
export function enableEdgeLines(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.name.endsWith("_outline")) {
      o.layers.enable(EDGE_LAYER);
    }
  });
}
