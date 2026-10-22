#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/bloomtide/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/bloomtide/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/bloomtide/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>

Bloomtide draws every model procedurally (cloud, flowers, trees, critters, valley) so the look stays one coherent
soft low-poly style; only sound and music are baked."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Bloomtide'
STYLE = 'soft pastel low-poly diorama, gentle rounded shapes, warm sunlight, cozy and calm'  # appended to model + visual prompts

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'audio/thunder.mp3', 'audio/unlock.mp3', 'audio/upgrade.mp3', 'audio/level_up.mp3',
    'audio/quest_complete.mp3', 'audio/gate_good.mp3', 'audio/dash_gem.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: everything on screen is procedural

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'bloom_rain_loop': ('gentle soft rain falling on leaves and grass, calm and cozy, steady, no thunder, seamless loop', 6),
    'bloom_pop': ('a single flower bud softly popping open, tiny gentle wooden pluck with a light airy sparkle, cute, very short', 0.6),
    'bloom_petal': ('tiny soft magical petal pickup, bright gentle glass chime tink, airy, very short', 0.5),
    'bloom_butterfly': ('a golden butterfly caught, quick ascending harp glissando with sparkles, joyful and magical', 1.5),
    'bloom_season': ('seasons changing, warm magical swell of wind chimes and soft strings rising into a bright shimmer, uplifting', 4),
    'bloom_helper': ('a small fluffy cloud puffing into existence, soft airy whoosh with a cute bubbly pop', 1),
    'bloom_zone': ('a dry meadow gate opening, soft wooden creak then a warm bright chime and rustling leaves, rewarding', 2),
    'bloom_birds': ('peaceful morning meadow ambience, a few distant songbirds chirping softly, light breeze, calm, loop', 8),
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
    'bgm_bloom_meadow': 'gentle cozy pastoral instrumental for a relaxing garden game, warm acoustic guitar, soft marimba and kalimba, '
                        'light flute melody, brushed percussion, happy and calm, spring morning, seamless loop, no vocals',
    'bgm_bloom_dusk': 'calm dreamy instrumental for a peaceful idle garden game at dusk, soft music box and harp, warm felt piano, '
                      'gentle strings pad, slow and soothing, autumn and winter mood, seamless loop, no vocals',
}

VOICE = {}

VISUALS = {}

VIDEOS = {}

COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py bloomtide

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
