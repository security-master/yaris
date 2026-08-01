/**
 * Game orchestrator: owns the renderer, scene, systems and the
 * race state machine (title -> countdown -> racing -> finished).
 */

import * as THREE from "three";
import { Ocean } from "../water/Ocean";
import { Sky } from "../render/Sky";
import { Input } from "./Input";
import { ChaseCamera } from "../camera/ChaseCamera";
import { getWaterHeight } from "../water/waves";

export type GameState = "title" | "countdown" | "racing" | "finished";

const FIXED_DT = 1 / 120;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly input: Input;
  readonly chase: ChaseCamera;
  readonly ocean: Ocean;
  readonly sky: Sky;

  state: GameState = "title";
  /** simulation time (drives waves, physics, animation) */
  time = 0;
  private accumulator = 0;
  private harnessMode: boolean;

  // temporary M1 target: a point bobbing on the swell
  private dummyTarget = {
    position: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    speed: 0,
  };

  constructor(container: HTMLElement, harnessMode = false) {
    this.harnessMode = harnessMode;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.input = new Input();
    this.chase = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.ocean = new Ocean(this.scene);
    this.sky = new Sky(this.scene);
    this.ocean.sunDir.copy(this.sky.sunDir);

    window.addEventListener("resize", () => this.onResize());

    if (!this.harnessMode) {
      this.renderer.setAnimationLoop((t) => this.frame(t));
    }
  }

  private lastT = -1;
  private frame(tMs: number): void {
    if (this.lastT < 0) this.lastT = tMs;
    let dt = (tMs - this.lastT) / 1000;
    this.lastT = tMs;
    dt = Math.min(dt, 0.1);
    this.advance(dt);
    this.render();
  }

  /** Advance simulation by dt seconds using fixed physics steps. */
  advance(dt: number): void {
    this.accumulator += dt;
    while (this.accumulator >= FIXED_DT) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
    this.updateVisuals(dt);
  }

  private step(dt: number): void {
    this.time += dt;
    this.input.update(dt);

    // M1: dummy target rides the swell so the camera has something to frame
    const t = this.dummyTarget;
    t.position.set(0, getWaterHeight(0, 0, this.time) + 0.5, 0);
  }

  private updateVisuals(dt: number): void {
    this.chase.update(dt, this.time, this.dummyTarget);
    this.ocean.update(this.time, this.chase.camera);
    this.sky.update(this.time, this.chase.camera);
  }

  render(): void {
    this.renderer.render(this.scene, this.chase.camera);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.chase.camera.aspect = w / h;
    this.chase.camera.updateProjectionMatrix();
  }
}
