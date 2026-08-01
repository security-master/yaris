/**
 * Keyboard input, mapped to analog-ish race controls.
 * Arrow keys / WASD, Shift or Space to drift, Enter to confirm.
 */
export class Input {
  private keys = new Set<string>();

  /** -1..1 steering (left negative) */
  steer = 0;
  /** 0..1 throttle */
  throttle = 0;
  /** 0..1 brake / reverse */
  brake = 0;
  drift = false;
  confirmPressed = false;
  private confirmLatch = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  /** Harness hook: force key states from automation. */
  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  update(dt: number): void {
    const k = this.keys;
    const left = k.has("ArrowLeft") || k.has("KeyA");
    const right = k.has("ArrowRight") || k.has("KeyD");
    const up = k.has("ArrowUp") || k.has("KeyW");
    const down = k.has("ArrowDown") || k.has("KeyS");
    this.drift = k.has("ShiftLeft") || k.has("ShiftRight") || k.has("Space");

    // smooth the digital inputs so the boat feels analog
    const steerTarget = (right ? 1 : 0) - (left ? 1 : 0);
    const steerRate = Math.sign(steerTarget - this.steer) * dt * (steerTarget === 0 ? 9 : 6);
    if (Math.abs(steerTarget - this.steer) <= Math.abs(steerRate)) this.steer = steerTarget;
    else this.steer += steerRate;

    const thrTarget = up ? 1 : 0;
    this.throttle += (thrTarget - this.throttle) * Math.min(1, dt * 5);
    const brkTarget = down ? 1 : 0;
    this.brake += (brkTarget - this.brake) * Math.min(1, dt * 7);

    const confirm = k.has("Enter") || k.has("KeyR");
    this.confirmPressed = confirm && !this.confirmLatch;
    this.confirmLatch = confirm;
  }
}
