/**
 * Hand-designed cel-styled HUD — canvas drawn, not default HTML widgets.
 */
import { Palette } from '../palette';
import type { RaceManager } from '../race/RaceManager';

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export class HUD {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private overlay: HTMLElement;
  private wrongWay = false;
  private cornerHint = 0;

  constructor(host: HTMLElement, overlay: HTMLElement) {
    this.overlay = overlay;
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setWrongWay(v: boolean): void {
    this.wrongWay = v;
  }

  setCornerHint(deltaYaw: number): void {
    this.cornerHint = deltaYaw;
  }

  draw(opts: {
    speed: number;
    lap: number;
    totalLaps: number;
    place: number;
    totalRacers: number;
    boost: number;
    raceTime: number;
    split: number;
    phase: string;
    countdown: number;
    minimap: { track: { x: number; z: number }[]; racers: { x: number; z: number; isPlayer: boolean }[] };
    results?: { name: string; time: number; place: number }[] | null;
  }): void {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    // Speedometer
    this.panel(24, h - 150, 170, 120);
    ctx.fillStyle = hex(Palette.hudAccent);
    ctx.font = '800 42px Outfit, sans-serif';
    ctx.fillText(`${Math.round(Math.abs(opts.speed) * 3.2)}`, 40, h - 85);
    ctx.font = '700 14px Outfit, sans-serif';
    ctx.fillStyle = hex(Palette.cloudLit);
    ctx.fillText('KM/H', 40, h - 60);
    // Boost meter
    ctx.fillStyle = hex(Palette.hudInk);
    ctx.fillRect(40, h - 48, 130, 10);
    ctx.fillStyle = hex(Palette.hudGood);
    ctx.fillRect(40, h - 48, 130 * opts.boost, 10);
    ctx.strokeStyle = hex(Palette.hudAccent);
    ctx.lineWidth = 2;
    ctx.strokeRect(40, h - 48, 130, 10);

    // Lap / place
    this.panel(w - 194, 24, 170, 90);
    ctx.fillStyle = hex(Palette.cloudLit);
    ctx.font = '700 14px Outfit, sans-serif';
    ctx.fillText('LAP', w - 174, 50);
    ctx.fillStyle = hex(Palette.hudAccent);
    ctx.font = '900 32px Syne, sans-serif';
    ctx.fillText(`${opts.lap}/${opts.totalLaps}`, w - 174, 84);
    ctx.fillStyle = hex(Palette.cloudLit);
    ctx.font = '700 14px Outfit, sans-serif';
    ctx.fillText('POS', w - 90, 50);
    ctx.fillStyle = hex(Palette.hudGood);
    ctx.font = '900 32px Syne, sans-serif';
    ctx.fillText(`${opts.place}/${opts.totalRacers}`, w - 90, 84);

    // Time
    this.panel(w / 2 - 80, 20, 160, 54);
    ctx.fillStyle = hex(Palette.white);
    ctx.font = '800 22px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(opts.raceTime), w / 2, 54);
    ctx.textAlign = 'left';

    // Minimap
    this.drawMinimap(w - 180, h - 180, 150, 150, opts.minimap);

    // Corner preview
    if (Math.abs(this.cornerHint) > 0.25) {
      ctx.save();
      ctx.translate(w / 2, h - 80);
      ctx.fillStyle = hex(Palette.hudAccent);
      ctx.beginPath();
      const dir = Math.sign(this.cornerHint);
      ctx.moveTo(dir * 30, 0);
      ctx.lineTo(dir * -10, -18);
      ctx.lineTo(dir * -10, 18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (this.wrongWay) {
      ctx.fillStyle = hex(Palette.hudWarn);
      ctx.font = '900 36px Syne, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WRONG WAY', w / 2, h * 0.3);
      ctx.textAlign = 'left';
    }

    // Overlay countdown / results
    this.overlay.innerHTML = '';
    if (opts.phase === 'countdown') {
      const n = opts.countdown > 0 ? Math.min(3, Math.max(1, Math.ceil(opts.countdown))) : 0;
      const label = n > 0 ? String(n) : 'GO';
      this.overlay.innerHTML = `<div style="
        font-family: Syne, sans-serif;
        font-weight: 800;
        font-size: ${n > 0 ? 140 : 100}px;
        color: ${hex(Palette.hudAccent)};
        text-shadow: 0 0 0 6px ${hex(Palette.hudInk)}, 4px 6px 0 ${hex(Palette.hudInk)};
        letter-spacing: 0.04em;
        animation: pop 0.2s ease;
      ">${label}</div>`;
    } else if (opts.phase === 'finished' && opts.results) {
      const rows = opts.results
        .map(
          (r) =>
            `<div style="display:flex;justify-content:space-between;gap:24px;padding:8px 0;border-bottom:2px solid ${hex(Palette.hudAccent)}33;">
              <span>${r.place}. ${r.name}</span><span>${formatTime(r.time)}</span>
            </div>`,
        )
        .join('');
      this.overlay.innerHTML = `<div style="
        pointer-events:auto;
        background: linear-gradient(160deg, ${hex(Palette.hudPanel)}ee, #061820f0);
        border: 3px solid ${hex(Palette.hudAccent)};
        padding: 28px 36px;
        min-width: 340px;
        box-shadow: 8px 10px 0 ${hex(Palette.hudInk)};
      ">
        <div style="font-family:Syne,sans-serif;font-size:36px;font-weight:800;color:${hex(Palette.hudAccent)};margin-bottom:12px;">RESULTS</div>
        <div style="font-family:Outfit,sans-serif;font-size:18px;font-weight:700;">${rows}</div>
        <div style="margin-top:16px;opacity:0.8;font-size:14px;">Press R to restart</div>
      </div>`;
    } else if (opts.phase === 'idle') {
      this.overlay.innerHTML = `<div style="
        text-align:center;
        font-family:Syne,sans-serif;
      ">
        <div style="font-size:72px;font-weight:800;color:${hex(Palette.hudAccent)};
          text-shadow: 5px 6px 0 ${hex(Palette.hudInk)}; letter-spacing:0.06em;">CELWAKE</div>
        <div style="margin-top:10px;font-family:Outfit,sans-serif;font-weight:700;font-size:18px;color:${hex(Palette.cloudLit)};">
          WASD / Arrows · Shift drift · Space boost
        </div>
        <div style="margin-top:18px;font-family:Outfit,sans-serif;font-weight:800;font-size:20px;color:${hex(Palette.hudGood)};">
          Press SPACE or ENTER to race
        </div>
      </div>`;
    }
  }

  private panel(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = hex(Palette.hudPanel) + 'cc';
    ctx.strokeStyle = hex(Palette.hudAccent);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
  }

  private drawMinimap(
    x: number,
    y: number,
    w: number,
    h: number,
    data: { track: { x: number; z: number }[]; racers: { x: number; z: number; isPlayer: boolean }[] },
  ): void {
    const ctx = this.ctx;
    this.panel(x, y, w, h);
    if (!data.track.length) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of data.track) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const pad = 16;
    const sx = (w - pad * 2) / (maxX - minX || 1);
    const sz = (h - pad * 2) / (maxZ - minZ || 1);
    const s = Math.min(sx, sz);
    const ox = x + w / 2 - ((minX + maxX) / 2 - minX) * s - (maxX - minX) * s * 0.5 + pad;
    const oz = y + h / 2 - ((minZ + maxZ) / 2 - minZ) * s - (maxZ - minZ) * s * 0.5 + pad;

    ctx.strokeStyle = hex(Palette.racingLine);
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.track.forEach((p, i) => {
      const px = x + pad + (p.x - minX) * s;
      const pz = y + pad + (p.z - minZ) * s;
      if (i === 0) ctx.moveTo(px, pz);
      else ctx.lineTo(px, pz);
    });
    ctx.closePath();
    ctx.stroke();

    for (const r of data.racers) {
      const px = x + pad + (r.x - minX) * s;
      const pz = y + pad + (r.z - minZ) * s;
      ctx.fillStyle = r.isPlayer ? hex(Palette.playerHull) : hex(Palette.cloudLit);
      ctx.beginPath();
      ctx.arc(px, pz, r.isPlayer ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (r.isPlayer) {
        ctx.strokeStyle = hex(Palette.hudAccent);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    void ox;
    void oz;
  }
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export type { RaceManager };
