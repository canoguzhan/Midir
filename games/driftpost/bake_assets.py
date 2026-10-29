#!/usr/bin/env python3
"""Bake Driftpost's assets offline (never at runtime). Everything on screen is procedural Three.js (patchwork valley,
hot-air balloon, cottages, post office, geese, storm clouds, wind streamers), so only sound and music are baked.

  python3 games/driftpost/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/driftpost/bake_assets.py           bake everything into ./assets/
  python3 games/driftpost/bake_assets.py audio     only one group: models | audio | visuals | covers

Covers are rendered in-engine: python3 tools/game_covers.py driftpost"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Driftpost'
STYLE = 'cosy papercraft low-poly countryside diorama, flat shading, soft pastel patchwork fields, warm storybook daylight'

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'audio/kite_wind_loop.mp3', 'audio/bloom_birds.mp3', 'audio/keel_night_fail.mp3', 'audio/kite_sky_done.mp3',
    'audio/wool_star.mp3', 'audio/unlock.mp3', 'audio/works_coin_jar.mp3', 'audio/rune_tile_tap.mp3', 'audio/swv_blocked.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: the whole valley and the balloon are procedural (world.js)

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'dp_burner_loop': ('a hot air balloon propane burner firing steadily, warm deep roaring whoosh of flame, close but not harsh, '
                       'steady, seamless loop', 3),
    'dp_vent': ('a hot air balloon vent opening, soft fabric flutter and a quick airy hiss of warm air escaping, short', 0.8),
    'dp_pickup': ('a parcel hooked up into a wicker basket, quick rope creak, paper parcel rustle and a tiny bright bell ding, cute, short', 0.8),
    'dp_drop': ('a small parcel dropped from a balloon, quick airy whoosh and a soft cloth parachute popping open, light, short', 0.7),
    'dp_deliver': ('a parcel landing softly on a garden lawn, gentle thump, then a cheerful mailbox bell ring and a tiny happy cartoon cheer, short', 1.3),
    'dp_bullseye': ('perfect landing reward, bright sparkling magical chime rising with a soft pop of confetti, cheerful, short', 1.0),
    'dp_miss': ('a parcel thudding into a field and bouncing away, soft cardboard bonk and a gentle descending cartoon whistle, funny, short', 1.0),
    'dp_goose': ('a few cartoon geese honking in surprise as they fly past, short funny honks and flapping wings, not harsh', 1.2),
    'dp_zap': ('a small cartoon storm cloud zapping, quick crackle of light electricity and a soft rumble of thunder, playful not scary, short', 1.2),
    'dp_bump': ('a hot air balloon bumping into something, soft bouncy fabric boing with a light wicker creak, cartoon, short', 0.7),
    'dp_land': ('a wicker balloon basket touching down on grass, soft creaky wicker crunch and a gentle thud, short', 0.7),
    'dp_thermal': ('warm air rising, soft swelling whoosh lifting upward with a gentle airy shimmer, calm, short', 1.4),
    'dp_tick': ('a small brass pocket watch ticking quickly, four soft ticks, gentle tension, short', 0.9),
    'dp_ribbon': ('a gust of wind catching, quick soft whoosh with a light fabric ribbon flap, short', 0.6),
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
    'bgm_driftpost_day': 'cosy cheerful instrumental for a cute hot air balloon mail delivery game over a sunny patchwork countryside, '
                         'light accordion and pizzicato strings, soft acoustic guitar, glockenspiel accents, gentle swaying waltz feel, '
                         'airy and hopeful, medium tempo, seamless loop, no vocals',
    'bgm_driftpost_dusk': 'warm mellow instrumental for a hot air balloon drifting over the countryside at golden sunset, soft piano, '
                          'harp, gentle accordion and light strings, calm floating waltz, nostalgic and cosy, slow medium tempo, '
                          'seamless loop, no vocals',
}

VOICE = {}

VISUALS = {}

VIDEOS = {}

COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py driftpost

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
