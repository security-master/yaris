/**
 * Game orchestrator: owns the renderer, scene, systems and the
 * race state machine (title -> countdown -> racing -> finished).
 */

import * as THREE from "three";
import { Ocean } from "../water/Ocean";
import { Sky } from "../render/Sky";
import { Input } from "./Input";
import { ChaseCamera } from "../camera/ChaseCamera";
import { Boat } from "../boats/Boat";
import { FoamSplats } from "../water/FoamSplats";
import { Palette } from "./Palette";
import { setToonSun } from "../render/ToonMaterial";
import { OUTLINE_RESOLUTION } from "../render/Outline";

export type GameState = "title" | "countdown" | "racing" | "finished";

const FIXED_DT = 1 / 120;
const COUNTDOWN_TIME = 3.6;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly input: Input;
  readonly chase: ChaseCamera;
  readonly ocean: Ocean;
  readonly sky: Sky;
  readonly foam: FoamSplats;
  readonly boats: Boat[] = [];
  player!: Boat;

  state: GameState = "countdown";
  countdown = COUNTDOWN_TIME;
  /** simulation time (drives waves, physics, animation) */
  time = 0;
  private accumulator = 0;
  private harnessMode: boolean;

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
    setToonSun(this.sky.sunDir);
    this.foam = new FoamSplats();
    this.ocean.setFoamMap(this.foam.texture, this.foam.center, this.foam.size);

    // player boat (AI boats arrive in milestone 5)
    this.player = new Boat(this.scene, Palette.liveries[0], 0, true, 0, 0, 0);
    this.boats.push(this.player);

    this.chase.mode = "orbit";
    this.chase.snapBehind(this.chaseTarget());

    OUTLINE_RESOLUTION.value.set(
      window.innerWidth * this.renderer.getPixelRatio(),
      window.innerHeight * this.renderer.getPixelRatio()
    );
    window.addEventListener("resize", () => this.onResize());

    if (!this.harnessMode) {
      this.renderer.setAnimationLoop((t) => this.frame(t));
    }
  }

  private chaseTarget() {
    return {
      position: this.player.physics.position,
      quaternion: this.player.physics.quaternion,
      speed: this.player.physics.speed,
      velocity: this.player.physics.velocity,
    };
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

  /** Harness hook: jump straight into a state. */
  forceState(name: GameState): void {
    this.state = name;
    if (name === "racing") {
      this.countdown = 0;
      this.chase.mode = "chase";
      this.chase.snapBehind(this.chaseTarget());
    } else if (name === "countdown") {
      this.countdown = COUNTDOWN_TIME;
      this.chase.mode = "orbit";
    } else if (name === "finished") {
      this.chase.mode = "finish";
    }
  }

  private step(dt: number): void {
    this.time += dt;
    this.input.update(dt);

    switch (this.state) {
      case "countdown": {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.state = "racing";
          this.chase.mode = "chase";
          this.chase.snapBehind(this.chaseTarget());
        }
        break;
      }
      case "racing": {
        const pc = this.player.physics.controls;
        pc.throttle = this.input.throttle;
        pc.brake = this.input.brake;
        pc.steer = this.input.steer;
        pc.drift = this.input.drift;
        break;
      }
      case "finished":
      case "title":
        this.player.physics.controls.throttle = 0;
        this.player.physics.controls.drift = false;
        break;
    }

    // physics for all boats (frozen during countdown so the grid holds)
    if (this.state !== "countdown") {
      for (const b of this.boats) {
        b.physics.step(dt, this.time);
        b.wake.update(dt, this.time, b.physics, this.foam);
        if (b.physics.slam && b.isPlayer) {
          this.chase.addShake(b.physics.slam.strength * 0.8);
        }
      }
    }
  }

  private updateVisuals(dt: number): void {
    for (const b of this.boats) b.update(dt);
    this.chase.update(dt, this.time, this.chaseTarget());
    this.ocean.update(this.time, this.chase.camera);
    this.sky.update(this.time, this.chase.camera);
  }

  render(): void {
    this.foam.render(this.renderer, this.chase.camera, this.time);
    this.renderer.render(this.scene, this.chase.camera);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.chase.camera.aspect = w / h;
    this.chase.camera.updateProjectionMatrix();
    OUTLINE_RESOLUTION.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }
}
