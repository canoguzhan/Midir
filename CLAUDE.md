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
games/<slug>/dist/       build output: <slug>.zip and web/ (the flat upload), playtest screenshots, release work files (gitignored)
studio.json              studio identity for press kits: BroadGamesPro, https://broadgames.pro, contact email, about text
tools/                   new_game.py, factory.py, catalog.py, build.py, playtest.mjs, capture.mjs, release.py, balance.py, optimize_models.sh
mp/<slug>.mjs            online game servers (Node + ws), e.g. mp/whirlbash.mjs: systemd `broadgames-mp.service`, port 8090,
                         public at wss://broadgames.pro/mp/<slug> (the only Caddy route without the password)
server.py                studio site (systemd `midir.service`, Caddy with password at https://broadgames.pro): releases with
                         download links at /, games at /games/<slug>/, published packages at /releases/<slug>/
/srv/broadgames/releases/<slug>/   published release (outside git): upload zip, full-package zip, presskit/ page + media
```

## Workflow: "make me a game about X"
1. **Concept.** Read the **Quality gate** section below first. Pick an original, distinctive title and theme with no existing IP, brands or characters, and fill `game.json` → `quality` before writing code. Choose 3D (Three.js template) or 2D (Canvas; see below). Write a 2–3 sentence blueprint covering theme, core loop, controls and ad triggers, and put it in `game.json` → `blueprint`.
2. **Scaffold.** `python3 tools/new_game.py "Title"` creates `games/<slug>/` and links the template's reused assets (free).
3. **Assets: reuse before you generate.**
   - Search with `python3 tools/catalog.py search <words>` and `python3 tools/catalog.py list <kind>`.
   - List library files in `REUSE` in `games/<slug>/bake_assets.py`, using the plain path (for example `models/mob_golem@walk.glb`). The compressed `models/opt/` copy is picked automatically.
   - Add prompts in `MODELS`, `SFX`, `MUSIC`, `VOICE`, `VISUALS` and `VIDEOS` only for what is missing, and give them distinctive names (a name that already exists in the library is reused, not regenerated). Set `STYLE` once for a consistent look. Set `COVERS` to a key-art prompt.
   - `python3 games/<slug>/bake_assets.py --dry` shows what will be reused or generated. Then run it without `--dry`.
   - Check credits with `python3 tools/balance.py`.
   - In a worktree, `.env` is missing (it is gitignored), so the APIs answer 401. Link it first: `ln -s /root/midir/.env .env`. Never copy or commit it.
   - Budget per game without asking: up to 6 Tripo models (a rigged character costs 1 model + 1 rig + 1 retarget per animation), any number of SFX and voice lines, up to 2 music tracks, up to 6 Higgsfield stills, 1 video, and the 3 covers. Ask the user before going beyond that. If a service fails or credits run out, keep going: the game must work with procedural fallbacks, and you report what is missing.
   - Rig presets that work: `idle`, `walk`, `run`, `slash` (and others Tripo exposes as `preset:<name>`). Biped characters need a T-pose prompt.
4. **Code.** Write full, non-truncated `index.html`, `style.css` and `game.js` in `games/<slug>/`, with no placeholders or TODOs. Start from the template, keep its SDK, AUDIO and INPUT sections and `#btnPlay`, and replace the demo gameplay. Gameplay numbers go in `CFG` at the top. Every asset path is relative (`assets/...`) and has a procedural fallback.
   - **Capture protocol (required for the press kit).** With `?capture=1` the game does not start its rAF loop, turns on its autoplay bot, accepts `?lang=en`, and exposes `window.__game = { start(), frame(dt), skip(seconds), info() }`. `frame` advances and renders exactly one frame; `skip` simulates without rendering. The template shows the pattern. The bot must make the game look good: real merges, kills and progress.
     - Also expose `cover(kind)` (kind = landscape | portrait | square | keyart). It stages a hero shot from the game itself with all UI hidden and renders it. Then `python3 tools/game_covers.py <slug>` writes the honest covers to `covers/` with the title in the display font. Prefer this over AI key art: it always matches the game's style.
     - Optionally expose `sim(seconds)`: simulate without rendering and stop when the run ends. A Playwright loop over `start()` / `sim()` / `info()` measures survival time quickly, since rendering in software GL is slow.
   - Use the bot plus `skip()` from a small Playwright script to tune difficulty. Aim for a first run of roughly 5–10 minutes.
5. **Verify.** All of these must pass, and you look at the screenshots yourself:
   - `python3 tools/build.py <slug>` runs the CrazyGames checks and creates the **flat** upload: `games/<slug>/dist/<slug>.zip`, plus the same files unzipped in `dist/web/`.
   - `node tools/playtest.mjs <slug> [--keys=KeyW,Space]` then tests that flat build in headless Chromium at 1216x684, at 800x450 with touch, and from a non-localhost host (where the SDK is disabled, as on the studio site). It fails on JS errors and writes screenshots to `games/<slug>/dist/shots/`. Pass `--source` to test the source folder instead.
   - Fix every ERROR. Read every WARN and fix it or explain it.
   - Go through the **Quality gate** review below with the screenshots open, and record what you found and fixed in `game.json` → `quality.visual_review`.
6. **Release package + press kit (always, for every game).**
   - Fill in `game.json`: `description`, `controls`, `category`, `tags`, `pegi`, `version`, `capture` (`warmup` seconds before the trailer starts, plus `shots` timings in seconds, where 0 is the menu) and `press` (headline, summary, features, quote).
   - `quality` must be filled honestly (`build.py` blocks template text). Then run `python3 tools/release.py <slug>`. It takes 20–30 minutes on this 1-core server, so run it in the background. It produces and publishes:
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
  - **Uploads are flat: CrazyGames does not allow folders.** `build.py` copies every file to the zip root and rewrites the paths in your HTML, JS and CSS: it strips directory prefixes such as `assets/models/`, rebuilds the Three.js import map, and turns relative JS imports into `./name.js`. So:
    - every shipped file name must be unique across all folders (`build.py` stops if two collide);
    - write asset paths as plain strings or templates that contain the full directory (`assets/audio/voice/x_{lang}.mp3`), never folder names assembled at runtime from parts.
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

## Quality gate (why Merge Siege Defense was rejected)
CrazyGames rejected **merge-siege-defense** (2026-10-19) even though it passed every technical check. Its SDK, ads, sizes and paths were all fine. What failed was quality: a generic genre name, a painted AI cover full of melted figures that showed a castle scene the game doesn't have, heroes standing in T-pose on the menu, a flat red-tinted golem, realistic low-poly models mixed with a cartoon cover, menu text overlapping the board, system fonts, no onboarding beyond a line of key hints, and Esc bound to pause. Do not rebuild or resubmit that game. Every new game must clear this bar (from https://docs.crazygames.com/requirements/quality/ and /gameplay/):

- **Distinct concept, not a reskin.** Name the top 3 CrazyGames games in the genre and write the twist that sets yours apart in `quality.hook`. Avoid the most saturated hyper-casual templates unless the twist is real.
- **Distinctive name.** Don't use a name made only of genre words, like "Merge Siege Defense", "Tower Defense" or "Chess". `build.py` rejects those. The name and imagery must also say clearly what the game is.
- **One coherent art style** across models, UI, icons, VFX and covers: no realistic and cartoony mix, no painted and 3D mix, no mixed resolutions. Choose a look in `STYLE` and `quality.art_style`, and choose library assets that match it. A procedural or flat-shaded look done consistently beats mismatched AI assets.
- **Clean models.** No T-poses: every visible character plays an idle animation, including on the menu. Hit flashes are short emissive pulses, not a full flat tint. Check that nothing z-fights, clips or floats.
- **Polished UI.** Use the bundled fonts (`library/fonts`: Lilita One for titles and buttons, Nunito for UI). The template wires them in. Menu text must never overlap gameplay elements. Big, clearly labeled buttons with no delay on them. Readable at 800x450 and at every listed iframe size.
- **Onboarding inside gameplay.** The first session teaches by doing (a guided first level, a ghost hand, a highlighted target, at most a few words per step), within 30 seconds, and can be skipped. Show controls as visual key and mouse icons, not a line of text.
- **Content depth.** Give at least 10 minutes of varied play: a level or wave curve, unlocks and upgrades, bosses or new mechanics that keep appearing. No repetitive filler. Describe it in `quality.content`.
- **Honest covers.** Covers show the game's real characters, setting and style, matching the screenshots. The default is `tools/game_covers.py`, which renders them in-engine. Look at every cover at full size and regenerate any that have AI artifacts (melted hands or faces, garbled crowds, fake text). The only text allowed is the title, drawn in the display font.
- **Comfortable audio.** Keep levels consistent, nothing too loud, and music that suits the setting.
- **Restricted keys.** Never bind Escape (it exits fullscreen) or Ctrl/Cmd+W. Use P plus an on-screen pause button. Prefer arrow keys alongside WASD (AZERTY users).
- **Basic Launch has ads disabled.** The game must play fully with no ads: no frozen screens between levels, and no rewarded buttons that do nothing (hide them).
- **Readable at every size**, physics the same at 60, 144 and 165 Hz, no errors or crashes, PEGI 12, and English text that is correct and natural.

Review checklist before reporting (open each screenshot, cover and video frame yourself, and fix before release):
1. Menu: are characters animated (not T-posed), is there no overlapping text, and does it use the display font?
2. Gameplay at 1216x684 and at 800x450: is every label readable and is the goal obvious without reading?
3. First 30 seconds as a new player: does the onboarding show what to do?
4. Is the style consistent between the cover, menu and gameplay?
5. Covers: no artifacts, they show real gameplay elements, and the title is in the display font.
6. At 5 minutes in (`skip()`): is something new still happening?

## Online multiplayer (when a game has it)
Whirlbash is the reference for this.
- **Shared rules.** Put the rules in a pure `games/<slug>/sim.js`, with no DOM and no THREE, that reports what happened as events. The browser runs it for solo play. The Node server `mp/<slug>.mjs` imports the same file and runs authoritative rooms. `game.js` only reacts to events, so solo and online share one renderer.
- **Netcode that is good enough for casual games.**
  - The server sends 20 snapshots/s and runs physics at 60 Hz.
  - Other players are drawn about 120 ms in the past, interpolated between snapshots.
  - Your own top is predicted locally with the same `integrate()` and eased toward the server position.
  - Keep messages as small JSON.
- **No accounts.**
  - Show the CrazyGames username when it is available; CrazyGames requires it in multiplayer. The client sends `SDK.user.getUserToken()` and the server verifies it (RS256, key from https://sdk.crazygames.com/publicKey.json), so nobody can claim someone else's name.
  - Players without an account pick a name from fixed word lists (adjective + noun + number, `NAME_A` / `NAME_B` in sim.js); the server accepts only names built from those lists, else it generates a guest name.
  - Never show text a player typed (no chat, no free-text names), so nothing needs moderation.
- **CrazyGames room flow.**
  - Call `updateRoom({roomId, isJoinable, inviteParams})` only when something changes, and `leftRoom()` on leave.
  - Make invite links with `inviteLink({roomId})`, falling back to `?room=CODE` off-platform.
  - At boot, `getInviteParam('roomId')` and `isInstantMultiplayer` go straight into a room; `addJoinRoomListener` handles invites that arrive in-game.
  - Keep players in the same room across rounds.
- **Server limits** (copy them): max rooms, players per room, connections per IP, message size and message rate. Idle rooms are deleted.
- **Deploy.**
  - `npm install` in /root/midir (installs `ws`).
  - Copy `deploy/broadgames-mp.service` to /etc/systemd/system, then `systemctl enable --now broadgames-mp`.
  - Caddy already proxies `/mp/*` without basic auth (`deploy/Caddyfile`).
  - After a change to `sim.js` or the server, run `systemctl restart broadgames-mp`.
- **Test** with two headless browsers against a local server (`MP_PORT=8099 node mp/whirlbash.mjs`, then open the game with `?mp=ws://127.0.0.1:8099/mp/whirlbash&debug=1`).
  - `window.__wb()` exposes the client world.
  - Software GL on this 1-CPU server runs at about 3 fps, so judge sync from state dumps, not from smoothness.

## 2D games
Drop the `importmap` and the Three.js imports. Draw on the `<canvas id="game">` with a 2D context scaled to `devicePixelRatio`. Set `three=False` in the game's `bake()` call so the vendor folder isn't shipped. Use `VISUALS` (Higgsfield stills and sprites, saved as WebP) instead of `MODELS`. Keep the same SDK, AUDIO and INPUT sections and the same state machine.

## Never
- Put API keys, generation endpoints or calls to the studio/asset server in game files. `build.py` blocks this. The only server a game may contact is its own online game server at wss://broadgames.pro/mp/<slug>.
- Generate assets at runtime.
- Delete files from `library/`, since other games may ship them.
- Edit `.env`.
