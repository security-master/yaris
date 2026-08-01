/**
 * Pre-race garage / account menu (HTML overlay): Google login, boat colour,
 * music track, leaderboard, race history, start button, mute.
 */

import type { User } from "@supabase/supabase-js";
import {
  fetchLeaderboard,
  fetchMyRaces,
  fetchProfile,
  onAuthChange,
  signInWithGoogle,
  signOut,
  submitRaceResult,
  supabaseConfigured,
  updateBoatColor,
  type LeaderboardRow,
  type RaceResultRow,
} from "../services/supabase";
import { MUSIC_TRACKS, type MusicPlayer, type MusicTrackId } from "../audio/Music";
import type { AudioEngine } from "../audio/AudioEngine";
import { Palette } from "../core/Palette";

const BOAT_COLORS = [
  { name: "Sunset", hex: 0xff7a38 },
  { name: "Ocean", hex: 0x1e90ff },
  { name: "Lime", hex: 0x3cf2a4 },
  { name: "Violet", hex: 0x8a2be2 },
  { name: "Crimson", hex: 0xf04a4a },
  { name: "Gold", hex: 0xffd23f },
  { name: "White", hex: 0xf2f2f2 },
  { name: "Carbon", hex: 0x22262e },
];

function fmtMs(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms)) return "--:--.--";
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
}

export class Menu {
  private root: HTMLElement;
  private user: User | null = null;
  private unsub: (() => void) | null = null;
  boatColor = Number(localStorage.getItem("inkwake_boat_color") ?? Palette.liveries[0].hull);
  onStart: ((boatColor: number) => void) | null = null;

  constructor(
    private music: MusicPlayer,
    private sfx: AudioEngine
  ) {
    this.root = document.getElementById("menu")!;
    this.bind();
    this.renderColors();
    this.renderMusic();
    this.syncMuteButtons();
    this.refreshAuthUi();
    this.unsub = onAuthChange((u) => {
      this.user = u;
      void this.refreshAuthUi();
    });
    if (!supabaseConfigured) {
      const warn = this.root.querySelector("[data-supabase-warn]") as HTMLElement | null;
      if (warn) warn.hidden = false;
    }
  }

  show(): void {
    this.root.hidden = false;
    void this.refreshLists();
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  private bind(): void {
    this.root.querySelector("[data-action=google]")?.addEventListener("click", () => {
      void signInWithGoogle().then((r) => {
        if (r.error) alert(r.error);
      });
    });
    this.root.querySelector("[data-action=signout]")?.addEventListener("click", () => {
      void signOut();
    });
    this.root.querySelector("[data-action=start]")?.addEventListener("click", () => {
      this.music.start();
      this.sfx.start();
      this.hide();
      this.onStart?.(this.boatColor);
    });
    this.root.querySelector("[data-action=mute-sfx]")?.addEventListener("click", () => {
      this.sfx.toggleMute();
      this.syncMuteButtons();
    });
    this.root.querySelector("[data-action=mute-music]")?.addEventListener("click", () => {
      this.music.toggleMute();
      this.music.start();
      this.syncMuteButtons();
    });
  }

  private syncMuteButtons(): void {
    const sfxBtn = this.root.querySelector("[data-action=mute-sfx]") as HTMLButtonElement | null;
    const musBtn = this.root.querySelector("[data-action=mute-music]") as HTMLButtonElement | null;
    if (sfxBtn) sfxBtn.textContent = this.sfx.muted ? "SFX: Kapalı" : "SFX: Açık";
    if (musBtn) musBtn.textContent = this.music.muted || this.music.track === "off" ? "Müzik: Kapalı" : "Müzik: Açık";
  }

  private renderColors(): void {
    const host = this.root.querySelector("[data-colors]")!;
    host.innerHTML = "";
    for (const c of BOAT_COLORS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (c.hex === this.boatColor ? " active" : "");
      b.style.background = "#" + c.hex.toString(16).padStart(6, "0");
      b.title = c.name;
      b.addEventListener("click", () => {
        this.boatColor = c.hex;
        localStorage.setItem("inkwake_boat_color", String(c.hex));
        host.querySelectorAll(".swatch").forEach((el) => el.classList.remove("active"));
        b.classList.add("active");
        if (this.user) void updateBoatColor(this.user.id, c.hex);
      });
      host.appendChild(b);
    }
  }

  private renderMusic(): void {
    const sel = this.root.querySelector("[data-music]") as HTMLSelectElement;
    sel.innerHTML = "";
    for (const t of MUSIC_TRACKS) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === this.music.track) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      this.music.setTrack(sel.value as MusicTrackId);
      this.music.start();
      this.syncMuteButtons();
    });
  }

  private async refreshAuthUi(): Promise<void> {
    const guest = this.root.querySelector("[data-guest]") as HTMLElement;
    const authed = this.root.querySelector("[data-authed]") as HTMLElement;
    const nameEl = this.root.querySelector("[data-username]") as HTMLElement;
    if (this.user) {
      guest.hidden = true;
      authed.hidden = false;
      const profile = await fetchProfile(this.user.id);
      nameEl.textContent = profile?.display_name || this.user.email || "Pilot";
      if (profile?.boat_color) {
        this.boatColor = profile.boat_color;
        localStorage.setItem("inkwake_boat_color", String(this.boatColor));
        this.renderColors();
      }
    } else {
      guest.hidden = false;
      authed.hidden = true;
    }
    void this.refreshLists();
  }

  private async refreshLists(): Promise<void> {
    const lb = this.root.querySelector("[data-leaderboard]")!;
    const mine = this.root.querySelector("[data-my-races]")!;
    const rows = await fetchLeaderboard(10);
    lb.innerHTML = rows.length
      ? rows
          .map(
            (r: LeaderboardRow, i) =>
              `<li><span>${i + 1}. ${escapeHtml(r.display_name || "Pilot")}</span><span>${fmtMs(r.finish_time_ms)}</span></li>`
          )
          .join("")
      : "<li class='muted'>Henüz sonuç yok</li>";

    if (!this.user) {
      mine.innerHTML = "<li class='muted'>Giriş yapınca yarışların burada</li>";
      return;
    }
    const races = await fetchMyRaces(this.user.id, 8);
    mine.innerHTML = races.length
      ? races
          .map(
            (r: RaceResultRow) =>
              `<li><span>${r.position}. sıra</span><span>${fmtMs(r.finish_time_ms)} · best ${fmtMs(r.best_lap_ms)}</span></li>`
          )
          .join("")
      : "<li class='muted'>İlk yarışını tamamla</li>";
  }

  async publishResult(input: {
    finishTimeMs: number;
    bestLapMs: number | null;
    position: number;
    boatColor: number;
    missedGates: number;
  }): Promise<void> {
    if (!this.user) return;
    await submitRaceResult({ userId: this.user.id, ...input });
    void this.refreshLists();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
