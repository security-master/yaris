import { Game } from './core/Game';
import type { CameraMode } from './camera/ChaseCam';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;

const game = new Game(canvas, hud, overlay);
game.start();

/** Screenshot / QA harness bridge */
export interface CelRacerAPI {
  ready: boolean;
  setTime: (t: number) => void;
  setCamera: (mode: CameraMode) => void;
  seekRace: (phase: 'countdown' | 'midlap' | 'finish') => void;
  getPerf: () => { fps: number; dpr: number; drawCalls: number };
  captureInfo: () => Record<string, unknown>;
  beginRace: () => void;
}

const api: CelRacerAPI = {
  ready: true,
  setTime: (t: number) => {
    game.time.forcedElapsed = t;
  },
  setCamera: (mode) => game.setCameraMode(mode),
  seekRace: (phase) => game.seekRace(phase),
  getPerf: () => game.getPerf(),
  captureInfo: () => ({
    phase: (game as unknown as { race: { phase: string } }).race?.phase,
    perf: game.getPerf(),
  }),
  beginRace: () => game.beginRace(),
};

(window as unknown as { __CEL_RACER__: CelRacerAPI }).__CEL_RACER__ = api;

console.info('%cCELWAKE%c ready — Enter/Space to race', 'color:#ffd93d;font-weight:900', 'color:#7ec8e8');
