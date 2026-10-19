#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/merge-siege-defense/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/merge-siege-defense/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/merge-siege-defense/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Merge Siege Defense'
STYLE = 'stylized high-fantasy game asset, hand-painted textures, readable silhouette'

REUSE = [  # library files shipped as-is
    # defenders (each tier reuses one of four heroes, tinted per tier)
    'models/hero_warrior@idle.glb', 'models/hero_warrior@slash.glb', 'models/hero_assassin@idle.glb', 'models/hero_assassin@slash.glb',
    'models/hero_shaman@idle.glb', 'models/hero_shaman@slash.glb', 'models/hero_sura@idle.glb', 'models/hero_sura@slash.glb',
    # enemies + world
    'models/mob_wolf@walk.glb', 'models/mob_golem@walk.glb', 'models/bld_king.glb', 'models/bld_tower.glb', 'models/bld_outpost.glb',
    'models/prop_tree.glb', 'models/prop_rock.glb',
    # audio
    'audio/sword_swing.mp3', 'audio/hit.mp3', 'audio/coin.mp3', 'audio/card_pick.mp3', 'audio/wolf_death.mp3',
    'audio/golem_roar.mp3', 'audio/tower_down.mp3', 'audio/thunder.mp3', 'audio/victory.mp3', 'audio/defeat.mp3', 'audio/ui_click.mp3',
    'audio/level_up.mp3', 'audio/explosion.mp3', 'audio/bgm_battle.mp3', 'audio/bgm_menu.mp3',
    # ui
    'visuals/icon_coin.webp', 'visuals/icon_gem.webp', 'visuals/icon_trophy.webp',
]

MODELS = []  # everything comes from the library (Tripo credits are low)

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'siege_merge': ('two magical warriors fusing into one, rising shimmering chime with a deep whoosh, satisfying power-up', 1.2),
    'siege_castle_hit': ('heavy impact against a stone castle gate, wood cracking, rumble', 1.0),
}

MUSIC = {}  # reusing bgm_battle (play) and bgm_menu (menus)

VOICE = {  # ElevenLabs TTS, announcer
    'siege_wave': dict(speaker='deep', en='Here they come!', tr='Geliyorlar!'),
    'siege_boss': dict(speaker='deep', en='A siege golem approaches!', tr='Bir kuşatma golemi yaklaşıyor!'),
    'siege_fallen': dict(speaker='deep', en='The castle has fallen.', tr='Kale düştü.'),
}

VISUALS = {}
VIDEOS = {}

COVERS = ('epic fantasy castle on a hill defended by glowing merged hero warriors of different colors, shields and blades raised, '
          'a horde of stone golems and grey wolves charging up the road, magic bolts flying, golden sunset, dramatic, '
          'stylized hand-painted game key art, vibrant colors')

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
