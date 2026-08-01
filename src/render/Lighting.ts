/**
 * Photorealistic lighting: sun directional light, soft sky fill,
 * and a procedural environment map (no downloaded HDRI) fed through
 * PMREM so MeshPhysicalMaterial gets real IBL reflections.
 */

import * as THREE from "three";

export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly envRT: THREE.WebGLRenderTarget;
  readonly sunDir = new THREE.Vector3(0.42, 0.55, 0.28).normalize();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(0x9ec9ff, 0x1a2a18, 0.55);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
    this.sun.position.copy(this.sunDir).multiplyScalar(200);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.camera.left = -80;
    this.sun.shadow.camera.right = 80;
    this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.bias = -0.0002;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Procedural sky/ground env → PMREM
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(50, 32, 24);
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: new THREE.Color(0x4d8fe8) },
        uHorizon: { value: new THREE.Color(0xc8e7ff) },
        uGround: { value: new THREE.Color(0x0a2a4a) },
        uSun: { value: this.sunDir.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uGround, uSun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uGround, uHorizon, smoothstep(-0.2, 0.05, h));
          col = mix(col, uTop, smoothstep(0.05, 0.7, h));
          float sun = pow(max(dot(d, normalize(uSun)), 0.0), 32.0);
          col += vec3(1.0, 0.95, 0.8) * sun * 1.5;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    envScene.add(new THREE.Mesh(envGeo, envMat));

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    this.envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = this.envRT.texture;
    pmrem.dispose();
  }

  follow(target: THREE.Vector3): void {
    this.sun.position.set(
      target.x + this.sunDir.x * 120,
      target.y + this.sunDir.y * 120,
      target.z + this.sunDir.z * 120
    );
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
  }
}
