# Midir

A fresh start: no game code yet. These pieces are already in place:

- **`public/assets/`** — every asset generated so far (`models/` GLB files, `img/`, `audio/`).
- **`tools/gen_assets.py`** — the asset pipeline: Tripo3D (models, optionally rigged and animated), ElevenLabs (sound effects and music) and Higgsfield (images and key-art video). Fill in `MODELS`, `SFX`, `MUSIC` and `IMAGES`, then run `python3 tools/gen_assets.py [models|audio|images|all]`. It skips anything that already exists. API keys go in `.env` (see `.env.example`).
- **Hosting**
  - `deploy/midir.service`: a systemd unit that runs `server.py` on 127.0.0.1:8080.
  - `deploy/Caddyfile`: HTTPS and WSS via Caddy.
  - `vercel.json`: serves `public/` and proxies `/api` to the VPS.
  - `public/config.js`: tells the client where the API and WebSocket live.
  - `Dockerfile`: an alternative way to deploy the server.
- **`tools/autocommit.sh`** — the Claude Code Stop hook that commits and pushes after each turn.
