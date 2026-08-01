export class Time {
  elapsed = 0;
  delta = 0;
  fixedDt = 1 / 60;
  accumulator = 0;
  private last = performance.now();
  paused = false;
  /** Harness override — when set, drives elapsed externally */
  forcedElapsed: number | null = null;

  tick(): number {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);
    if (this.paused) {
      this.delta = 0;
      return 0;
    }
    if (this.forcedElapsed !== null) {
      this.delta = Math.max(0, this.forcedElapsed - this.elapsed);
      this.elapsed = this.forcedElapsed;
      return this.delta;
    }
    this.delta = dt;
    this.elapsed += dt;
    this.accumulator += dt;
    return dt;
  }

  consumeFixed(): boolean {
    if (this.accumulator >= this.fixedDt) {
      this.accumulator -= this.fixedDt;
      return true;
    }
    return false;
  }
}
