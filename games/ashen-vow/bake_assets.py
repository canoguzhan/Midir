#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/ashen-vow/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/ashen-vow/bake_assets.py           bake everything into ./assets/

Ashen Vow draws every character, enemy and room procedurally (one chunky low-poly gothic look, animated in code), so
only sound and music are baked."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Ashen Vow'
STYLE = 'chunky low-poly gothic diorama, moonlit blue stone, glowing orange embers, dark fantasy but not gory'

REUSE = [
    'audio/sword_swing.mp3', 'audio/hit.mp3', 'audio/skill_slam.mp3', 'audio/skill_fire.mp3', 'audio/explosion.mp3', 'audio/shock.mp3',
    'audio/level_up.mp3', 'audio/coin.mp3', 'audio/victory.mp3', 'audio/defeat.mp3', 'audio/card_pick.mp3', 'audio/dash_boss_horn.mp3',
    'audio/skill_dash.mp3', 'audio/golem_roar.mp3', 'audio/skill_heal.mp3', 'audio/unlock.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: everything on screen is procedural

SFX = {
    'vow_swear': ('a solemn deep cathedral bell toll with a short magical shimmer, an oath being sworn, dark fantasy', 2.2),
    'vow_kept': ('a vow fulfilled: warm rising choir chord with bright sparkling chimes, triumphant but short', 2.0),
    'vow_broken': ('a magical oath breaking: glass cracking and a low descending whoosh, disappointing but not harsh', 1.4),
    'ember_pick': ('tiny glowing ember collected, soft crackle with a bright little chime, very short', 0.4),
    'enemy_dissolve': ('a dark creature dissolving into embers and ash, soft fiery crackle and airy whoosh, short', 0.8),
    'door_open': ('heavy ancient stone door grinding open in a cathedral, deep rumble ending with a soft magical hum', 2.2),
    'dodge_roll': ('armored knight dodge rolling on stone, quick cloth whoosh and a light metal clink, short', 0.6),
    'spear_thrust': ('fast spear thrust, sharp air whoosh and a metallic zing, short', 0.5),
    'hammer_smash': ('heavy war hammer smashing stone floor, deep boom with cracking rocks, punchy', 1.0),
    'boss_bell': ('giant cursed bell ringing three times in a vast dark cathedral, deep and ominous, reverberating', 3.5),
    'relic_get': ('ancient relic picked up, mystical glowing hum swelling into a crystal chime, rewarding', 1.4),
    'player_hurt': ('armored knight grunting as he is hit, short metal clang, not gory', 0.5),
}

MUSIC = {
    'bgm_ashen_tower': 'dark fantasy action music for a gothic cathedral dungeon crawler, driving war drums, low strings ostinato, '
                       'solemn choir pads, organ swells, heroic and tense, steady tempo, seamless loop, no vocals lyrics',
    'bgm_ashen_boss': 'epic dark fantasy boss battle music, pounding taiko and orchestral drums, aggressive brass and strings, '
                      'pipe organ and dramatic choir chants, intense and heroic, seamless loop, no vocals lyrics',
    'bgm_ashen_camp': 'calm melancholic campfire music at night under a ruined cathedral, soft solo cello and harp, '
                      'gentle crackling ambience feel, hopeful, slow, seamless loop, no vocals',
}

VOICE = {}
VISUALS = {}
VIDEOS = {}
COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py ashen-vow

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
