export type RacePhase = 'idle' | 'countdown' | 'racing' | 'finished';

export interface RacerStanding {
  id: number;
  name: string;
  isPlayer: boolean;
  lap: number;
  progress: number; // lap + track u
  lapTimes: number[];
  finished: boolean;
  finishTime: number;
}

export class RaceManager {
  phase: RacePhase = 'idle';
  countdown = 3;
  readonly totalLaps = 3;
  raceTime = 0;
  standings: RacerStanding[] = [];
  private lastU: number[] = [];
  private gateHit: number[] = [];

  init(racers: { id: number; name: string; isPlayer: boolean }[]): void {
    this.standings = racers.map((r) => ({
      id: r.id,
      name: r.name,
      isPlayer: r.isPlayer,
      lap: 1,
      progress: 0,
      lapTimes: [],
      finished: false,
      finishTime: 0,
    }));
    this.lastU = racers.map(() => 0);
    this.gateHit = racers.map(() => 0);
    this.phase = 'idle';
    this.countdown = 3;
    this.raceTime = 0;
  }

  startCountdown(): void {
    this.phase = 'countdown';
    this.countdown = 2.99;
  }

  update(dt: number, progresses: number[]): void {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.raceTime = 0;
      }
      return;
    }
    if (this.phase !== 'racing') return;

    this.raceTime += dt;
    for (let i = 0; i < this.standings.length; i++) {
      const s = this.standings[i];
      if (s.finished) continue;
      const u = progresses[i];
      const prev = this.lastU[i];
      // Lap complete when wrapping past start
      if (prev > 0.85 && u < 0.15) {
        const lapTime = this.raceTime - s.lapTimes.reduce((a, b) => a + b, 0);
        s.lapTimes.push(lapTime);
        if (s.lap >= this.totalLaps) {
          s.finished = true;
          s.finishTime = this.raceTime;
        } else {
          s.lap += 1;
        }
      }
      this.lastU[i] = u;
      s.progress = (s.lap - 1) + u;
    }

    if (this.standings.every((s) => s.finished)) {
      this.phase = 'finished';
    }
    // Or player finished
    const player = this.standings.find((s) => s.isPlayer);
    if (player?.finished) {
      // Freeze others shortly — mark unfinished with estimate
      for (const s of this.standings) {
        if (!s.finished) {
          s.finished = true;
          s.finishTime = this.raceTime + (this.totalLaps - s.progress) * 20;
        }
      }
      this.phase = 'finished';
    }
  }

  placements(): RacerStanding[] {
    return [...this.standings].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  playerPlace(): number {
    const sorted = this.placements();
    return sorted.findIndex((s) => s.isPlayer) + 1;
  }
}
