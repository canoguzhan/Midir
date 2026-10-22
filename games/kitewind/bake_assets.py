#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/kitewind/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/kitewind/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/kitewind/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>

Kitewind draws everything procedurally (kites, ribbons, clouds, island, sea, sky) in one soft pastel low-poly style;
only sound and music are baked."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Kitewind'
STYLE = 'soft pastel low-poly seaside diorama, rounded shapes, warm light, cheerful and calm'

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'audio/thunder.mp3', 'audio/whirl_cheer.mp3', 'audio/whirl_confetti.mp3', 'audio/bloom_season.mp3',
    'audio/dash_gem.mp3', 'audio/upgrade.mp3', 'audio/unlock.mp3', 'audio/gate_good.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: everything on screen is procedural

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'kite_wind_loop': ('steady gentle sea breeze high in the sky, soft airy wind whoosh, calm and pleasant, no gusts, seamless loop', 8),
    'kite_flutter_loop': ('a fabric kite fluttering and humming in steady wind, soft rapid cloth flapping, light and airy, seamless loop', 4),
    'kite_shore_loop': ('peaceful seaside ambience, small waves lapping on a sandy beach, a few distant seagulls, light breeze, seamless loop', 10),
    'kite_paint': ('soft magical brush stroke swoosh through a cloud, airy shimmering sparkle, gentle and satisfying, short', 0.8),
    'kite_bloom': ('a cloud bursting into bright colors, soft bubbly pop followed by a cascade of gentle wind chime sparkles, joyful', 1.6),
    'kite_loop': ('a kite doing a full loop in the sky, rising swirling whoosh ending in a bright magical sparkle, exciting', 1.2),
    'kite_dash': ('quick strong gust of wind whooshing past, energetic air rush, short', 0.7),
    'kite_ring': ('flying through a glowing ring in the sky, bright clear bell chime with an airy shimmer, short', 0.7),
    'kite_lantern': ('paper sky lantern lighting up and floating away, warm soft whoosh of flame and a gentle magical twinkle', 1.5),
    'kite_crash': ('a fabric kite tumbling and flapping wildly then landing softly in sand, cartoon, not harsh', 1.2),
    'kite_sky_done': ('festival celebration on a beach: cheerful short fanfare of flutes and bells rising, then sparkles, joyful and warm', 3),
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
    'bgm_kite_day': 'breezy uplifting instrumental for a relaxing kite flying game by the sea, light ukulele and acoustic guitar, airy flute melody, '
                    'soft hand percussion and glockenspiel, sunny and carefree, gentle tempo, seamless loop, no vocals',
    'bgm_kite_night': 'dreamy calm instrumental for flying a kite under stars and an aurora, soft piano and harp, warm synth pads, '
                      'gentle music box sparkles, slow and wondrous, seamless loop, no vocals',
}

VOICE = {}

VISUALS = {}

VIDEOS = {}

COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py kitewind

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
