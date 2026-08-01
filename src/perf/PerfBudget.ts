/**
 * Adaptive pixel ratio, simple FPS tracking, LOD hints.
 */
export class PerfBudget {
  fps = 60;
  private frames = 0;
  private acc = 0;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  private targetFps = 58;
  highQuality = true;

  constructor(private renderer: { setPixelRatio: (n: number) => void }) {
    this.renderer.setPixelRatio(this.dpr);
  }

  update(dt: number): void {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;

      if (this.fps < this.targetFps - 6 && this.dpr > 1) {
        this.dpr = Math.max(1, this.dpr - 0.25);
        this.renderer.setPixelRatio(this.dpr);
        this.highQuality = this.dpr > 1.25;
      } else if (this.fps > this.targetFps + 8 && this.dpr < Math.min(window.devicePixelRatio || 1, 2)) {
        this.dpr = Math.min(Math.min(window.devicePixelRatio || 1, 2), this.dpr + 0.15);
        this.renderer.setPixelRatio(this.dpr);
        this.highQuality = true;
      }
    }
  }
}
