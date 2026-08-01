# InkWake GP

Photorealistic open-sea boat racing for the browser — Gerstner ocean, PBR boats,
arcade handling, AI rivals, garage menu, and optional Google login + leaderboard
via Supabase. **Zero external assets**: meshes, textures, SFX and music are all
generated in code.

![stack](https://img.shields.io/badge/stack-Vite%20%2B%20Three.js%20%2B%20TypeScript-blue)

## Live

**https://yaris-seven.vercel.app**

(Production deploys from the `main` branch on Vercel.)

## Play locally

```bash
cp .env.example .env   # optional — fill Supabase keys for auth/leaderboard
npm install
npm run dev
```

| Input | Action |
| --- | --- |
| `↑` / `W` | throttle |
| `↓` / `S` | brake / reverse |
| `←` `→` / `A` `D` | steer |
| `SPACE` / `SHIFT` | drift → release to boost |
| `ENTER` | return to menu from results |

Garage: pick boat colour, music track, mute SFX/music, Google sign-in, start race.

## Features

- **PBR rendering** — `MeshPhysicalMaterial`, ACES tone mapping, soft shadows, procedural IBL
- **Gerstner ocean** — shared CPU/GPU waves, foam splat wakes, spray particles
- **Race** — 4 boats, 3 laps, gates, AI, track guide arrows, soft rail (can't leave the course)
- **Audio** — synthesised engine/water SFX + 4 royalty-free generative music loops
- **Supabase** — Google OAuth, profiles, race history, leaderboard (guest play works without it)

## Supabase setup (required for login / leaderboard)

Cloud agents cannot complete interactive Supabase MCP OAuth. Do this once in the dashboard:

1. Create (or open) a Supabase project.
2. **SQL** → run `supabase/migrations/001_inkwake.sql`.
3. **Authentication → Providers → Google** → enable and set Client ID / Secret from Google Cloud Console (OAuth Web client).
4. **Authentication → URL configuration**
   - Site URL: `https://yaris-seven.vercel.app`
   - Redirect URLs: `https://yaris-seven.vercel.app/**` and `http://localhost:5173/**`
5. Copy **Project URL** + **anon public** key into Vercel → Project → Settings → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Redeploy Vercel (or push a commit) so the build picks up the env vars.

Locally, put the same keys in `.env`.

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck + production build |
| `npm run preview` | serve `dist/` |
| `npm run shots` | Playwright screenshot harness (`?harness=1`) |
