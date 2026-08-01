import * as THREE from "three";
// Photorealistic pipeline: linear workflow + ACES tone mapping in the renderer.
THREE.ColorManagement.enabled = true;

import { Game } from "./core/Game";
import { installHarness } from "./core/Harness";

const params = new URLSearchParams(location.search);
const harnessMode = params.has("harness");

const container = document.getElementById("app")!;
const game = new Game(container, harnessMode);

if (harnessMode) {
  installHarness(game);
}

(window as unknown as { __GAME__: Game }).__GAME__ = game;
