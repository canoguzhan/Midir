# BroadGamesPro — Game Factory

Ask Claude Code for a game ("make me a 3D endless runner with a fox") and it builds a complete, original HTML5 game that is ready to upload to [CrazyGames](https://developer.crazygames.com). Assets are pre-baked offline with Tripo3D (3D models), ElevenLabs (SFX, music, voice) and Higgsfield (images, video, covers). The shared `library/` is checked first, so assets are reused across games.

The agent's instructions are in `CLAUDE.md`, and the user's directive is in `crazygames_agent_directive.md`.

## Per game
```bash
python3 tools/new_game.py "Fox Dash"            # scaffold games/fox-dash/ from template/
python3 tools/catalog.py search fox             # find reusable library assets
python3 games/fox-dash/bake_assets.py --dry     # what would be reused / generated
python3 games/fox-dash/bake_assets.py           # bake assets (+ the 3 submission covers)
node tools/playtest.mjs fox-dash                # headless Chromium smoke test + screenshots
python3 tools/build.py fox-dash                 # CrazyGames checks -> games/fox-dash/dist/fox-dash.zip
python3 tools/release.py fox-dash               # full package + press kit (videos, screenshots, store listing) -> website
python3 server.py                               # preview: http://localhost:8080/
python3 tools/balance.py                        # API credits left
```

Upload `games/<slug>/dist/<slug>.zip` together with the three images in `games/<slug>/covers/` (1920×1080, 800×1200, 800×800). The store text and controls are in `games/<slug>/game.json`.

## Setup on a new machine
```bash
cp .env.example .env               # add TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY
apt-get install -y nodejs npm ffmpeg python3-pil   # GLB compression, video encoding, covers
npm install && npm run setup                       # Playwright + Chromium for playtests
```
