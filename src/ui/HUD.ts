/**
 * Hand-drawn cel-style HUD on a 2D canvas overlay. No default HTML
 * widgets — every gauge is inked with the same palette as the world:
 *
 *  - speedometer arc + big italic km/h, boost meter with charge flash
 *  - lap counter, race timer, last/best lap splits
 *  - live position card ("2nd")
 *  - minimap: the actual course spline + all four racers
 *  - corner preview chevrons, wrong-way warning, gate "CHECK!" flash
 *  - countdown 3-2-1-GO and the results panel with placements
 */

import * as THREE from "three";
import { Palette, hex } from "../core/Palette";
import type { Game } from "../core/Game";
import { TOTAL_LAPS } from "../race/RaceManager";

const INK = hex(Palette.ink);
const PAPER = "#f6fbff";

function fmtTime(t: number): string {
  if (!isFinite(t) || t <= 0) return "--:--.-";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th"];
const PLACE_COLORS = [hex(Palette.yellow), "#d8e6f2", "#e8a25c", "#9fb4d8"];

export class HUD {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private mapPts: { x: number; z: number }[] = [];
  private mapBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
  private goFlash = 0;

  constructor(private game: Game) {
    this.canvas = document.getElementById("hud") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());

    // bake the course outline for the minimap
    const curve = game.course.curve;
    const p = new THREE.Vector3();
    for (let i = 0; i <= 96; i++) {
      curve.getPointAt(i / 96, p);
      this.mapPts.push({ x: p.x, z: p.z });
      this.mapBounds.minX = Math.min(this.mapBounds.minX, p.x);
      this.mapBounds.maxX = Math.max(this.mapBounds.maxX, p.x);
      this.mapBounds.minZ = Math.min(this.mapBounds.minZ, p.z);
      this.mapBounds.maxZ = Math.max(this.mapBounds.maxZ, p.z);
    }
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** italic ink text with a fat outline — the house style */
  private inkText(
    text: string,
    x: number,
    y: number,
    size: number,
    fill: string,
    align: CanvasTextAlign = "left",
    outline = true
  ): void {
    const c = this.ctx;
    c.font = `italic 900 ${size}px system-ui, -apple-system, sans-serif`;
    c.textAlign = align;
    c.textBaseline = "alphabetic";
    if (outline) {
      c.lineJoin = "round";
      c.strokeStyle = INK;
      c.lineWidth = Math.max(3, size * 0.14);
      c.strokeText(text, x, y);
    }
    c.fillStyle = fill;
    c.fillText(text, x, y);
  }

  private panel(x: number, y: number, w: number, h: number, skew = -0.12): void {
    const c = this.ctx;
    c.save();
    c.transform(1, 0, skew, 1, 0, 0);
    c.fillStyle = "rgba(16, 26, 56, 0.78)";
    c.strokeStyle = PAPER;
    c.lineWidth = 3;
    const r = 10;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
    c.stroke();
    c.restore();
  }

  update(dt: number): void {
    const c = this.ctx;
    const W = window.innerWidth;
    const H = window.innerHeight;
    c.clearRect(0, 0, W, H);

    const game = this.game;
    const state = game.state;
    const racer = game.race.racers[0];

    if (state === "countdown") {
      this.drawCountdown(W, H);
      return;
    }
    if (state === "finished") {
      this.drawResults(W, H);
      return;
    }
    if (!racer) return;

    // GO! flash lingers into the race
    if (this.goFlash > 0) {
      this.goFlash -= dt;
      c.save();
      c.globalAlpha = Math.min(1, this.goFlash * 1.4);
      this.inkText("GO!", W / 2, H * 0.3, 110, hex(Palette.raceGreen), "center");
      c.restore();
    }

    this.drawSpeedLines(W, H);
    this.drawSpeedo(W, H);
    this.drawLapCard(W, H);
    this.drawPositionCard(W, H);
    this.drawMinimap(W, H);
    this.drawCornerPreview(W, H);

    // wrong way
    if (racer.wrongWay) {
      const blink = Math.sin(game.time * 10) > 0;
      if (blink) this.inkText("WRONG WAY!", W / 2, H * 0.3, 64, hex(Palette.red), "center");
    }
    // gate flash
    if (racer.gateFlash > 0.35) {
      this.inkText("CHECK!", W / 2, H * 0.22, 44, hex(Palette.raceGreen), "center");
    }
  }

  notifyGo(): void {
    this.goFlash = 1.2;
  }

  // ------------------------------------------------------------------

  private drawCountdown(W: number, H: number): void {
    const cd = this.game.countdown;
    const n = Math.ceil(cd);
    if (cd <= 3.03 && n >= 1) {
      const frac = 1 - (cd - (n - 1)); // 0..1 within this number
      const scale = 1 + (1 - frac) * 0.6;
      const c = this.ctx;
      c.save();
      c.translate(W / 2, H * 0.36);
      c.scale(scale, scale);
      c.globalAlpha = Math.min(1, frac * 4);
      this.inkText(String(n), 0, 0, 150, n === 1 ? hex(Palette.orange) : PAPER, "center");
      c.restore();
    }
    this.inkText("INKWAKE GP", W / 2, H * 0.115, 46, hex(Palette.yellow), "center");
    this.inkText("3 LAPS — FOLLOW THE GREEN LINE", W / 2, H * 0.165, 20, PAPER, "center");
    // controls chip: dark backing so it reads over clouds and foam
    const c = this.ctx;
    c.save();
    c.fillStyle = "rgba(16, 26, 56, 0.72)";
    c.beginPath();
    c.roundRect(W / 2 - 280, H * 0.86, 560, 42, 12);
    c.fill();
    c.restore();
    this.inkText("↑ throttle    ← → steer    SPACE drift & boost", W / 2, H * 0.86 + 29, 20, PAPER, "center", false);
  }

  /** anime speed lines rushing in from the screen edges at high speed */
  private drawSpeedLines(W: number, H: number): void {
    const phys = this.game.player.physics;
    const speedT = Math.min(1, Math.abs(phys.speed) / 33);
    const boost = phys.boostTime > 0;
    const intensity = boost ? 1 : Math.max(0, (speedT - 0.78) / 0.22);
    if (intensity <= 0.01) return;

    const c = this.ctx;
    const cx = W / 2;
    const cy = H * 0.45;
    const t = this.game.time;
    c.save();
    c.globalAlpha = 0.5 * intensity;
    c.strokeStyle = boost ? hex(Palette.teal) : PAPER;
    c.lineCap = "round";
    for (let i = 0; i < 18; i++) {
      // deterministic per-line jitter, scrolling phase
      const seed = i * 137.5;
      const ang = (seed % 360) * (Math.PI / 180);
      const wob = Math.sin(t * 9 + i * 1.7) * 0.02;
      const dx = Math.cos(ang + wob);
      const dy = Math.sin(ang + wob) * 0.72;
      const edge = Math.max(W, H) * 0.72;
      const phase = (t * 5.5 + i * 0.61) % 1;
      const r0 = edge * (0.94 - phase * 0.16);
      const r1 = r0 - (34 + intensity * 60) * (0.4 + phase);
      if (Math.abs(dy) > 0.6) continue; // keep the vertical band clear
      c.lineWidth = 3.5 + (i % 3);
      c.beginPath();
      c.moveTo(cx + dx * r0, cy + dy * r0);
      c.lineTo(cx + dx * r1, cy + dy * r1);
      c.stroke();
    }
    c.restore();
  }

  private drawSpeedo(W: number, H: number): void {
    const c = this.ctx;
    const phys = this.game.player.physics;
    const kmh = Math.abs(phys.speed * 3.6);
    const cx = W - 130;
    const cy = H - 96;

    // opaque dial face so the gauge never reads as a hole in the HUD
    c.save();
    c.fillStyle = "rgba(16, 26, 56, 0.82)";
    c.beginPath();
    c.arc(cx, cy, 88, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = PAPER;
    c.lineWidth = 3;
    c.stroke();
    c.restore();

    // arc gauge
    const speedT = Math.min(1, kmh / 130);
    c.save();
    c.lineCap = "round";
    c.strokeStyle = "rgba(16,26,56,0.72)";
    c.lineWidth = 15;
    c.beginPath();
    c.arc(cx, cy, 74, Math.PI * 0.75, Math.PI * 2.25);
    c.stroke();
    const col = phys.boostTime > 0 ? hex(Palette.teal) : hex(Palette.orange);
    c.strokeStyle = col;
    c.lineWidth = 9;
    c.beginPath();
    c.arc(cx, cy, 74, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * speedT));
    c.stroke();
    c.restore();

    this.inkText(String(Math.round(kmh)), cx, cy + 12, 54, PAPER, "center");
    this.inkText("km/h", cx, cy + 38, 18, hex(Palette.skyHorizon), "center");

    // boost meter (skewed chip attached below the dial)
    const bx = cx - 80;
    const by = cy + 66;
    c.save();
    c.transform(1, 0, -0.25, 1, 0, 0);
    c.fillStyle = "rgba(16, 26, 56, 0.82)";
    c.beginPath();
    c.roundRect(bx - 46, by - 8, 232, 30, 8);
    c.fill();
    c.strokeStyle = PAPER;
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "rgba(10, 16, 38, 0.9)";
    c.fillRect(bx + 18, by, 160, 14);
    const charge = phys.boostTime > 0 ? 1 : phys.boostCharge;
    const flash = charge >= 1 || phys.boostTime > 0 ? Math.sin(this.game.time * 14) * 0.25 + 0.75 : 1;
    c.fillStyle = phys.boostTime > 0 ? hex(Palette.teal) : hex(Palette.raceGreen);
    c.globalAlpha = flash;
    c.fillRect(bx + 20, by + 2, 156 * Math.min(1, charge), 10);
    c.restore();
    this.inkText("BOOST", bx - 62, by + 13, 15, PAPER, "left", false);
  }

  private drawLapCard(W: number, H: number): void {
    const r = this.game.race.racers[0];
    this.panel(18, 16, 210, 92);
    this.inkText(`LAP ${THREE.MathUtils.clamp(r.lap, 1, TOTAL_LAPS)}/${TOTAL_LAPS}`, 38, 54, 34, PAPER);
    this.inkText(fmtTime(this.game.race.raceTime), 38, 88, 24, hex(Palette.yellow));
    const last = r.lapTimes[r.lapTimes.length - 1];
    if (last !== undefined) {
      this.inkText(`LAST ${fmtTime(last)}`, 132, 82, 14, hex(Palette.skyHorizon));
      const best = Math.min(...r.lapTimes);
      this.inkText(`BEST ${fmtTime(best)}`, 132, 100, 14, hex(Palette.teal));
    }
  }

  private drawPositionCard(W: number, H: number): void {
    const r = this.game.race.racers[0];
    const pos = r.position;
    this.panel(W - 168, 16, 132, 74);
    this.inkText(ORDINALS[pos - 1] ?? `${pos}th`, W - 100, 72, 52, PLACE_COLORS[pos - 1] ?? PAPER, "center");
  }

  private drawMinimap(W: number, H: number): void {
    const c = this.ctx;
    const size = 190;
    const mx = 26;
    const my = H - size - 26;
    const b = this.mapBounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    const span = Math.max(spanX, spanZ) * 1.15;
    const scale = size / span;
    const ox = mx + size / 2 - ((b.minX + b.maxX) / 2) * scale;
    const oz = my + size / 2 + ((b.minZ + b.maxZ) / 2) * scale;
    const px = (x: number, z: number) => ({ x: ox + x * scale, y: oz - z * scale });

    c.save();
    // backing card
    c.fillStyle = "rgba(16,26,56,0.66)";
    c.beginPath();
    c.roundRect(mx - 10, my - 10, size + 20, size + 20, 14);
    c.fill();
    c.strokeStyle = PAPER;
    c.lineWidth = 2.5;
    c.stroke();

    // course line: ink underlay + green core
    for (const pass of [
      { color: INK, width: 7 },
      { color: hex(Palette.raceGreen), width: 3.5 },
    ]) {
      c.strokeStyle = pass.color;
      c.lineWidth = pass.width;
      c.lineJoin = "round";
      c.beginPath();
      this.mapPts.forEach((pt, i) => {
        const q = px(pt.x, pt.z);
        if (i === 0) c.moveTo(q.x, q.y);
        else c.lineTo(q.x, q.y);
      });
      c.closePath();
      c.stroke();
    }

    // gate ticks
    c.fillStyle = hex(Palette.orange);
    for (const gt of this.game.course.gateParams) {
      const gp = this.game.course.curve.getPointAt(this.game.course.absParam(gt));
      const gq = px(gp.x, gp.z);
      c.fillRect(gq.x - 2.5, gq.y - 2.5, 5, 5);
    }

    // start line tick
    const s0 = this.game.course.curve.getPointAt(this.game.course.absParam(0));
    const q0 = px(s0.x, s0.z);
    c.fillStyle = PAPER;
    c.fillRect(q0.x - 4, q0.y - 4, 8, 8);

    // racers (player drawn last, biggest)
    const racers = [...this.game.race.racers].sort((a, b2) => (a.boat.isPlayer ? 1 : 0) - (b2.boat.isPlayer ? 1 : 0));
    for (const r of racers) {
      const p = r.boat.physics.position;
      const q = px(p.x, p.z);
      c.beginPath();
      c.arc(q.x, q.y, r.boat.isPlayer ? 7 : 5, 0, Math.PI * 2);
      c.fillStyle = hex(r.boat.livery.hull);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 2.5;
      c.stroke();
    }
    c.restore();
  }

  private drawCornerPreview(W: number, H: number): void {
    const r = this.game.race.racers[0];
    const turn = this.game.race.cornerPreview(r);
    if (Math.abs(turn) < 0.35) return;
    const c = this.ctx;
    const dir = Math.sign(turn);
    const mag = Math.min(1, Math.abs(turn));
    const cx = W / 2 + dir * 130;
    const cy = H * 0.2;
    c.save();
    // backing chip anchors the chevrons as HUD, not floating debug marks
    c.globalAlpha = 0.4 + mag * 0.3;
    c.fillStyle = "rgba(16, 26, 56, 0.85)";
    c.beginPath();
    c.roundRect(cx - 48 - (dir > 0 ? 0 : 22), cy - 28, 118, 56, 12);
    c.fill();
    c.globalAlpha = 0.5 + mag * 0.5;
    // chevrons pointing into the corner
    for (let i = 0; i < 3; i++) {
      const off = i * 26 * dir;
      c.beginPath();
      c.moveTo(cx + off - 12 * dir, cy - 16);
      c.lineTo(cx + off + 8 * dir, cy);
      c.lineTo(cx + off - 12 * dir, cy + 16);
      c.lineWidth = 9;
      c.lineJoin = "round";
      c.lineCap = "round";
      c.strokeStyle = INK;
      c.stroke();
      c.lineWidth = 5;
      c.strokeStyle = mag > 0.75 ? hex(Palette.red) : hex(Palette.yellow);
      c.stroke();
    }
    c.restore();
  }

  private drawResults(W: number, H: number): void {
    const c = this.ctx;
    // cool blue wash + vignette: podium mood without collapsing the palette
    c.fillStyle = "rgba(20, 34, 74, 0.42)";
    c.fillRect(0, 0, W, H);
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, "rgba(10, 16, 38, 0)");
    vg.addColorStop(1, "rgba(10, 16, 38, 0.55)");
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    this.inkText("RACE COMPLETE", W / 2, H * 0.18, 54, hex(Palette.yellow), "center");

    const sorted = [...this.game.race.racers].sort((a, b) => a.position - b.position);
    const cw = 520;
    const x0 = W / 2 - cw / 2;
    let y = H * 0.28;
    for (const r of sorted) {
      const isP = r.boat.isPlayer;
      c.save();
      c.transform(1, 0, -0.12, 1, 0, 0);
      c.fillStyle = isP ? "rgba(120, 58, 24, 0.9)" : "rgba(16, 26, 56, 0.88)";
      c.strokeStyle = isP ? hex(Palette.orange) : PAPER;
      c.lineWidth = 2.5;
      c.beginPath();
      c.roundRect(x0 + y * 0.12, y, cw, 58, 10);
      c.fill();
      c.stroke();
      c.restore();

      const rowY = y + 40;
      this.inkText(ORDINALS[r.position - 1] ?? "", x0 + 46, rowY, 30, PLACE_COLORS[r.position - 1] ?? PAPER, "center");
      // livery swatch
      c.fillStyle = hex(r.boat.livery.hull);
      c.strokeStyle = INK;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x0 + 106, y + 29, 13, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      this.inkText(r.boat.livery.name + (isP ? "  (YOU)" : ""), x0 + 136, rowY, 26, PAPER);
      // winner shows the total; everyone else shows a gap (live estimate
      // with one decimal until they actually cross the line)
      const winner = sorted[0];
      let timeLabel: string;
      if (r.position === 1) {
        timeLabel = fmtTime(r.finished ? r.finishTime : this.game.race.raceTime);
      } else if (r.finished && winner.finished) {
        timeLabel = `+${(r.finishTime - winner.finishTime).toFixed(1)}s`;
      } else {
        const remaining = Math.max(0, (TOTAL_LAPS - r.progress) * this.game.course.length);
        timeLabel = `+${Math.max(0.1, remaining / 19).toFixed(1)}s`;
      }
      this.inkText(timeLabel, x0 + cw - 30, rowY, 24, hex(Palette.skyHorizon), "right");
      y += 72;
    }

    const best = Math.min(...this.game.race.racers[0].lapTimes);
    if (isFinite(best)) {
      this.inkText(`BEST LAP  ${fmtTime(best)}`, W / 2, y + 30, 24, hex(Palette.teal), "center");
    }
    const blink = Math.sin(this.game.time * 4) > -0.2;
    if (blink) this.inkText("PRESS ENTER TO RACE AGAIN", W / 2, H * 0.9, 26, PAPER, "center");
  }
}
