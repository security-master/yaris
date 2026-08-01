/**
 * Full-race soak test: autopilot drives the player through the entire
 * 3-lap race from the countdown, through the finish, results screen and a
 * restart. Verifies the complete game loop headlessly and captures key
 * frames along the way.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto("http://localhost:5173/?harness=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__HARNESS__?.ready === true);

const info = () => page.evaluate(() => window.__HARNESS__.getInfo());
const step = (s) => page.evaluate((sec) => window.__HARNESS__.step(sec), s);

await page.evaluate(() => window.__HARNESS__.autopilot(true));

// countdown -> race start
await step(4.2);
console.log("after countdown:", JSON.stringify((await info()).state));

// race until player finishes (max 8 min sim)
let finished = false;
for (let i = 0; i < 32; i++) {
  await step(10);
  const inf = await info();
  const me = inf.racers[0];
  console.log(
    `t=${inf.time.toFixed(0).padStart(4)}s state=${inf.state} lap=${me.lap} prog=${me.progress.toFixed(2)} pos=${me.pos} spd=${me.speed} missed=${me.missed} ` +
      inf.racers.slice(1).map((r) => `${r.name.slice(0, 3)}:${r.progress.toFixed(2)}${r.finished ? "F" : ""}`).join(" ")
  );
  if (i === 3) await page.screenshot({ path: "shots/race-mid.png" });
  if (inf.state === "finished" && !finished) {
    finished = true;
    await step(2.5);
    await page.screenshot({ path: "shots/race-finished.png" });
    break;
  }
}

if (!finished) {
  console.error("RACE NEVER FINISHED");
} else {
  // restart via Enter
  await page.evaluate(() => {
    window.__HARNESS__.key("Enter", true);
    window.__HARNESS__.step(0.1);
    window.__HARNESS__.key("Enter", false);
  });
  await step(0.5);
  const inf = await info();
  console.log("after restart:", inf.state, "racers reset:", JSON.stringify(inf.racers.map((r) => r.progress)));
  await page.screenshot({ path: "shots/race-restarted.png" });
}

await browser.close();
