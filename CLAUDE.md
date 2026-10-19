# BroadGamesPro Game Factory: CrazyGames Studio Architect

This repo is a game-creation agent. Every time the user asks for a game, build a **new, complete, original HTML5 game** that is ready to upload to CrazyGames.com, using pre-baked AI assets (Tripo3D, ElevenLabs, Higgsfield) and the shared asset library.

The user's directive is `crazygames_agent_directive.md`, and it is the source of truth for role, standards and output. This file adds how to carry it out in this repo, plus the corrections below, which follow the official CrazyGames docs and override the directive's code sample where they differ:
- `await window.CrazyGames.SDK.init()` resolves to `undefined`. Keep the SDK object as `window.CrazyGames.SDK`, and treat `environment === 'disabled'` as "no SDK".
- Mute audio on `adStarted`, not on request. Unmute on `adFinished` and `adError`.
- Rewarded ads grant the reward **only** on `adFinished`. When ads are unavailable or error out, hide the button (a button that does nothing gets the game rejected in Basic Launch). Never grant the reward when the SDK is missing.
- Honour `SDK.game.settings.muteAudio` and its change listener. It overrides in-game audio (needed for Full Launch).
- Three.js is vendored (`assets/vendor/three/`, r170) rather than loaded from a CDN, so builds are 100% self-contained.
- The directive's per-game `bake_assets.py` exists, but it is a short manifest that calls the shared pipeline `tools/factory.py`, so the API code is not copied into every game.
- The template (`template/game.js`) already implements all of the above. Keep its SDK, AUDIO and INPUT sections when you write a new game.

## Layout
```
crazygames_agent_directive.md  the user's directive (role, standards, output protocol)
.env                     API keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY (HF_KEY also accepted). Never commit, never ship.
library/                 shared assets from every game so far (models, models/opt, audio, audio/voice, visuals, vendor/three)
library/catalog.json     index with the prompt and source game for each asset
template/                starter game: index.html, style.css, game.js, bake_assets.py, game.json
games/<slug>/            one folder per game; this folder is exactly what ships (minus bake_assets.py, game.json, covers/, dist/)
games/<slug>/covers/     the 3 submission covers: landscape 1920x1080, portrait 800x1200, square 800x800
games/<slug>/dist/       build output: <slug>.zip, playtest screenshots, release work files (gitignored)
studio.json              studio identity for press kits: BroadGamesPro, https://broadgames.pro, contact email, about text
tools/                   new_game.py, factory.py, catalog.py, build.py, playtest.mjs, capture.mjs, release.py, balance.py, optimize_models.sh
server.py                studio site (systemd `midir.service`, Caddy with password at https://broadgames.pro): releases with
                         download links at /, games at /games/<slug>/, published packages at /releases/<slug>/
/srv/broadgames/releases/<slug>/   published release (outside git): upload zip, full-package zip, presskit/ page + media
```

## Workflow: "make me a game about X"
1. **Concept.** Pick an original title and theme with no existing IP, brands or characters. Choose 3D (Three.js template) or 2D (Canvas; see below). Write a 2–3 sentence blueprint covering theme, core loop, controls and ad triggers, and put it in `game.json` → `blueprint`.
2. **Scaffold.** `python3 tools/new_game.py "Title"` creates `games/<slug>/` and links the template's reused assets (free).
3. **Assets: reuse before you generate.**
   - Search with `python3 tools/catalog.py search <words>` and `python3 tools/catalog.py list <kind>`.
   - List library files in `REUSE` in `games/<slug>/bake_assets.py`, using the plain path (for example `models/mob_golem@walk.glb`). The compressed `models/opt/` copy is picked automatically.
   - Add prompts in `MODELS`, `SFX`, `MUSIC`, `VOICE`, `VISUALS` and `VIDEOS` only for what is missing, and give them distinctive names (a name that already exists in the library is reused, not regenerated). Set `STYLE` once for a consistent look. Set `COVERS` to a key-art prompt.
   - `python3 games/<slug>/bake_assets.py --dry` shows what will be reused or generated. Then run it without `--dry`.
   - Check credits with `python3 tools/balance.py`.
   - Budget per game without asking: up to 6 Tripo models (a rigged character costs 1 model + 1 rig + 1 retarget per animation), any number of SFX and voice lines, up to 2 music tracks, up to 6 Higgsfield stills, 1 video, and the 3 covers. Ask the user before going beyond that. If a service fails or credits run out, keep going: the game must work with procedural fallbacks, and you report what is missing.
   - Rig presets that work: `idle`, `walk`, `run`, `slash` (and others Tripo exposes as `preset:<name>`). Biped characters need a T-pose prompt.
4. **Code.** Write full, non-truncated `index.html`, `style.css` and `game.js` in `games/<slug>/`, with no placeholders or TODOs. Start from the template, keep its SDK, AUDIO and INPUT sections and `#btnPlay`, and replace the demo gameplay. Gameplay numbers go in `CFG` at the top. Every asset path is relative (`assets/...`) and has a procedural fallback.
   - **Capture protocol (required for the press kit).** With `?capture=1` the game does not start its rAF loop, turns on its autoplay bot, accepts `?lang=en`, and exposes `window.__game = { start(), frame(dt), skip(seconds), info() }`. `frame` advances and renders exactly one frame; `skip` simulates without rendering. The template shows the pattern. The bot must make the game look good: real merges, kills and progress.
   - Use the bot plus `skip()` from a small Playwright script to tune difficulty. Aim for a first run of roughly 5–10 minutes.
5. **Verify.** All of these must pass, and you look at the screenshots yourself:
   - `node tools/playtest.mjs <slug> [--keys=KeyW,Space]` runs headless Chromium at 1216x684 and at 800x450 with touch. It fails on JS errors and writes screenshots to `games/<slug>/dist/shots/`.
   - `python3 tools/build.py <slug>` runs the CrazyGames checks and creates `games/<slug>/dist/<slug>.zip`.
   - Fix every ERROR. Read every WARN and fix it or explain it.
6. **Release package + press kit (always, for every game).**
   - Fill in `game.json`: `description`, `controls`, `category`, `tags`, `pegi`, `version`, `capture` (`warmup` seconds before the trailer starts, plus `shots` timings in seconds, where 0 is the menu) and `press` (headline, summary, features, quote).
   - Then run `python3 tools/release.py <slug>`. It takes 20–30 minutes on this 1-core server, so run it in the background. It produces and publishes:
     - `<slug>-crazygames-upload.zip`, the build to upload;
     - `<slug>-full-package.zip`, with `1-upload/`, `2-store-listing/store-listing.txt`, `3-covers/`, `4-preview-video/` (1920x1080 and 1080x1620, ~15.5 s, no audio, opening on the cover), `5-screenshots/`, `6-press-kit/` (press release md and html, fact sheet, logo, key art) and `README.txt`;
     - a press page at `/releases/<slug>/presskit/`.
   - The studio site's front page lists the release with download links automatically.
   - Look at the screenshots and at least one video frame (`ffmpeg -ss 8 -i <video> -frames:v 1 x.png`) before reporting.
7. **Report** in the directive's output protocol:
   - the blueprint;
   - what `bake_assets.py` reused and generated, plus anything that failed;
   - the files written;
   - the exact commands to re-bake, preview and package;
   - the download links: https://broadgames.pro/ (front page), `/releases/<slug>/<slug>-full-package.zip` and `/releases/<slug>/presskit/`;
   - the store fields from `game.json`.
   Code lives in the files. Do not paste whole files into chat.
8. **Commit** the game folder on a branch and push it. Then ask the user to merge, and after the merge pull `main` in `/root/midir` and `systemctl restart midir`, so the Play link works on the site. Releases in `/srv/broadgames/releases` show up without a merge.

## CrazyGames rules every game must meet
- **SDK v3:**
  - Put the `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js">` tag in `<head>`.
  - Await `init()` before calling anything else.
  - Call `gameplayStart()` when play starts, resumes or revives, or the next level begins. Call `gameplayStop()` on every break: menu, pause, game over or level end. Never call either on focus loss.
  - Call `loadingStart()` and `loadingStop()` around the asset load.
  - Use `happytime()` sparingly, for things like a new high score or a boss kill.
- **Ads:** request ads only through the SDK, never your own.
  - Midgame ads go between runs or levels only, never during play and never on menu, settings or shop buttons. The game always continues after `adError`.
  - Rewarded ads are optional, with a non-ad alternative, never shown on the active gameplay screen, and never chained.
  - No banners during gameplay.
- **Size and performance:**
  - Initial download (everything loaded before the first `gameplayStart`) must be ≤ 50MB, and ideally ≤ 20MB for mobile.
  - Total ≤ 250MB and ≤ 1500 files.
  - Use relative paths only.
  - Keep GLBs under 2–3MB each (use the `opt/` copies), and lazy-load extras after gameplay starts.
  - The game must run smoothly on a 4GB-RAM Chromebook.
- **Layout and input:**
  - Landscape on desktop.
  - Legible at 800x450 through 1920x1080, so size text in `vmin` or `clamp()`.
  - Use a fixed-timestep simulation so physics behaves the same at 60, 144 and 165 Hz.
  - Support mouse, keyboard and touch (virtual joystick plus tap buttons).
  - Apply `user-select: none` to the body.
  - Resume the AudioContext on the first tap.
- **Content:**
  - English is required. Turkish is welcome; base other languages on `SDK.user.systemInfo.locale`.
  - Rated PEGI 12 or lower.
  - Original names and assets.
  - No custom fullscreen button.
  - No external links or cross-promotion.
  - Land in gameplay in at most 1 click.
- **Saves:** store the high score (and progress) with the SDK `data` module, mirrored to `localStorage`.
- **State flow:** `BOOT → MENU → PLAYING ⇄ PAUSED → GAMEOVER`. Add juice: screen shake, particle bursts and punchy SFX.
- **Covers:** no borders, and no text except the game title. `factory.py` draws the title.

## 2D games
Drop the `importmap` and the Three.js imports. Draw on the `<canvas id="game">` with a 2D context scaled to `devicePixelRatio`. Set `three=False` in the game's `bake()` call so the vendor folder isn't shipped. Use `VISUALS` (Higgsfield stills and sprites, saved as WebP) instead of `MODELS`. Keep the same SDK, AUDIO and INPUT sections and the same state machine.

## Never
- Put API keys, generation endpoints or calls to this server in game files. `build.py` blocks this.
- Generate assets at runtime.
- Delete files from `library/`, since other games may ship them.
- Edit `.env`.
