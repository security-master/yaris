/**
 * All audio is synthesized live with the Web Audio API — no samples.
 *
 *  - engine: detuned saw+square pair through a lowpass, pitch follows RPM
 *    (speed + throttle), with a sub-oscillator thump and boost overdrive
 *  - water rush: filtered noise, gain follows speed & hull wetness
 *  - drift spray: bandpassed noise burst while sliding
 *  - slams: lowpass noise burst + sine body thump
 *  - gate chime, boost whoosh, countdown horn: little synth one-shots
 *
 * The context unlocks on the first user gesture (browser policy).
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;

  // continuous voices
  private engineOsc1!: OscillatorNode;
  private engineOsc2!: OscillatorNode;
  private engineSub!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;
  private rushGain!: GainNode;
  private rushFilter!: BiquadFilterNode;
  private driftGain!: GainNode;

  private started = false;

  constructor() {
    const unlock = () => {
      this.start();
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
  }

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // ---------------- engine voice ----------------
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 800;
    this.engineFilter.Q.value = 2.2;

    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = "sawtooth";
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = "square";
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = "sine";

    const o2gain = ctx.createGain();
    o2gain.gain.value = 0.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.65;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(o2gain).connect(this.engineFilter);
    this.engineSub.connect(subGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();
    this.engineSub.start();

    // ---------------- water rush ----------------
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 2);
    noise.loop = true;
    this.rushFilter = ctx.createBiquadFilter();
    this.rushFilter.type = "bandpass";
    this.rushFilter.frequency.value = 700;
    this.rushFilter.Q.value = 0.6;
    this.rushGain = ctx.createGain();
    this.rushGain.gain.value = 0;
    noise.connect(this.rushFilter).connect(this.rushGain).connect(this.master);
    noise.start();

    // ---------------- drift spray ----------------
    const drift = ctx.createBufferSource();
    drift.buffer = this.noiseBuffer(ctx, 2);
    drift.loop = true;
    const driftFilter = ctx.createBiquadFilter();
    driftFilter.type = "highpass";
    driftFilter.frequency.value = 2600;
    this.driftGain = ctx.createGain();
    this.driftGain.gain.value = 0;
    drift.connect(driftFilter).connect(this.driftGain).connect(this.master);
    drift.start();
  }

  /** continuous parameters, call every frame */
  update(params: {
    speed: number;
    throttle: number;
    wetness: number;
    drifting: boolean;
    boosting: boolean;
    airborne: boolean;
  }): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const speedT = Math.min(1, Math.abs(params.speed) / 33);

    // engine pitch: idle 46 Hz -> ~150 Hz, revs free in the air
    let rpm = 46 + speedT * 92 + params.throttle * 18;
    if (params.airborne && params.throttle > 0.3) rpm += 26;
    if (params.boosting) rpm *= 1.22;
    this.engineOsc1.frequency.setTargetAtTime(rpm, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.007 + 2.1, t, 0.06);
    this.engineSub.frequency.setTargetAtTime(rpm * 0.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(420 + speedT * 1500 + (params.boosting ? 900 : 0), t, 0.1);
    const vol = 0.16 + params.throttle * 0.1 + speedT * 0.08 + (params.boosting ? 0.06 : 0);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);

    // water rush
    const rush = speedT * 0.34 * (0.25 + params.wetness * 0.75);
    this.rushGain.gain.setTargetAtTime(rush, t, 0.12);
    this.rushFilter.frequency.setTargetAtTime(500 + speedT * 900, t, 0.15);

    // drift spray
    this.driftGain.gain.setTargetAtTime(params.drifting ? 0.12 : 0, t, 0.07);
  }

  /** landing thud: noise burst + sine body */
  slam(strength: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.3);
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 500 + strength * 500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5 * strength, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    noise.connect(nf).connect(ng).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.3);

    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.55 * strength, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.25);
  }

  gateChime(): void {
    this.blip(880, 0.07, 0.14);
    setTimeout(() => this.blip(1318.5, 0.09, 0.16), 70);
  }

  boostWhoosh(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.7);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3600, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
    noise.connect(f).connect(g).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.7);
  }

  /** countdown: 3 low beeps + one long high "GO" tone */
  horn(final: boolean): void {
    this.blip(final ? 880 : 440, final ? 0.5 : 0.14, final ? 0.35 : 0.22, "square");
  }

  collision(strength: number): void {
    this.blip(90 + strength * 60, 0.12, 0.3 * strength, "triangle");
  }

  private blip(freq: number, dur: number, vol: number, type: OscillatorType = "sine"): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
