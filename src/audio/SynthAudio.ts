/**
 * All audio synthesized with Web Audio API — engine, water rush, impacts, horn.
 */
export class SynthAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private rushGain: GainNode | null = null;
  private rushSource: AudioBufferSourceNode | null = null;
  private started = false;

  async ensure(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);

    // Engine: saw + filter
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    // Water rush: filtered noise
    const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.rushSource = this.ctx.createBufferSource();
    this.rushSource.buffer = noiseBuf;
    this.rushSource.loop = true;
    const rushFilter = this.ctx.createBiquadFilter();
    rushFilter.type = 'bandpass';
    rushFilter.frequency.value = 800;
    rushFilter.Q.value = 0.7;
    this.rushGain = this.ctx.createGain();
    this.rushGain.gain.value = 0;
    this.rushSource.connect(rushFilter);
    rushFilter.connect(this.rushGain);
    this.rushGain.connect(this.master);
    this.rushSource.start();
    this.started = true;
  }

  resume(): void {
    void this.ensure().then(() => this.ctx?.resume());
  }

  update(rpm: number, speed: number, racing: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter || !this.rushGain) return;
    const now = this.ctx.currentTime;
    const targetFreq = 55 + rpm * 140;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + rpm * 1800, now, 0.08);
    this.engineGain.gain.setTargetAtTime(racing ? 0.08 + rpm * 0.12 : 0.02, now, 0.1);
    const rush = Math.min(Math.abs(speed) / 38, 1);
    this.rushGain.gain.setTargetAtTime(rush * 0.1, now, 0.1);
  }

  playHorn(): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = 440;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.frequency.setValueAtTime(440, this.ctx.currentTime);
    o.frequency.setValueAtTime(330, this.ctx.currentTime + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    o.stop(this.ctx.currentTime + 0.55);
  }

  playImpact(strength: number): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 80 + strength * 40;
    g.gain.value = 0.2 * strength;
    o.connect(g);
    g.connect(this.master);
    const t0 = this.ctx.currentTime;
    o.start(t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    o.stop(t0 + 0.22);
  }
}
