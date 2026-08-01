export class Input {
  readonly keys = new Set<string>();
  throttle = 0;
  steer = 0;
  drift = false;
  boost = false;
  pause = false;

  private boundDown: (e: KeyboardEvent) => void;
  private boundUp: (e: KeyboardEvent) => void;

  constructor() {
    this.boundDown = (e) => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this.boundUp = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this.boundDown);
    window.addEventListener('keyup', this.boundUp);
  }

  update(): void {
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    this.throttle = up ? 1 : down ? -0.45 : 0;
    this.steer = (left ? 1 : 0) + (right ? -1 : 0);
    this.drift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyC');
    this.boost = this.keys.has('Space');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.boundDown);
    window.removeEventListener('keyup', this.boundUp);
  }
}
