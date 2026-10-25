#!/usr/bin/env python3
"""Bake Brightkeel's assets offline (never at runtime). Everything on screen is procedural Three.js (lighthouse, boats,
piers, rocks, water shader), so only sound and music are baked.

  python3 games/brightkeel/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/brightkeel/bake_assets.py           bake everything into ./assets/
  python3 games/brightkeel/bake_assets.py audio     only one group: models | audio | visuals | covers

Covers are rendered in-engine: python3 tools/game_covers.py brightkeel"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Brightkeel'
STYLE = 'cosy low-poly night harbour diorama, flat shading, deep blue sea, warm golden lighthouse beam, colourful boat lanterns'

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'audio/unlock.mp3', 'audio/wool_star.mp3', 'audio/thunder.mp3', 'audio/works_coin_jar.mp3',
    'audio/kite_lantern.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: lighthouse, boats, piers, town and whale are procedural

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'keel_sea_loop': ('calm night sea ambience, small gentle waves lapping against wooden piers and rocks, a very distant soft buoy bell, '
                      'peaceful, no seagulls, no wind howl, seamless loop', 6),
    'keel_foghorn': ('a deep warm lighthouse foghorn blowing one long low note across a calm bay at night, mellow, not harsh', 2.5),
    'keel_toot': ('a small cute fishing boat horn giving two short friendly toots in the distance, cartoonish, soft', 1),
    'keel_dock': ('a little boat docking at a wooden pier: soft rope creak, gentle wooden bump and a bright brass harbour bell ding', 1.4),
    'keel_lit': ('a soft warm magical glow chime as a lantern catches the light, gentle and short, airy shimmer', 0.6),
    'keel_wreck': ('a small wooden boat bumping onto rocks, cartoon wooden crunch and creak followed by a splash, not violent, short', 1.3),
    'keel_bump': ('two small wooden boats gently bonking together on water, hollow wooden knock, cartoon, very short', 0.4),
    'keel_whale': ('a gentle friendly whale song call followed by a big soft water splash and spout whoosh, magical, calm', 3),
    'keel_whirl_loop': ('a swirling whirlpool in the sea, steady gurgling rushing water spinning, seamless loop', 4),
    'keel_rain_loop': ('steady rain falling on a night sea with soft wind, cosy not scary, no thunder, seamless loop', 6),
    'keel_gust': ('a strong gust of sea wind sweeping across the water, whooshing, short', 1.5),
    'keel_night_done': ('short joyful sea shanty fanfare: accordion and fiddle rising melody with a bright bell at the end, celebratory', 3.5),
    'keel_night_fail': ('short gentle sad accordion phrase falling down, soft and sympathetic, not dramatic', 2.5),
    'keel_combo': ('two bright quick harbour bell dings in a row, cheerful, rewarding, short', 0.7),
    'keel_warn': ('a soft bell buoy clanging twice in warning, gentle tension, short', 0.8),
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
    'bgm_keel_lullaby': 'gentle cosy nocturne for a cute puzzle game about guiding little boats home with a lighthouse at night, '
                        'soft accordion and harp, warm celesta melody, light brushed percussion, calm and magical seaside lullaby, '
                        'medium-slow tempo, seamless loop, no vocals',
    'bgm_keel_squall': 'playful adventurous sea shanty instrumental for a cosy lighthouse game during a stormy night, fiddle and accordion, '
                       'pizzicato strings, low tom drums, a bit urgent but still warm and friendly, medium tempo, seamless loop, no vocals',
}

VOICE = {}

VISUALS = {}

VIDEOS = {}

COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py brightkeel

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
