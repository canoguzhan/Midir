#!/usr/bin/env python3
"""Bake Tumblewool's assets offline (never at runtime). Everything on screen is procedural Three.js, so only sound
and music are baked.

  python3 games/tumblewool/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/tumblewool/bake_assets.py           bake everything into ./assets/
  python3 games/tumblewool/bake_assets.py audio     only one group: models | audio | visuals | covers

Covers are rendered in-engine: python3 tools/game_covers.py tumblewool"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Tumblewool'
STYLE = 'soft pastel low-poly floating farm island diorama, round fluffy sheep, warm light, cheerful and cosy'

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'audio/bloom_birds.mp3', 'audio/bloom_petal.mp3', 'audio/bloom_zone.mp3', 'audio/whirl_ringout.mp3',
    'audio/ui_click.mp3', 'audio/unlock.mp3', 'audio/whirl_confetti.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: sheep, barn, fences and islands are procedural

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'wool_baa_a': ('a cute fluffy lamb bleating once, short happy baa, soft and cartoonish, close, no background', 0.9),
    'wool_baa_b': ('a small cartoon sheep giving a surprised high-pitched baa, short and funny, close, no background', 0.8),
    'wool_barn': ('a fluffy sheep trotting into a wooden barn, soft hoof clops, a warm bright bell ding and a happy little chime', 1.2),
    'wool_bump': ('a soft woolly ball bumping into a wooden fence, muffled fluffy thump, gentle, very short', 0.4),
    'wool_bale': ('a heavy round hay bale thudding against a wooden post, dry rustly straw thump, short', 0.5),
    'wool_boing': ('a cartoon bouncy mushroom cap springing, rubbery boing, playful, short', 0.5),
    'wool_mud': ('squelchy mud splat under a small ball, wet and funny, short', 0.5),
    'wool_crack': ('thin ice cracking and breaking into a pond, crisp crackle then a small splash, short', 0.9),
    'wool_plate': ('a stone pressure plate clicking down, chunky wooden click and a soft magical hum', 0.6),
    'wool_fan': ('a small wooden pinwheel fan spinning and blowing a steady breeze, airy whirr, seamless loop', 3),
    'wool_roll_loop': ('soft fluffy wool rolling across short grass, gentle rustling, steady, seamless loop', 3),
    'wool_level_done': ('cheerful short farmyard fanfare: banjo strum, tin whistle melody rising, a happy sheep baa at the end', 3),
    'wool_star': ('a single bright magical star appearing with a sparkly twinkle chime, rewarding, short', 0.7),
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
    'bgm_wool_meadow': 'bouncy cheerful pastoral instrumental for a cute puzzle game about rolling fluffy sheep on a floating farm island, '
                       'plucky banjo and acoustic guitar, tin whistle melody, light woodblock and glockenspiel, playful and sunny, '
                       'medium tempo, seamless loop, no vocals',
    'bgm_wool_frost': 'cosy calm winter instrumental for a cute sheep puzzle game on frosty floating islands, soft celesta and music box, '
                      'pizzicato strings, gentle sleigh bells, warm and playful, medium-slow tempo, seamless loop, no vocals',
}

VOICE = {}

VISUALS = {}

VIDEOS = {}

COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py tumblewool

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
