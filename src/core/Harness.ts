/**
 * Screenshot/automation harness. Only active with ?harness=1.
 * Playwright drives the game deterministically: fixed-step time,
 * scripted inputs, camera presets — then captures frames.
 */

import * as THREE from "three";
import type { Game } from "./Game";

export interface HarnessAPI {
  ready: boolean;
  /** advance simulation by seconds (fixed steps) and render one frame */
  step(seconds: number): void;
  /** hold/release a key code (e.g. "ArrowUp") */
  key(code: string, down: boolean): void;
  /** free camera override: position + lookAt in world space */
  setCamera(px: number, py: number, pz: number, lx: number, ly: number, lz: number): void;
  /** release camera override, return to game camera */
  clearCamera(): void;
  setState(name: string): void;
  getInfo(): Record<string, unknown>;
}

export function installHarness(game: Game): void {
  let cameraOverride: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  const api: HarnessAPI = {
    ready: true,
    step(seconds: number) {
      const chunks = Math.max(1, Math.round(seconds / (1 / 60)));
      for (let i = 0; i < chunks; i++) {
        game.advance(1 / 60);
      }
      if (cameraOverride) {
        game.chase.camera.position.copy(cameraOverride.pos);
        game.chase.camera.lookAt(cameraOverride.look);
        game.chase.camera.updateProjectionMatrix();
        game.ocean.update(game.time, game.chase.camera);
        game.sky.update(game.time, game.chase.camera);
      }
      game.render();
    },
    key(code: string, down: boolean) {
      game.input.setKey(code, down);
    },
    setCamera(px, py, pz, lx, ly, lz) {
      cameraOverride = {
        pos: new THREE.Vector3(px, py, pz),
        look: new THREE.Vector3(lx, ly, lz),
      };
    },
    clearCamera() {
      cameraOverride = null;
    },
    setState(name: string) {
      game.forceState(name as Game["state"]);
    },
    getInfo() {
      const p = game.player.physics;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion);
      return {
        state: game.state,
        time: game.time,
        drawCalls: game.renderer.info.render.calls,
        triangles: game.renderer.info.render.triangles,
        playerPos: { x: p.position.x, y: p.position.y, z: p.position.z },
        playerFwd: { x: fwd.x, z: fwd.z },
        speed: p.speed,
        wetness: p.wetness,
        airborne: p.airborne,
        boost: p.boostCharge,
      };
    },
  };

  (window as unknown as { __HARNESS__: HarnessAPI }).__HARNESS__ = api;
}
