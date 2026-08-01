/**
 * Adaptive quality: watches the real frame time and steps the render
 * pixel ratio up/down so the game holds 60 fps at the highest resolution
 * the machine can afford. Never touches simulation quality.
 */

const STEPS = [1.0, 1.25, 1.5, 1.75, 2.0];

export class Quality {
  private ema = 16.7;
  private evalTimer = 0;
  private stepIndex: number;
  private holdOff = 0;

  constructor(private apply: (pixelRatio: number) => void) {
    const max = Math.min(window.devicePixelRatio || 1, 2);
    this.stepIndex = STEPS.findIndex((s) => s >= max);
    if (this.stepIndex < 0) this.stepIndex = STEPS.length - 1;
    this.apply(this.current());
  }

  current(): number {
    return Math.min(STEPS[this.stepIndex], Math.min(window.devicePixelRatio || 1, 2));
  }

  /** call once per rendered frame with the raw frame delta in ms */
  frame(dtMs: number): void {
    // ignore spikes (tab switches, GC)
    if (dtMs > 100) return;
    this.ema += (dtMs - this.ema) * 0.06;
    this.evalTimer += dtMs;
    this.holdOff = Math.max(0, this.holdOff - dtMs);
    if (this.evalTimer < 1200 || this.holdOff > 0) return;
    this.evalTimer = 0;

    if (this.ema > 17.8 && this.stepIndex > 0) {
      this.stepIndex--;
      this.apply(this.current());
      this.holdOff = 2500;
    } else if (this.ema < 13.8 && STEPS[this.stepIndex] < Math.min(window.devicePixelRatio || 1, 2)) {
      this.stepIndex++;
      this.apply(this.current());
      this.holdOff = 2500;
    }
  }
}
