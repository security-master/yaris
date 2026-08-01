import * as THREE from "three";
// NPR pipeline: palette hex values ARE the final screen colors.
// No linear-workflow conversions anywhere — what we author is what ships.
THREE.ColorManagement.enabled = false;

import { Game } from "./core/Game";
import { installHarness } from "./core/Harness";

const params = new URLSearchParams(location.search);
const harnessMode = params.has("harness");

const container = document.getElementById("app")!;
const game = new Game(container, harnessMode);

if (harnessMode) {
  installHarness(game);
}

// expose for quick console debugging in dev
(window as unknown as { __GAME__: Game }).__GAME__ = game;
