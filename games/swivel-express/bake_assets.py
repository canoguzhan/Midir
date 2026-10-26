#!/usr/bin/env python3
"""Bake Swivel Express's assets offline (never at runtime). Everything on screen is procedural Three.js (tiles, track,
tin train, peg passengers, stations, cows, spinning tops, table toys), so only sound and music are baked.

  python3 games/swivel-express/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/swivel-express/bake_assets.py           bake everything into ./assets/
  python3 games/swivel-express/bake_assets.py audio     only one group: models | audio | visuals | covers

Covers are rendered in-engine: python3 tools/game_covers.py swivel-express"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Swivel Express'
STYLE = 'cosy low-poly wooden and tin toy railway on a playroom table, flat shading, bright painted toy colours, soft warm daylight'

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'audio/works_fanfare.mp3', 'audio/works_coin_jar.mp3', 'audio/works_block_crack.mp3', 'audio/wool_star.mp3',
    'audio/unlock.mp3', 'audio/keel_combo.mp3', 'audio/whirl_dash.mp3', 'audio/rune_tile_tap.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: the whole railway is procedural (props.js)

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'swv_chug_loop': ('a small wind-up tin toy train running on a wooden toy railway, soft rhythmic clockwork ticking and gentle '
                      'clickety-clack of little wheels over track joints, cosy, steady tempo, seamless loop', 4),
    'swv_whistle': ('a cute little toy steam train whistle, one short cheerful high toot, tin toy, playful, not loud', 0.9),
    'swv_turn': ('a chunky wooden toy railway tile being turned by hand, satisfying wooden click-clack swivel, short and crisp', 0.4),
    'swv_blocked': ('a dull soft wooden thunk, a toy piece that will not move, short muted denied knock', 0.3),
    'swv_board': ('tiny wooden toy figures hopping into a toy train carriage, cute quick pop pop and a soft wooden tap', 0.6),
    'swv_deliver': ('a little toy railway station bell ringing ding-ding brightly, with a tiny cheerful cartoon cheer of toy people, short', 1.3),
    'swv_derail': ('a small tin toy train tipping over off its wooden track, cartoon metal clatter and rattling wheels, '
                   'a light wooden bump, funny not harsh, short', 1.4),
    'swv_moo': ('a cute cartoon toy cow giving one short friendly moo, soft and funny, close', 1.1),
    'swv_tunnel': ('a toy train rolling into a little tunnel, soft hollow echoing whoosh, short', 0.9),
    'swv_brake': ('a small toy train braking, soft squeaky tin brake squeal and a little steam hiss, gentle, short', 0.9),
    'swv_grumble': ('a few tiny cartoon toy people grumbling impatiently, cute muffled murmuring, not words, short', 1.2),
    'swv_warn': ('a toy railway crossing bell, two quick bright dings of warning, gentle tension, short', 0.6),
    'swv_fail': ('a short gentle sad toy music box phrase falling down, soft and sympathetic, not dramatic', 2.2),
    'swv_room_loop': ('a calm sunny playroom ambience indoors, very soft distant birdsong through an open window, quiet and cosy, '
                      'no voices, no music, seamless loop', 6),
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
    'bgm_swivel_line': 'cheerful cosy instrumental for a cute toy train puzzle game on a playroom table, bouncy ukulele and glockenspiel, '
                       'marimba, light brushed snare with a gentle train-like shuffle rhythm, warm and playful, medium tempo, '
                       'seamless loop, no vocals',
    'bgm_swivel_sunset': 'warm mellow instrumental for a cosy toy railway game at golden sunset, soft acoustic guitar and music box, '
                         'gentle accordion, light shuffle percussion like a little train, relaxed but lively, medium tempo, '
                         'seamless loop, no vocals',
}

VOICE = {}

VISUALS = {}

VIDEOS = {}

COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py swivel-express

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
