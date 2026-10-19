#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/rune-mahjong-3d/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/rune-mahjong-3d/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/rune-mahjong-3d/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Rune Mahjong 3D'
STYLE = 'stylized fantasy, rich saturated colors, soft magical lighting'

FACES = [  # tile faces: 30 clearly different fantasy icons from the library (no look-alike swords or potions)
    'icon_coin', 'icon_elixir', 'icon_gem', 'icon_gold', 'icon_potion_hp', 'icon_trophy', 'item_blade', 'item_cursedblade',
    'item_dragonplate', 'item_dragonsword', 'item_goldbracelet', 'item_jadefan', 'item_jaderobe', 'item_knighthelm',
    'item_leatherboots', 'item_phoenixbell', 'item_potion_hp', 'item_potion_mp', 'item_rubynecklace', 'item_sapphireearrings',
    'item_soulreaver', 'item_tome', 'item_towershield', 'item_viperblade', 'skill_assassin_3', 'skill_shaman_1', 'skill_shaman_2',
    'skill_shaman_4', 'skill_sura_2', 'skill_warrior_4',
]
REUSE = [f'visuals/{f}.webp' for f in FACES] + [
    'audio/card_pick.mp3', 'audio/stack_drop.mp3', 'audio/coin.mp3', 'audio/level_up.mp3', 'audio/victory.mp3', 'audio/defeat.mp3',
    'audio/ui_click.mp3', 'audio/portal.mp3', 'audio/potion.mp3', 'audio/bgm_sanctuary.mp3', 'audio/bgm_menu.mp3',
]

MODELS = []  # tiles are procedural 3D (rounded stone slabs with icon faces)

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'rune_tile_tap': ('light satisfying click of a polished stone mahjong tile being picked up, crisp', 0.5),
    'rune_match': ('three magical runes clearing with a bright sparkling chime and soft whoosh, rewarding', 1.0),
    'rune_tray_warn': ('soft low warning chime, gentle tension, magical', 0.8),
}
MUSIC = {}  # reusing bgm_sanctuary (play) and bgm_menu (menus)

VOICE = {  # combo callouts
    'rune_great': dict(speaker='female', en='Great!', tr='Harika!'),
    'rune_excellent': dict(speaker='female', en='Excellent!', tr='Mükemmel!'),
    'rune_legendary': dict(speaker='female', en='Legendary!', tr='Efsanevi!'),
}

VISUALS = {  # Higgsfield stills: name: (prompt, aspect, max_px)
    'rune_table_bg': ('top-down view of an ancient mystical wooden table with faint glowing blue runes carved around the edges, '
                      'candles and soft magical haze at the corners, empty center, dark vignette, no text, no objects in the middle', '16:9', 1920),
}
VIDEOS = {}

COVERS = ('ornate glowing jade and ivory mahjong tiles stacked in a magical pyramid on an ancient rune-carved table, tiles show fantasy '
          'icons like a sword, crown, gem and potion, sparkles and blue runic light rising, cozy mystical atmosphere, stylized game key art')

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
