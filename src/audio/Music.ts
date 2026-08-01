/**
 * Royalty-free race music — 100% synthesized in Web Audio (no samples,
 * no licensed tracks). Four selectable loops the player can pick before
 * a race. Each is a short generative pattern that repeats.
 */

export type MusicTrackId = "off" | "tide" | "pulse" | "horizon" | "nitro";

export const MUSIC_TRACKS: { id: MusicTrackId; name: string }[] = [
  { id: "off", name: "Müzik Kapalı" },
  { id: "tide", name: "Tide Runner" },
  { id: "pulse", name: "Pulse Current" },
  { id: "horizon", name: "Horizon Rush" },
  { id: "nitro", name: "Nitro Swell" },
];

interface Pattern {
  bpm: number;
  /** MIDI-ish note sequence looping */
  bass: number[];
  lead: number[];
  pad: number[];
}

const PATTERNS: Record<Exclude<MusicTrackId, "off">, Pattern> = {
  tide: {
    bpm: 112,
    bass: [36, 36, 43, 36, 38, 38, 43, 41],
    lead: [60, 67, 72, 67, 65, 72, 69, 67],
    pad: [48, 55, 60],
  },
  pulse: {
    bpm: 128,
    bass: [33, 33, 40, 33, 36, 36, 40, 38],
    lead: [57, 64, 69, 64, 62, 69, 67, 64],
    pad: [45, 52, 57],
  },
  horizon: {
    bpm: 100,
    bass: [38, 38, 45, 43, 41, 41, 45, 43],
    lead: [62, 69, 74, 69, 67, 74, 72, 69],
    pad: [50, 57, 62],
  },
  nitro: {
    bpm: 140,
    bass: [35, 35, 42, 35, 37, 42, 40, 37],
    lead: [59, 66, 71, 66, 64, 71, 69, 66],
    pad: [47, 54, 59],
  },
};

function midiHz(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  track: MusicTrackId = (localStorage.getItem("inkwake_music") as MusicTrackId) || "tide";
  muted = localStorage.getItem("inkwake_music_muted") === "1";
  private started = false;

  private ensure(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.started = true;
  }

  setTrack(id: MusicTrackId): void {
    this.track = id;
    localStorage.setItem("inkwake_music", id);
    this.restart();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem("inkwake_music_muted", m ? "1" : "0");
    this.applyGain();
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }

  /** Call after a user gesture */
  start(): void {
    this.ensure();
    void this.ctx?.resume();
    this.restart();
  }

  stop(): void {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  private applyGain(): void {
    if (!this.master || !this.ctx) return;
    const on = !this.muted && this.track !== "off";
    this.master.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.08);
  }

  private restart(): void {
    this.stop();
    if (!this.started || this.track === "off") {
      this.applyGain();
      return;
    }
    this.ensure();
    const ctx = this.ctx!;
    const pat = PATTERNS[this.track];
    const stepMs = (60_000 / pat.bpm) / 2; // 8th notes
    this.step = 0;
    this.applyGain();

    const tick = () => {
      if (!this.ctx || !this.master || this.muted || this.track === "off") return;
      const t = this.ctx.currentTime + 0.03;
      const i = this.step % pat.bass.length;
      this.note(midiHz(pat.bass[i]), t, 0.22, "triangle", 0.35);
      if (this.step % 2 === 0) {
        this.note(midiHz(pat.lead[i]), t, 0.18, "sawtooth", 0.12);
      }
      if (this.step % 8 === 0) {
        for (const n of pat.pad) this.note(midiHz(n), t, 0.7, "sine", 0.05);
      }
      // soft kick
      if (this.step % 4 === 0) this.kick(t);
      this.step++;
    };
    tick();
    this.timer = window.setInterval(tick, stepMs);
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = type === "sawtooth" ? 1800 : 1200;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(f).connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}
