/**
 * Game orchestrator: renderer, systems, race state machine
 * (menu -> countdown -> racing -> finished).
 */

import * as THREE from "three";
import { Ocean } from "../water/Ocean";
import { Sky } from "../render/Sky";
import { Lighting } from "../render/Lighting";
import { Input } from "./Input";
import { ChaseCamera } from "../camera/ChaseCamera";
import { Boat } from "../boats/Boat";
import { FoamSplats } from "../water/FoamSplats";
import { Course } from "../race/Course";
import { RaceManager } from "../race/RaceManager";
import { Buoys } from "../race/Buoys";
import { GuideArrows } from "../race/GuideArrows";
import { TrackRail } from "../race/TrackRail";
import { AIController, AI_PERSONALITIES } from "../ai/AIController";
import { HUD } from "../ui/HUD";
import { Menu } from "../ui/Menu";
import { AudioEngine } from "../audio/AudioEngine";
import { MusicPlayer } from "../audio/Music";
import { Spray, BoatSprayEmitter } from "../water/Spray";
import { Quality } from "./Quality";
import { Palette } from "./Palette";
import { setToonSun } from "../render/ToonMaterial";

export type GameState = "menu" | "countdown" | "racing" | "finished";

const FIXED_DT = 1 / 120;
const COUNTDOWN_TIME = 3.6;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly input: Input;
  readonly chase: ChaseCamera;
  readonly ocean: Ocean;
  readonly sky: Sky;
  readonly lighting: Lighting;
  readonly foam: FoamSplats;
  readonly boats: Boat[] = [];
  readonly course: Course;
  readonly race: RaceManager;
  readonly ais: AIController[] = [];
  readonly hud: HUD;
  readonly menu: Menu;
  readonly audio: AudioEngine;
  readonly music: MusicPlayer;
  readonly spray: Spray;
  readonly buoys: Buoys;
  readonly guides: GuideArrows;
  readonly rail: TrackRail;
  private sprayEmitters: BoatSprayEmitter[] = [];
  private quality: Quality | null = null;
  private lastCountdownBeep = 99;
  private prevGateFlash = 0;
  private prevBoostTime = 0;
  private resultPosted = false;
  player!: Boat;

  state: GameState = "menu";
  countdown = COUNTDOWN_TIME;
  autopilot = false;
  private autopilotAI: AIController | null = null;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.input = new Input();
    this.chase = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.lighting = new Lighting(this.renderer, this.scene);
    this.ocean = new Ocean(this.scene);
    this.sky = new Sky(this.scene);
    this.ocean.sunDir.copy(this.lighting.sunDir);
    setToonSun(this.lighting.sunDir);
    this.foam = new FoamSplats();
    this.ocean.setFoamMap(this.foam.texture, this.foam.center, this.foam.size);

    this.course = new Course(this.scene);
    this.race = new RaceManager(this.course);
    this.rail = new TrackRail(this.course);

    for (let i = 0; i < 4; i++) {
      const slot = this.gridSlot(i);
      const boat = new Boat(this.scene, { ...Palette.liveries[i] }, i, i === 0, slot.x, slot.z, slot.yaw);
      this.boats.push(boat);
      this.race.addBoat(boat);
      this.sprayEmitters.push(new BoatSprayEmitter());
      if (i > 0) this.ais.push(new AIController(boat, AI_PERSONALITIES[i - 1], i));
    }
    this.player = this.boats[0];
    this.spray = new Spray(this.scene);
    this.buoys = new Buoys(this.scene, this.course);
    this.guides = new GuideArrows(this.scene, this.course);
    this.chase.obstacles = this.course.pylons;

    this.audio = new AudioEngine();
    this.music = new MusicPlayer();
    this.hud = new HUD(this);
    this.menu = new Menu(this.music, this.audio);
    this.menu.onStart = (color) => this.beginRace(color);

    this.chase.mode = "orbit";
    this.chase.snapBehind(this.chaseTarget());

    window.addEventListener("resize", () => this.onResize());

    if (this.harnessMode) {
      this.menu.hide();
      this.state = "countdown";
    } else {
      this.state = "menu";
      this.menu.show();
    }

    if (!this.harnessMode) {
      this.quality = new Quality((pr) => this.applyPixelRatio(pr));
      this.renderer.setAnimationLoop((t) => this.frame(t));
    }
  }

  private applyPixelRatio(pr: number): void {
    this.renderer.setPixelRatio(pr);
    this.onResize();
  }

  private gridSlot(i: number): { x: number; z: number; yaw: number } {
    const gridSlots = [8, 14, 20, 26];
    const lateral = [3.2, -3.2, 3.2, -3.2];
    const back = gridSlots[i] / this.course.length;
    const t = this.course.absParam(1 - back);
    const p = this.course.curve.getPointAt(t);
    const tan = this.course.curve.getTangentAt(t);
    const tanStart = this.course.curve.getTangentAt(this.course.startParam);
    const yaw = Math.atan2(tanStart.x, tanStart.z);
    return { x: p.x - tan.z * lateral[i], z: p.z + tan.x * lateral[i], yaw };
  }

  beginRace(boatColor: number): void {
    this.player.setHullColor(boatColor);
    this.resultPosted = false;
    this.resetRace(false);
    this.state = "countdown";
    this.countdown = COUNTDOWN_TIME;
    this.lastCountdownBeep = 99;
    this.chase.mode = "orbit";
    this.chase.snapBehind(this.chaseTarget());
    this.music.start();
  }

  resetRace(showMenu = true): void {
    for (let i = 0; i < this.boats.length; i++) {
      const slot = this.gridSlot(i);
      this.boats[i].physics.reset(slot.x, slot.z, slot.yaw, this.time);
      this.boats[i].celebrating = false;
    }
    this.race.reset();
    this.resultPosted = false;
    if (showMenu && !this.harnessMode) {
      this.state = "menu";
      this.menu.show();
      this.chase.mode = "orbit";
    } else {
      this.state = "countdown";
      this.countdown = COUNTDOWN_TIME;
      this.lastCountdownBeep = 99;
      this.chase.mode = "orbit";
    }
    this.chase.snapBehind(this.chaseTarget());
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
    const rawDt = tMs - this.lastT;
    this.lastT = tMs;
    const dt = Math.min(rawDt / 1000, 0.1);
    this.quality?.frame(rawDt);
    this.advance(dt);
    this.render();
  }

  advance(dt: number): void {
    this.accumulator += dt;
    while (this.accumulator >= FIXED_DT) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
    this.updateVisuals(dt);
  }

  forceState(name: GameState | "title"): void {
    if (name === "title") name = "menu";
    this.state = name as GameState;
    if (name === "racing") {
      this.menu.hide();
      this.countdown = 0;
      this.chase.mode = "chase";
      this.chase.snapBehind(this.chaseTarget());
      if (!this.race.running) this.race.start();
    } else if (name === "countdown") {
      this.menu.hide();
      this.countdown = COUNTDOWN_TIME;
      this.chase.mode = "orbit";
    } else if (name === "finished") {
      this.menu.hide();
      this.chase.mode = "finish";
    } else if (name === "menu") {
      this.menu.show();
    }
  }

  private step(dt: number): void {
    this.time += dt;
    this.input.update(dt);

    switch (this.state) {
      case "menu":
        break;
      case "countdown": {
        this.countdown -= dt;
        if (this.input.confirmPressed || this.input.throttle > 0.5) {
          this.countdown = Math.min(this.countdown, 0);
        }
        const beep = Math.ceil(this.countdown);
        if (beep < this.lastCountdownBeep && beep >= 1 && beep <= 3) {
          this.lastCountdownBeep = beep;
          this.audio.horn(false);
        }
        if (this.countdown <= 0) {
          this.state = "racing";
          this.chase.mode = "chase";
          this.chase.snapBehind(this.chaseTarget());
          this.race.start();
          this.audio.horn(true);
          this.hud.notifyGo();
        }
        break;
      }
      case "racing": {
        if (this.autopilot) {
          if (!this.autopilotAI) {
            this.autopilotAI = new AIController(
              this.player,
              { name: "AUTO", skill: 0.95, aggression: 0.8, erratic: 0.05, lineBias: 0 },
              99
            );
          }
          this.autopilotAI.update(dt, this.course, this.race, this.race.racers[0], this.boats, null);
        } else {
          const pc = this.player.physics.controls;
          pc.throttle = this.input.throttle;
          pc.brake = this.input.brake;
          pc.steer = -this.input.steer;
          pc.drift = this.input.drift;
        }
        this.updateAI(dt);
        this.race.update(dt);
        if (this.race.playerFinished) {
          this.state = "finished";
          this.chase.mode = "finish";
          void this.postResult();
        }
        break;
      }
      case "finished": {
        this.player.physics.controls.throttle = 0;
        this.player.physics.controls.drift = false;
        this.updateAI(dt);
        this.race.update(dt);
        if (this.input.confirmPressed) this.resetRace(true);
        break;
      }
    }

    if (this.state !== "countdown" && this.state !== "menu") {
      for (let i = 0; i < this.boats.length; i++) {
        const b = this.boats[i];
        b.physics.thrustMul = 1;
        b.physics.step(dt, this.time);
        // keep everyone near the racing line
        const rel = this.race.racers[i]?.param ?? 0;
        this.rail.apply(b.physics, rel, dt);
        b.wake.update(dt, this.time, b.physics, this.foam);
        this.sprayEmitters[i].update(dt, this.time, b.physics, this.spray);
        if (b.physics.slam && b.isPlayer) {
          this.chase.addShake(b.physics.slam.strength * 0.8);
          this.audio.slam(b.physics.slam.strength);
        }
      }
      this.resolveBoatCollisions();
    }

    const pr = this.race.racers[0];
    if (pr) {
      if (pr.gateFlash > this.prevGateFlash + 0.01) this.audio.gateChime();
      this.prevGateFlash = pr.gateFlash;
    }
    const pb = this.player.physics;
    if (pb.boostTime > this.prevBoostTime + 0.01) this.audio.boostWhoosh();
    this.prevBoostTime = pb.boostTime;
  }

  private async postResult(): Promise<void> {
    if (this.resultPosted) return;
    this.resultPosted = true;
    const r = this.race.racers[0];
    if (!r) return;
    const best = r.lapTimes.length ? Math.min(...r.lapTimes) : null;
    await this.menu.publishResult({
      finishTimeMs: Math.round(r.finishTime * 1000),
      bestLapMs: best != null ? Math.round(best * 1000) : null,
      position: r.position,
      boatColor: this.player.livery.hull,
      missedGates: r.missedGates,
    });
  }

  private updateAI(dt: number): void {
    const playerState = this.race.racers[0] ?? null;
    for (let i = 0; i < this.ais.length; i++) {
      const ai = this.ais[i];
      const state = this.race.racers[i + 1];
      ai.update(dt, this.course, this.race, state, this.boats, playerState);
    }
  }

  private resolveBoatCollisions(): void {
    const R = 1.9;
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
            this.audio.collision(hard);
          }
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
    for (let i = 0; i < this.boats.length; i++) {
      const b = this.boats[i];
      b.celebrating = this.race.racers[i]?.finished ?? false;
      b.update(dt, this.time);
    }
    if (this.state !== "menu") {
      this.chase.update(dt, this.time, this.chaseTarget());
    } else {
      this.chase.mode = "orbit";
      this.chase.update(dt, this.time, this.chaseTarget());
    }
    this.lighting.follow(this.player.physics.position);
    this.ocean.update(this.time, this.chase.camera);
    this.sky.update(this.time, this.chase.camera);
    this.course.setBoatPositions(this.boats.map((b) => b.physics.position));
    this.course.update(this.time, this.chase.camera);
    this.buoys.update(this.time, this.chase.camera);
    const rel = this.race.racers[0]?.param ?? 0;
    this.guides.update(this.time, rel);
    this.spray.update(this.time);
    if (this.state !== "menu") this.hud.update(dt);

    const pb = this.player.physics;
    this.audio.update({
      speed: pb.speed,
      throttle: pb.controls.throttle,
      wetness: pb.wetness,
      drifting: pb.driftActive,
      boosting: pb.boostTime > 0,
      airborne: pb.airborne,
    });
  }

  render(): void {
    this.renderer.info.reset();
    this.foam.updateShadows(
      this.boats.map((b) => ({
        x: b.physics.position.x,
        z: b.physics.position.z,
        yaw: b.physics.yaw,
        intensity: Math.min(1, b.physics.wetness + 0.25),
      }))
    );
    this.foam.render(this.renderer, this.chase.camera, this.time);
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
