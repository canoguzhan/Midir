#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/potion-sort-3d/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/potion-sort-3d/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/potion-sort-3d/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Potion Sort 3D'
STYLE = 'stylized fantasy, warm candlelight, rich saturated colors'

REUSE = [
    'audio/brew.mp3', 'audio/potion.mp3', 'audio/pop.mp3', 'audio/coin.mp3', 'audio/level_up.mp3', 'audio/victory.mp3',
    'audio/ui_click.mp3', 'audio/card_pick.mp3', 'audio/portal.mp3', 'audio/bgm_menu.mp3',
    'audio/voice/rune_great_en.mp3', 'audio/voice/rune_great_tr.mp3', 'audio/voice/rune_excellent_en.mp3', 'audio/voice/rune_excellent_tr.mp3',
    'visuals/icon_coin.webp',
]

MODELS = []  # flasks and liquids are procedural 3D

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'potion_pour': ('short glugging pour of thick magical liquid from a glass flask into another, bubbly, satisfying', 1.0),
    'potion_cork': ('cork popping into a glass bottle with a tiny magical sparkle', 0.5),
    'potion_complete': ('bright magical chime as a potion bottle fills with a single color, shimmering sparkle, rewarding', 1.2),
}
MUSIC = {
    'bgm_alchemy': 'Cozy relaxing fantasy alchemy shop music, gentle harp, soft celesta, light pizzicato strings and warm pads, calm puzzle game loop',
}
VOICE = {}

VISUALS = {  # Higgsfield stills: name: (prompt, aspect, max_px)
    'alchemy_lab_bg': ('cozy fantasy alchemist workshop interior, wooden shelves with glowing colorful potion bottles softly out of focus, '
                       'warm candlelight, stone wall, magical dust particles, shallow depth of field, empty wooden counter in the foreground center, no text', '16:9', 1920),
}
VIDEOS = {}

COVERS = ('rows of beautiful glass potion flasks filled with stacked layers of glowing colorful liquids being sorted, one flask pouring a '
          'bright stream into another, magical sparkles, cozy alchemist workshop with candlelight, stylized game key art, vibrant colors')

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
