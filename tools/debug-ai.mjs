import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto("http://localhost:5173/?harness=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__HARNESS__?.ready === true);

const out = await page.evaluate(() => {
  const H = window.__HARNESS__;
  const G = window.__GAME__;
  H.setState("racing");
  const log = [];
  for (let i = 0; i < 10; i++) {
    H.step(45);
    log.push(
      G.race.racers.map((r) => ({
        n: r.boat.livery.name.slice(0, 3),
        param: +r.param.toFixed(4),
        prog: +r.progress.toFixed(4),
        x: +r.boat.physics.position.x.toFixed(1),
        z: +r.boat.physics.position.z.toFixed(1),
        spd: +r.boat.physics.speed.toFixed(1),
        steer: +r.boat.physics.controls.steer.toFixed(2),
        thr: +r.boat.physics.controls.throttle.toFixed(2),
      }))
    );
  }
  // also test projectParam sanity
  const tests = [];
  const c = G.course;
  for (const [x, z, prev] of [[0, 120, 0.0], [0, 120, 0.99], [190, 405, 0.2], [0, -60, 0.99]]) {
    tests.push({ x, z, prev, t: +c.projectParamRel(x, z, prev).toFixed(4) });
  }
  return { log, tests, running: G.race.running, state: G.state };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
