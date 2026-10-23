#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/whirlworks/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/whirlworks/bake_assets.py           bake everything into ./assets/

Whirlworks draws its workshop, lathe-turned tops and toy blocks procedurally (one warm toy-diorama look), so only
sound and music are baked. Most clash/launch sounds come from Whirlbash."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Whirlworks'
STYLE = 'warm toy workshop diorama, lathe-turned painted wooden spinning tops, honey wood, brass, soft lamp light'

REUSE = [
    'audio/whirl_clash.mp3', 'audio/whirl_clash_heavy.mp3', 'audio/whirl_launch.mp3', 'audio/whirl_topple.mp3',
    'audio/whirl_confetti.mp3', 'audio/whirl_cheer.mp3', 'audio/whirl_perfect.mp3', 'audio/whirl_dash.mp3',
    'audio/coin.mp3', 'audio/coin_fling.mp3', 'audio/siege_merge.mp3', 'audio/upgrade.mp3', 'audio/unlock.mp3',
    'audio/level_up.mp3', 'audio/victory.mp3', 'audio/frenzy.mp3',
    'audio/card_pick.mp3', 'audio/portal.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: everything on screen is procedural

SFX = {
    'works_block_crack': ('a small wooden toy block cracking apart, bright woody knock and splinter, playful, very short', 0.5),
    'works_great_block': ('a big wooden treasure block bursting open, chunky wood crack, coins spilling out and a happy sparkle', 1.8),
    'works_coin_jar': ('a handful of coins dropping into a glass jar, bright cheerful jingle, short', 0.7),
    'works_whip': ('a quick string whip snapping a spinning wooden top, light crack and a rising whirr, short', 0.5),
    'works_register': ('an old brass cash register ringing open with a cheerful bell, toy shop, short', 1.0),
    'works_fanfare': ('a short toy band fanfare with tin trumpets and a drum roll, joyful tournament victory', 2.6),
}

MUSIC = {
    'bgm_works_bench': 'cozy upbeat toy workshop music, plucked pizzicato strings, marimba, glockenspiel and light '
                       'brushed drums, warm and cheerful, ticking clock feel, relaxing idle game, seamless loop, no vocals',
    'bgm_works_clock': 'playful clockwork music box waltz turned groovy, celesta, bassoon, upright bass and soft shaker, '
                       'whimsical and bright, steady tempo, seamless loop, no vocals',
}

VOICE = {}
VISUALS = {}
VIDEOS = {}
COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py whirlworks

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
