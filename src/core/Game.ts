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
import { Course } from "../race/Course";
import { RaceManager } from "../race/RaceManager";
import { AIController, AI_PERSONALITIES } from "../ai/AIController";
import { Palette } from "./Palette";
import { setToonSun } from "../render/ToonMaterial";
import { OUTLINE_RESOLUTION } from "../render/Outline";
import { PostPipeline, enableEdgeLines } from "../render/PostPipeline";

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
  readonly course: Course;
  readonly race: RaceManager;
  readonly ais: AIController[] = [];
  private post!: PostPipeline;
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

    this.course = new Course(this.scene);
    this.race = new RaceManager(this.course);

    // grid: staggered pairs behind the start line (player in front row)
    const gridSlots = [8, 14, 20, 26]; // metres behind the line
    const lateral = [3.2, -3.2, 3.2, -3.2];
    for (let i = 0; i < 4; i++) {
      const back = gridSlots[i] / this.course.length;
      const t = this.course.absParam(1 - back);
      const p = this.course.curve.getPointAt(t);
      const tan = this.course.curve.getTangentAt(t);
      const yaw = Math.atan2(tan.x, tan.z);
      const sideX = -tan.z * lateral[i];
      const sideZ = tan.x * lateral[i];
      const boat = new Boat(
        this.scene,
        Palette.liveries[i],
        i,
        i === 0,
        p.x + sideX,
        p.z + sideZ,
        yaw
      );
      this.boats.push(boat);
      enableEdgeLines(boat.group);
      this.race.addBoat(boat);
      if (i > 0) {
        this.ais.push(new AIController(boat, AI_PERSONALITIES[i - 1], i));
      }
    }
    this.player = this.boats[0];

    this.post = new PostPipeline(this.renderer, this.scene, this.chase.camera);

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
      if (!this.race.running) this.race.start();
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
          this.race.start();
        }
        break;
      }
      case "racing": {
        const pc = this.player.physics.controls;
        pc.throttle = this.input.throttle;
        pc.brake = this.input.brake;
        pc.steer = this.input.steer;
        pc.drift = this.input.drift;
        this.updateAI(dt);
        this.race.update(dt);
        if (this.race.playerFinished) {
          this.state = "finished";
          this.chase.mode = "finish";
        }
        break;
      }
      case "finished": {
        // player coasts; AI keep racing in the background of the results cam
        this.player.physics.controls.throttle = 0;
        this.player.physics.controls.drift = false;
        this.updateAI(dt);
        this.race.update(dt);
        break;
      }
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
      this.resolveBoatCollisions();
    }
  }

  private updateAI(dt: number): void {
    const playerState = this.race.racers[0] ?? null;
    for (let i = 0; i < this.ais.length; i++) {
      const ai = this.ais[i];
      const state = this.race.racers[i + 1];
      ai.update(dt, this.course, this.race, state, this.boats.map((b) => b), playerState);
    }
  }

  private static _sep = new THREE.Vector3();
  /** simple sphere-sphere pushes between boats, with a bit of bounce */
  private resolveBoatCollisions(): void {
    const R = 1.9; // effective boat radius
    for (let i = 0; i < this.boats.length; i++) {
      for (let j = i + 1; j < this.boats.length; j++) {
        const a = this.boats[i].physics;
        const b = this.boats[j].physics;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        if (d > R * 2 || d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        const overlap = R * 2 - d;
        a.position.x -= nx * overlap * 0.5;
        a.position.z -= nz * overlap * 0.5;
        b.position.x += nx * overlap * 0.5;
        b.position.z += nz * overlap * 0.5;
        // exchange a portion of the closing velocity along the normal
        const rvx = b.velocity.x - a.velocity.x;
        const rvz = b.velocity.z - a.velocity.z;
        const closing = rvx * nx + rvz * nz;
        if (closing < 0) {
          const impulse = -closing * 0.65;
          a.velocity.x -= nx * impulse * 0.5;
          a.velocity.z -= nz * impulse * 0.5;
          b.velocity.x += nx * impulse * 0.5;
          b.velocity.z += nz * impulse * 0.5;
          const hard = Math.min(1, -closing / 8);
          if ((this.boats[i].isPlayer || this.boats[j].isPlayer) && hard > 0.15) {
            this.chase.addShake(hard * 0.5);
          }
          // splash where they banged together
          this.foam.spawn(
            {
              x: (a.position.x + b.position.x) / 2,
              z: (a.position.z + b.position.z) / 2,
              life: 1.0,
              size0: 3,
              growth: 4 * hard,
              intensity: 0.6 + hard * 0.5,
              fadeIn: 0.001,
            },
            this.time
          );
        }
      }
    }
  }

  private updateVisuals(dt: number): void {
    for (const b of this.boats) b.update(dt);
    this.chase.update(dt, this.time, this.chaseTarget());
    this.ocean.update(this.time, this.chase.camera);
    this.sky.update(this.time, this.chase.camera);
    this.course.update(this.time, this.chase.camera);
  }

  render(): void {
    this.foam.render(this.renderer, this.chase.camera, this.time);
    this.post.render(this.scene, this.chase.camera);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.chase.camera.aspect = w / h;
    this.chase.camera.updateProjectionMatrix();
    OUTLINE_RESOLUTION.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
    this.post.setSize(w, h);
  }
}
