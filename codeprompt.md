Create a complete, responsive browser-based 3D "Arcade Idle" game architecture built with Vanilla JavaScript, HTML5 Canvas, and Three.js (via CDN/bundler). The project must be production-ready and fully architected to integrate external AI generation pipelines (Tripo3D, ElevenLabs, Higgsfield API), custom server-hosted assets, and the CrazyGames SDK v2/v3.

### 1. Theme & IP-Safe Concept
A top-down fantasy MOBA sanctuary shop simulator (inspired by the classic 5v5 battle-arena fountain merchant, using strictly generic high-fantasy tropes—ZERO copyrighted names, characters, or assets from Riot Games or any existing MOBA).
The player controls the "Sanctuary Artisan" who crafts, stacks, and dispenses weapons, potions, and artifacts to allied champions queuing at the base before charging into lane.

---

### 2. External Services & Asset Pipeline Architecture

Design a modular asset-loading and service adapter layer (`AssetManager.js` / `AIServiceBridge.js`):

1. **Tripo3D Integration (3D Mesh Pipeline):**
   - Implement a GLTF/GLB loader module tailored for Tripo3D-generated runtime assets.
   - Design fallback low-poly Three.js procedural geometries (primitives) that render immediately on startup, swapping smoothly to loaded Tripo3D meshes (`merchant.glb`, `hero_warrior.glb`, `hero_mage.glb`, `workstation_anvil.glb`) when fetched from the local/server asset directory (`/assets/models/`).
   - Include a clean mock/stub configuration where Tripo3D API endpoints can be queried for dynamic procedural asset retrieval if enabled.

2. **ElevenLabs Audio Pipeline:**
   - Create an audio controller module (`SoundManager.js`) using the Web Audio API alongside an HTML5 Audio fallback.
   - Configure preloaded audio routes pointing to ElevenLabs-generated voice lines (`/assets/audio/voice/`):
     - Impatient hero grunts & bark lines ("I need steel!", "The lane is falling!", "My mana runs dry!").
     - Merchant quips upon completing bulk sales.
   - Keep procedural synthesized audio fallbacks (beeps, coins, pops) active if external audio files fail to load.

3. **Higgsfield API (Video & Cutscene Pipeline):**
   - Provide an overlay player component (`HiggsfieldCutscene.js`) designed to display dynamic video/cinematic clips generated via Higgsfield API (e.g., stylized 2–3 second intro sequence showing the battlefield beyond the base, or celebratory victory splash screen).
   - Video container must handle standard MP4/WebM playback with smooth opacity fades, automatic muting/unmuting hooks, and seamless handoff back to the Three.js gameplay loop.

4. **Server Asset Management:**
   - Organize an asset manifest structure (`/assets/manifest.json`) managing textures, UI icons, 3D models, and sound files with loading progress indicators and error-handling fallbacks.

---

### 3. CrazyGames SDK Integration

The architecture must comply strictly with CrazyGames publishing requirements:
- **SDK Loader:** Asynchronously load the official CrazyGames SDK script (`https://sdk.crazygames.com/crazygames-sdk-v2.js` or modern ESM equivalent).
- **Initialization Hook:** Await SDK initialization before mounting game logic.
- **Game State Lifecycle Events:**
  - Fire `crazygames.game.gameplayStart()` when the player begins moving/serving.
  - Fire `crazygames.game.gameplayStop()` during pauses, UI overlays, cutscenes, or ad breaks.
  - Fire `crazygames.game.happytime()` on satisfying milestones (e.g., unlocking a new workstation or hitting 500 gold).
- **Monetization & Ad Loops:**
  - **Midgame Ad (Interstitial):** Triggerable between major base expansions or map tiers, properly muting audio and calling `gameplayStop()` / `gameplayStart()`.
  - **Rewarded Ad Hooks:**
    - "Instant Restock / 2x Speed Frenzy": Option to watch a rewarded video ad to give the merchant 2x movement speed and instant production for 60 seconds.
    - "Hire Master Golem Free": Option to watch a rewarded video ad to spawn a temporary assistant worker.
  - **Responsive Banner Placeholders:** Designate container `div` IDs matching CrazyGames responsive banner specs (e.g., `#crazygames-banner-container-leaderboard`).

---

### 4. Core Arcade-Idle Mechanics

1. **Player Movement & Physics:**
   - Dual-input support: WASD / Arrow keys for desktop; responsive virtual floating joystick for mobile touch screens.
   - Procedural vertical stacking: Items pick up onto the merchant's head with spring/lerp physics and a satisfying horizontal wobble during sharp turns.
   - Initial stack capacity: 4 items (upgradable).

2. **Production Stations & Service Counters:**
   - **Starter Forge:** Produces "Rune Blades" every 1.5s onto a collection rack (rack cap: 10).
   - **Mana Font:** Produces "Flasks of Vitality" every 2.0s.
   - **Service Counter:** Champions queue up with floating request speech bubbles. Stepping onto the service zone auto-dispenses matching items from the stack to heroes.
   - Satisfied heroes fling gold coins onto the stone floor before sprinting down the exit path.

3. **Currency & Unlock Pads:**
   - Walking near dropped gold coins triggers a magnetic vacuum pull with a pop effect and HUD balance counter.
   - Circular progressive floor pads (fill up as player stands on them and gold deducts):
     - **Pad A ($50 Gold):** Unlocks the Armor Anvil (creates Tower Shields).
     - **Pad B ($150 Gold):** Hires an automated Assistant Golem (AI worker stocking shelves).
     - **Pad C ($300 Gold):** Unlocks Mystic Scribe Bench (creates Spell Tomes for 4x profit).
     - **Pad D ($100 Gold):** Upgrade Desk (Move Speed, Stack Capacity, Crafting Speed).

4. **Procedural Customers (Hero Archetypes):**
   - **The Berserker:** Only buys Blades; walks fast, impatient timer.
   - **The Elementalist:** Buys Flasks and Tomes; tips 50% extra gold if served fast.
   - **The Juggernaut:** Buys Shields; high patience threshold.
   - Each customer features a floating circular patience ring. If depleted, they express frustration with an exclamation icon and abandon the queue.

---

### 5. Visuals & Technical Standards
- **Camera:** Fixed isometric projection (~45° pitch, 45° yaw) smoothly tracking the player.
- **Lighting & Aesthetics:** Soft directional fantasy lighting, ambient occlusion tinting, shadow maps, glowing runic accents on the ground.
- **UI & Juice:** Minimalist, sleek web HUD showing gold, stack count, and dynamic floating "+Gold" score splats. Screen-shake and scale-bounce tweens on pad unlocks and purchases.
- **Self-Contained File Setup:** Provide clean, modular code broken into `index.html`, `main.js`, `AssetManager.js`, `CrazyGamesBridge.js`, and `GameEngine.js`.
