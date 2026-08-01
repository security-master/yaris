/**
 * CELWAKE game orchestrator — wires all subsystems.
 */
import * as THREE from 'three';
import { Input } from './Input';
import { Time } from './Time';
import { WaterSystem } from '../water/WaterSystem';
import { FoamWake } from '../water/FoamWake';
import { sampleGerstner } from '../water/gerstner';
import { SkyAtmosphere } from '../rendering/SkyAtmosphere';
import { PostPipeline } from '../rendering/PostPipeline';
import { Boat } from '../boats/Boat';
import { createTrackCurve, getTrackFrame } from '../course/TrackSpline';
import { RacingLine } from '../course/RacingLine';
import { GateField } from '../course/Gates';
import { AIRacer } from '../ai/AIRacer';
import { RaceManager } from '../race/RaceManager';
import { ChaseCam, type CameraMode } from '../camera/ChaseCam';
import { HUD } from '../hud/HUD';
import { SynthAudio } from '../audio/SynthAudio';
import { PerfBudget } from '../perf/PerfBudget';
import { Palette } from '../palette';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly time = new Time();
  readonly input = new Input();

  private water: WaterSystem;
  private foam: FoamWake;
  private sky: SkyAtmosphere;
  private post: PostPipeline;
  private cam: ChaseCam;
  private boats: Boat[] = [];
  private ais: (AIRacer | null)[] = [];
  private curve: THREE.CatmullRomCurve3;
  private racingLine: RacingLine;
  private gates: GateField;
  private race = new RaceManager();
  private hud: HUD;
  private audio = new SynthAudio();
  private perf: PerfBudget;
  private trackPts: { x: number; z: number }[] = [];
  private hornPlayed = false;
  private lastImpacts: number[] = [];
  private running = true;

  constructor(canvas: HTMLCanvasElement, hudHost: HTMLElement, overlay: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(Palette.skyHorizon);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.perf = new PerfBudget(this.renderer);
    this.cam = new ChaseCam(window.innerWidth / window.innerHeight);
    this.post = new PostPipeline(this.renderer, this.scene, this.cam.camera);
    this.post.setSize(window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());

    this.sky = new SkyAtmosphere();
    this.scene.add(this.sky.group);

    this.water = new WaterSystem(420, 160);
    this.scene.add(this.water.mesh);

    this.foam = new FoamWake(4);
    this.scene.add(this.foam.group);

    this.curve = createTrackCurve();
    this.racingLine = new RacingLine(this.curve);
    this.scene.add(this.racingLine.mesh);
    this.gates = new GateField(this.curve, 10);
    this.scene.add(this.gates.group);

    for (let i = 0; i <= 80; i++) {
      const p = this.curve.getPointAt(i / 80);
      this.trackPts.push({ x: p.x, z: p.z });
    }

    this.hud = new HUD(hudHost, overlay);
    this.spawnBoats();
    this.race.init(
      this.boats.map((b) => ({ id: b.id, name: b.name, isPlayer: b.isPlayer })),
    );

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        this.audio.resume();
        if (this.race.phase === 'idle') this.beginRace();
      }
      if (e.code === 'KeyR' && this.race.phase === 'finished') this.restart();
    });
    window.addEventListener('pointerdown', () => this.audio.resume());
  }

  private spawnBoats(): void {
    const names = ['YOU', 'REEF', 'JET', 'KOI'];
    const colors = [Palette.playerHull, ...Palette.aiHulls];
    const personalities: Array<'aggressive' | 'clean' | 'erratic' | null> = [
      null,
      'aggressive',
      'clean',
      'erratic',
    ];

    for (let i = 0; i < 4; i++) {
      const boat = new Boat(i, i === 0, names[i], colors[i]);
      const lane = (i - 1.5) * 3.2;
      const frame = getTrackFrame(this.curve, 0);
      const right = new THREE.Vector3(-frame.tangent.z, 0, frame.tangent.x);
      const pos = frame.position.clone().addScaledVector(right, lane).addScaledVector(frame.tangent, -i * 2.5);
      boat.spawn(pos.x, pos.z, frame.yaw);
      this.scene.add(boat.group);
      this.boats.push(boat);
      this.ais.push(
        personalities[i]
          ? new AIRacer({ personality: personalities[i]!, skill: 0.7 + i * 0.05 })
          : null,
      );
      this.lastImpacts.push(0);
    }
    this.cam.snapBehind(this.boats[0].physics.state.position, this.boats[0].physics.state.yaw);
  }

  beginRace(): void {
    this.hornPlayed = false;
    this.race.startCountdown();
    this.cam.mode = 'orbit';
  }

  restart(): void {
    for (const b of this.boats) this.scene.remove(b.group);
    this.boats = [];
    this.ais = [];
    this.lastImpacts = [];
    this.spawnBoats();
    this.race.init(
      this.boats.map((b) => ({ id: b.id, name: b.name, isPlayer: b.isPlayer })),
    );
    this.cam.mode = 'chase';
    this.hornPlayed = false;
  }

  /** Harness controls */
  setCameraMode(mode: CameraMode): void {
    this.cam.mode = mode;
  }

  seekRace(phase: 'countdown' | 'midlap' | 'finish'): void {
    if (phase === 'countdown') {
      this.restart();
      this.beginRace();
      this.time.forcedElapsed = null;
    } else if (phase === 'midlap') {
      this.restart();
      this.race.phase = 'racing';
      this.race.countdown = 0;
      this.cam.mode = 'chase';
      // Push racers along track, seated on the live wave field
      const t = this.time.elapsed;
      for (let i = 0; i < this.boats.length; i++) {
        const u = 0.22 + i * 0.03;
        const frame = getTrackFrame(this.curve, u);
        const lane = (i - 1.5) * 2.5;
        const right = new THREE.Vector3(-frame.tangent.z, 0, frame.tangent.x);
        const pos = frame.position.clone().addScaledVector(right, lane);
        const wave = sampleGerstner(pos.x, pos.z, t);
        this.boats[i].spawn(pos.x, pos.z, frame.yaw);
        this.boats[i].physics.state.position.y = wave.height + 0.4;
        this.boats[i].physics.state.speed = 24;
        this.boats[i].physics.state.velocity.set(
          Math.cos(frame.yaw) * 24,
          0,
          Math.sin(frame.yaw) * 24,
        );
        this.boats[i].updateVisual(0, t, 0.8);
        this.ais[i]?.setProgress(u);
      }
      this.cam.mode = 'chase';
      this.cam.snapBehind(this.boats[0].physics.state.position, this.boats[0].physics.state.yaw);
    } else {
      this.seekRace('midlap');
      this.race.phase = 'finished';
      this.race.raceTime = 95.42;
      for (const s of this.race.standings) {
        s.finished = true;
        s.lap = 3;
        s.finishTime = 90 + s.id * 3.2;
        s.lapTimes = [30, 31, 32];
      }
      this.boats[0].riderAnim.celebrating = true;
      this.cam.mode = 'orbit';
    }
  }

  getPerf() {
    return {
      fps: this.perf.fps,
      dpr: this.perf.dpr,
      drawCalls: this.renderer.info.render.calls,
    };
  }

  start(): void {
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.frame();
    };
    requestAnimationFrame(loop);
  }

  private frame(): void {
    const dt = this.time.tick();
    this.input.update();
    this.perf.update(dt || 1 / 60);

    const t = this.time.elapsed;
    const player = this.boats[0];

    // Countdown camera swap
    if (this.race.phase === 'countdown') {
      this.cam.mode = 'orbit';
      if (this.race.countdown < 0.2 && !this.hornPlayed) {
        this.audio.playHorn();
        this.hornPlayed = true;
      }
    } else if (this.race.phase === 'racing' && this.cam.mode === 'orbit') {
      this.cam.mode = 'chase';
    } else if (this.race.phase === 'finished') {
      this.cam.mode = 'orbit';
      this.boats[0].riderAnim.celebrating = true;
    }

    // Fixed physics
    while (this.time.consumeFixed()) {
      const fdt = this.time.fixedDt;
      const progresses: number[] = [];
      const rivals = this.boats.map((b) => ({
        x: b.physics.state.position.x,
        z: b.physics.state.position.z,
        id: b.id,
      }));
      const playerU = this.gates.progressOf(
        player.physics.state.position.x,
        player.physics.state.position.z,
      );

      for (let i = 0; i < this.boats.length; i++) {
        const boat = this.boats[i];
        let bin;
        if (boat.isPlayer) {
          const canDrive = this.race.phase === 'racing';
          bin = {
            throttle: canDrive ? this.input.throttle : 0,
            steer: canDrive ? this.input.steer : 0,
            drift: canDrive && this.input.drift,
            boost: canDrive && this.input.boost,
          };
        } else {
          bin = this.ais[i]!.think(
            fdt,
            t,
            boat.physics,
            this.curve,
            rivals,
            boat.id,
            playerU,
            this.race.phase === 'racing',
          );
        }
        boat.fixedUpdate(fdt, t, bin);

        // Soft boat-boat separation
        for (let j = i + 1; j < this.boats.length; j++) {
          const a = this.boats[i].physics.state;
          const b = this.boats[j].physics.state;
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 3.2 && dist > 0.01) {
            const push = ((3.2 - dist) / 3.2) * 0.5;
            const nx = dx / dist;
            const nz = dz / dist;
            a.position.x -= nx * push;
            a.position.z -= nz * push;
            b.position.x += nx * push;
            b.position.z += nz * push;
          }
        }

        progresses.push(
          this.gates.progressOf(boat.physics.state.position.x, boat.physics.state.position.z),
        );
      }
      this.race.update(fdt, progresses);
    }

    // Visuals
    for (const boat of this.boats) {
      const throttle = boat.isPlayer ? this.input.throttle : 0.8;
      boat.updateVisual(dt, t, throttle);
      const impact = boat.physics.consumeLandingImpact();
      if (impact > 0.3 && impact > this.lastImpacts[boat.id]) {
        this.audio.playImpact(impact);
        this.cam.addShake(impact * 0.4);
        this.foam.emitSpray(boat.physics.state.position, Math.floor(8 + impact * 16), boat.physics.state.yaw);
      }
      this.lastImpacts[boat.id] = impact;

      this.foam.emitWake(
        boat.physics.state.position.x,
        boat.physics.state.position.z,
        boat.physics.state.yaw,
        Math.abs(boat.physics.state.speed),
        boat.physics.state.airborne ? 0.1 : 0.6 + Math.abs(boat.physics.state.speed) * 0.02,
      );
      this.foam.updateRing(
        boat.id,
        boat.physics.state.position.x,
        boat.physics.state.position.z,
        t,
        Math.abs(boat.physics.state.speed),
      );
    }

    this.foam.update(dt, t);
    this.water.update(t, this.cam.camera);
    this.racingLine.update(t);
    this.gates.update(t);
    this.sky.update(t, this.cam.camera);

    const pstate = player.physics.state;
    this.cam.update(dt, t, pstate.position, pstate.yaw, pstate.speed, pstate.landingImpact);

    this.audio.update(pstate.rpm, pstate.speed, this.race.phase === 'racing');

    const u = this.gates.progressOf(pstate.position.x, pstate.position.z);
    this.hud.setWrongWay(
      this.race.phase === 'racing' && this.gates.isWrongWay(pstate.position.x, pstate.position.z, pstate.yaw),
    );
    const nextYaw = this.gates.nextCornerYaw(u);
    let dy = nextYaw - pstate.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.hud.setCornerHint(dy);

    const place = this.race.playerPlace();
    const standing = this.race.standings[0];
    const results =
      this.race.phase === 'finished'
        ? this.race.placements().map((s, idx) => ({
            name: s.name,
            time: s.finishTime,
            place: idx + 1,
          }))
        : null;

    this.hud.draw({
      speed: pstate.speed,
      lap: standing?.lap ?? 1,
      totalLaps: this.race.totalLaps,
      place,
      totalRacers: 4,
      boost: pstate.boostMeter,
      raceTime: this.race.raceTime,
      split: standing?.lapTimes.at(-1) ?? 0,
      phase: this.race.phase,
      countdown: this.race.countdown,
      minimap: {
        track: this.trackPts,
        racers: this.boats.map((b) => ({
          x: b.physics.state.position.x,
          z: b.physics.state.position.z,
          isPlayer: b.isPlayer,
        })),
      },
      results,
    });

    // Sync post DPR with adaptive
    this.post.setSize(window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());
    this.post.render();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.hud.resize();
  }
}
