/**
 * Supabase client + data access for auth, profiles, race history, leaderboard.
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 */

import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  boat_color: number;
}

export interface RaceResultRow {
  id: string;
  user_id: string;
  finish_time_ms: number;
  best_lap_ms: number | null;
  position: number;
  laps: number;
  boat_color: number;
  missed_gates: number;
  created_at: string;
}

export interface LeaderboardRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  finish_time_ms: number;
  best_lap_ms: number | null;
  position: number;
  boat_color: number;
  created_at: string;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon && !url.includes("YOUR_PROJECT"));

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anon!)
  : null;

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signInWithGoogle(): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase yapılandırılmamış (VITE_SUPABASE_URL / ANON_KEY)." };
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  return error ? { error: error.message } : {};
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
  if (!supabase) {
    cb(null);
    return () => undefined;
  }
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.warn("profile fetch", error.message);
    return null;
  }
  return data as Profile | null;
}

export async function updateBoatColor(userId: string, boatColor: number): Promise<void> {
  if (!supabase) return;
  await supabase.from("profiles").update({ boat_color: boatColor, updated_at: new Date().toISOString() }).eq("id", userId);
}

export async function submitRaceResult(input: {
  userId: string;
  finishTimeMs: number;
  bestLapMs: number | null;
  position: number;
  boatColor: number;
  missedGates: number;
}): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("race_results").insert({
    user_id: input.userId,
    finish_time_ms: input.finishTimeMs,
    best_lap_ms: input.bestLapMs,
    position: input.position,
    laps: 3,
    boat_color: input.boatColor,
    missed_gates: input.missedGates,
  });
  if (error) console.warn("race submit", error.message);
}

export async function fetchMyRaces(userId: string, limit = 20): Promise<RaceResultRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("race_results")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("my races", error.message);
    return [];
  }
  return (data ?? []) as RaceResultRow[];
}

export async function fetchLeaderboard(limit = 20): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  // Prefer the view; fall back to a direct query if the view isn't created yet.
  const view = await supabase
    .from("leaderboard")
    .select("*")
    .order("finish_time_ms", { ascending: true })
    .limit(limit);
  if (!view.error && view.data) return view.data as LeaderboardRow[];

  const { data, error } = await supabase
    .from("race_results")
    .select("user_id, finish_time_ms, best_lap_ms, position, boat_color, created_at, profiles(display_name, avatar_url)")
    .eq("position", 1)
    .order("finish_time_ms", { ascending: true })
    .limit(limit);
  if (error || !data) {
    console.warn("leaderboard", error?.message);
    return [];
  }
  return data.map((r: Record<string, unknown>) => {
    const p = r.profiles as { display_name?: string; avatar_url?: string } | null;
    return {
      user_id: r.user_id as string,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      finish_time_ms: r.finish_time_ms as number,
      best_lap_ms: (r.best_lap_ms as number | null) ?? null,
      position: r.position as number,
      boat_color: r.boat_color as number,
      created_at: r.created_at as string,
    };
  });
}
