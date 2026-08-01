/**
 * Screenshot harness: loads the game in headless Chromium, drives it to a
 * scripted moment via window.__HARNESS__, and captures retina frames from
 * several camera angles. Every visual claim gets verified against these.
 *
 * Usage:
 *   npm run dev          (in another terminal)
 *   node tools/screenshot.mjs [scenarioName ...]
 * Frames land in shots/.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.GAME_URL ?? "http://localhost:5173/?harness=1";
const OUT_DIR = resolve("shots");
const WIDTH = 1280;
const HEIGHT = 800;
const DPR = 2;

/**
 * Each scenario: name + async driver that uses the in-page harness.
 * h(fn, ...args) evaluates against window.__HARNESS__.
 */
const SCENARIOS = {
  // ---- Milestone 1: ocean + sky ----
  "ocean-chase": async (h) => {
    await h((H) => H.step(3));
  },
  "ocean-low": async (h) => {
    await h((H) => {
      H.setCamera(0, 2.2, 26, 0, 1.5, -40);
      H.step(2.5);
    });
  },
  "ocean-high": async (h) => {
    await h((H) => {
      H.setCamera(30, 42, 60, 0, 0, -60);
      H.step(2.5);
    });
  },
  "ocean-horizon": async (h) => {
    await h((H) => {
      H.setCamera(0, 6, 0, 120, 4, -260);
      H.step(2.5);
    });
  },
  "ocean-sun": async (h) => {
    await h((H) => {
      // look toward the sun direction
      H.setCamera(0, 4, 0, 90, 70, 60);
      H.step(2.5);
    });
  },

  // ---- Milestone 2+: gameplay ----
  "race-start": async (h) => {
    await h((H) => {
      H.setState("countdown");
      H.step(1.5);
    });
  },
  "gameplay-throttle": async (h) => {
    await h((H) => {
      H.setState("racing");
      H.key("ArrowUp", true);
      H.step(6);
    });
  },
  "gameplay-turn": async (h) => {
    await h((H) => {
      H.setState("racing");
      H.key("ArrowUp", true);
      H.step(4);
      H.key("ArrowLeft", true);
      H.step(1.6);
    });
  },
  "gameplay-drift": async (h) => {
    await h((H) => {
      H.setState("racing");
      H.key("ArrowUp", true);
      H.step(4);
      H.key("Space", true);
      H.key("ArrowRight", true);
      H.step(1.8);
    });
  },
  "boat-closeup": async (h) => {
    await h((H) => {
      H.setState("racing");
      H.key("ArrowUp", true);
      H.step(5);
      const p = H.getInfo();
      const bp = p.playerPos ?? { x: 0, y: 0, z: 0 };
      H.setCamera(bp.x + 6, bp.y + 2.5, bp.z + 7, bp.x, bp.y + 0.6, bp.z);
      H.step(0.02);
    });
  },
  "boat-front": async (h) => {
    await h((H) => {
      H.setState("racing");
      H.key("ArrowUp", true);
      H.step(5);
      const p = H.getInfo();
      const bp = p.playerPos ?? { x: 0, y: 0, z: 0 };
      const fw = p.playerFwd ?? { x: 0, z: 1 };
      H.setCamera(
        bp.x + fw.x * 10, bp.y + 2.0, bp.z + fw.z * 10,
        bp.x, bp.y + 0.8, bp.z
      );
      H.step(0.02);
    });
  },
  "wake-topdown": async (h) => {
    await h((H) => {
      H.setState("racing");
      H.key("ArrowUp", true);
      H.step(5);
      const p = H.getInfo();
      const bp = p.playerPos ?? { x: 0, y: 0, z: 0 };
      H.setCamera(bp.x + 2, bp.y + 38, bp.z - 12, bp.x, bp.y, bp.z - 13);
      H.step(0.02);
    });
  },
  "results": async (h) => {
    await h((H) => {
      H.setState("finished");
      H.step(3);
    });
  },
};

async function main() {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(SCENARIOS);

  mkdirSync(OUT_DIR, { recursive: true });

  const launchOpts = {
    headless: true,
    args: [
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--disable-gpu-sandbox",
      "--no-sandbox",
    ],
  };
  let browser;
  try {
    // prefer system Chrome (no download needed)
    browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
  } catch {
    browser = await chromium.launch(launchOpts);
  }

  for (const name of names) {
    const driver = SCENARIOS[name];
    if (!driver) {
      console.warn(`unknown scenario: ${name}`);
      continue;
    }
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: DPR,
    });
    page.on("pageerror", (e) => console.error(`[${name}] page error:`, e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.error(`[${name}] console:`, m.text());
    });

    try {
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__HARNESS__?.ready === true, null, {
        timeout: 30000,
      });
      const h = (fn) => page.evaluate((src) => {
        const H = window.__HARNESS__;
        // eslint-disable-next-line no-new-func
        return new Function("H", `return (${src})(H)`)(H);
      }, fn.toString());
      await driver(h);
      await page.screenshot({ path: `${OUT_DIR}/${name}.png` });
      const info = await page.evaluate(() => window.__HARNESS__.getInfo());
      console.log(`✓ ${name}  (${JSON.stringify(info)})`);
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
