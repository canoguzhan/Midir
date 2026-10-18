# Sanctuary Merchant

A 3D arcade-idle game that runs in the browser, built with Three.js for the CrazyGames portal. You play the Sanctuary Artisan: craft weapons, potions and spell tomes, carry them stacked on your head, and serve impatient fantasy champions before they charge into lane. Mouse, keyboard and touch are all supported, in English and Turkish.

## Files (`public/`)
| File | Role |
|---|---|
| `index.html` | Game shell, HUD, title screen, CrazyGames banner container |
| `main.js` | Bootstrap: SDK, then loading progress, title, intro cutscene and play; also the DOM HUD |
| `GameEngine.js` | World, input (WASD and floating joystick), item stacking physics, stations, customers, coins, pads, golems, upgrades, effects |
| `AssetManager.js` | Reads `assets/manifest.json`, loads Tripo3D GLBs and their animation clips with procedural fallbacks, reports progress |
| `CrazyGamesBridge.js` | CrazyGames SDK v3: lifecycle events, midgame and rewarded ads, banners, cloud saves (all no-ops elsewhere) |
| `SoundManager.js` | Web Audio sound effects with HTML5 Audio fallback, synthesised fallbacks, music, ElevenLabs voice barks |
| `HiggsfieldCutscene.js` | Fades a video overlay in, allows skipping, then hands control back to the game |
| `AIServiceBridge.js` | Hook for runtime Tripo3D generation through the server proxy, off by default |

## Assets
- `tools/gen_assets.py` generates models (Tripo3D), sound effects, music and EN/TR voice lines (ElevenLabs), and icons and cutscenes (Higgsfield). It skips anything that already exists. Keys go in `.env`.
- `tools/optimize_models.sh` compresses GLBs into `public/assets/models/opt/` (about 10× smaller) and writes `models/index.json`. Run it after generating new models.
- `public/assets/manifest.json` maps game roles to files. Each model lists candidates, and the first one that exists wins. So once Tripo generates `merchant.glb`, it replaces the stand-in automatically.

## Run
```bash
python3 server.py        # http://localhost:8080 (static files; Tripo proxy only when TRIPO_PROXY=1 in .env)
```
Gameplay numbers (item prices, craft times, pad costs, customer patience, upgrade costs) are at the top of `GameEngine.js`.
