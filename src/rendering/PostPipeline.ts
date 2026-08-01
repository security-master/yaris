/**
 * Screen-space edge detection post pass.
 * Renders normal+depth prepass, Sobel filter for interior lines.
 * Tuned to complement inverted-hull silhouettes (not double up).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Palette } from '../palette';

const normalDepthVert = /* glsl */ `
varying vec3 vViewNormal;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const normalDepthFrag = /* glsl */ `
varying vec3 vViewNormal;
varying float vDepth;
void main() {
  // Pack view normal in rgb, linearized depth in a
  vec3 n = normalize(vViewNormal) * 0.5 + 0.5;
  float d = clamp(vDepth / 220.0, 0.0, 1.0);
  gl_FragColor = vec4(n, d);
}
`;

const sobelShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormalDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uInk: { value: new THREE.Color(Palette.ink) },
    uEdgeStrength: { value: 1.15 },
    uDepthStrength: { value: 0.85 },
    uNormalStrength: { value: 1.0 },
    uThreshold: { value: 0.12 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormalDepth;
    uniform vec2 uResolution;
    uniform vec3 uInk;
    uniform float uEdgeStrength;
    uniform float uDepthStrength;
    uniform float uNormalStrength;
    uniform float uThreshold;
    varying vec2 vUv;

    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec4 center = texture2D(tNormalDepth, vUv);
      vec4 n1 = texture2D(tNormalDepth, vUv + vec2(-texel.x, -texel.y));
      vec4 n2 = texture2D(tNormalDepth, vUv + vec2(0.0, -texel.y));
      vec4 n3 = texture2D(tNormalDepth, vUv + vec2(texel.x, -texel.y));
      vec4 n4 = texture2D(tNormalDepth, vUv + vec2(-texel.x, 0.0));
      vec4 n5 = texture2D(tNormalDepth, vUv + vec2(texel.x, 0.0));
      vec4 n6 = texture2D(tNormalDepth, vUv + vec2(-texel.x, texel.y));
      vec4 n7 = texture2D(tNormalDepth, vUv + vec2(0.0, texel.y));
      vec4 n8 = texture2D(tNormalDepth, vUv + vec2(texel.x, texel.y));

      // Sobel on normals
      vec3 nx = -n1.rgb - 2.0*n4.rgb - n6.rgb + n3.rgb + 2.0*n5.rgb + n8.rgb;
      vec3 ny = -n1.rgb - 2.0*n2.rgb - n3.rgb + n6.rgb + 2.0*n7.rgb + n8.rgb;
      float nEdge = length(nx) + length(ny);

      // Sobel on depth
      float dx = -n1.a - 2.0*n4.a - n6.a + n3.a + 2.0*n5.a + n8.a;
      float dy = -n1.a - 2.0*n2.a - n3.a + n6.a + 2.0*n7.a + n8.a;
      float dEdge = abs(dx) + abs(dy);

      float edge = nEdge * uNormalStrength + dEdge * uDepthStrength * 8.0;
      // Hard threshold — graphic ink, avoid mushy AA outlines
      float line = step(uThreshold, edge) * uEdgeStrength;
      // Suppress very strong silhouette edges (hull outlines own those)
      line *= 1.0 - smoothstep(0.35, 0.7, dEdge * 10.0) * 0.65;

      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb = mix(color.rgb, uInk, clamp(line, 0.0, 0.85));
      gl_FragColor = color;
    }
  `,
};

export class PostPipeline {
  readonly composer: EffectComposer;
  private ndTarget: THREE.WebGLRenderTarget;
  private ndScene = new THREE.Scene();
  private ndMaterial: THREE.ShaderMaterial;
  private sobelPass: ShaderPass;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private enabled = true;
  private outlineRoots: THREE.Object3D[] = [];

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.ndTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.ndMaterial = new THREE.ShaderMaterial({
      vertexShader: normalDepthVert,
      fragmentShader: normalDepthFrag,
    });

    this.sobelPass = new ShaderPass(sobelShader);
    this.composer.addPass(this.sobelPass);
  }

  setOutlineRoots(roots: THREE.Object3D[]): void {
    this.outlineRoots = roots;
  }

  setSize(w: number, h: number, dpr: number): void {
    const rw = Math.floor(w * dpr);
    const rh = Math.floor(h * dpr);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(dpr);
    this.ndTarget.setSize(rw, rh);
    this.sobelPass.uniforms.uResolution.value.set(rw, rh);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.sobelPass.enabled = on;
  }

  render(): void {
    if (this.enabled) {
      this.renderNormalDepth();
      this.sobelPass.uniforms.tNormalDepth.value = this.ndTarget.texture;
    }
    this.composer.render();
  }

  private renderNormalDepth(): void {
    // Override materials on race objects only (skip water/sky for cleaner interior lines)
    const prev = this.renderer.getRenderTarget();
    const prevBg = this.scene.background;
    this.scene.background = new THREE.Color(0x000000);

    const overrides: { obj: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
    const hide: THREE.Object3D[] = [];

    this.scene.traverse((obj) => {
      if (obj.name === 'Ocean' || obj.userData?.skipEdge) {
        if (obj.visible) {
          hide.push(obj);
          obj.visible = false;
        }
      }
      if ((obj as THREE.Mesh).isMesh && obj.userData?.celShaded) {
        const mesh = obj as THREE.Mesh;
        overrides.push({ obj: mesh, mat: mesh.material });
        mesh.material = this.ndMaterial;
      }
    });

    this.renderer.setRenderTarget(this.ndTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    for (const h of hide) h.visible = true;
    for (const o of overrides) o.obj.material = o.mat;
    this.scene.background = prevBg;
    this.renderer.setRenderTarget(prev);
  }

  dispose(): void {
    this.ndTarget.dispose();
    this.ndMaterial.dispose();
    this.composer.dispose();
  }
}
