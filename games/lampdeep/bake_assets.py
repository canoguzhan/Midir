#!/usr/bin/env python3
"""Bake Lampdeep's assets offline (never at runtime). Everything on screen is procedural Three.js (the floating stone floors,
pillars, braziers, the lamplighter and the shadows), so only sound, music and the Keeper's voice are baked.

  python3 games/lampdeep/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/lampdeep/bake_assets.py           bake everything into ./assets/
  python3 games/lampdeep/bake_assets.py audio     only one group: models | audio | visuals | covers

Covers are rendered in-engine: python3 tools/game_covers.py lampdeep"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Lampdeep'
STYLE = 'cosy dark storybook diorama, flat-shaded low-poly stone floors floating in velvet darkness, warm amber lantern light, ink-black shadow creatures with glowing eyes'

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'audio/bgm_bloom_dusk.mp3', 'audio/bgm_kite_night.mp3', 'audio/bgm_ashen_camp.mp3', 'audio/bgm_ashen_tower.mp3',  # music by depth
    'audio/bgm_ashen_boss.mp3',  # boss floors
    'audio/footstep.mp3', 'audio/club.mp3', 'audio/hit.mp3', 'audio/wool_bale.mp3', 'audio/whirl_ringout.mp3', 'audio/enemy_dissolve.mp3',
    'audio/ember_pick.mp3', 'audio/kite_lantern.mp3', 'audio/dodge_roll.mp3', 'audio/tp_camp.mp3', 'audio/potion_pour.mp3',
    'audio/door_open.mp3', 'audio/relic_get.mp3', 'audio/boss_bell.mp3', 'audio/vow_kept.mp3', 'audio/explosion.mp3',
    'audio/spear_thrust.mp3', 'audio/saw_whoosh.mp3', 'audio/sword_swing.mp3', 'audio/rune_tray_warn.mp3', 'audio/dp_tick.mp3',
    'audio/vow_broken.mp3', 'audio/keel_night_fail.mp3', 'audio/victory.mp3', 'audio/wool_plate.mp3', 'audio/tp_crumble.mp3',
    'audio/kite_ring.mp3', 'audio/bloom_season.mp3', 'audio/swv_blocked.mp3', 'audio/ui_click.mp3', 'audio/keel_lit.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: floors, props, the lamplighter and every shadow are procedural (game.js)

SFX = {}  # the library already has every sound this game needs (see REUSE)

MUSIC = {}  # five library tracks change with depth (see REUSE)

V = dict(speaker='narrator', settings=dict(stability=0.5, style=0.3))  # the Keeper: an old lamplighter, warm and a little wry
VOICE = {
    'ld_vo_intro': dict(V, en='Forty floors down, one little lamp. Mind the dark.', tr='Kırk kat aşağı, tek bir küçük fener. Karanlığa dikkat.'),
    'ld_vo_queen': dict(V, en='The Moth Queen. She loves a bright lamp.', tr='Güve Kraliçesi. Parlak fenerlere bayılır.'),
    'ld_vo_soot': dict(V, en='Old Soot. Mind his pods.', tr='Yaşlı İs. Tohumlarına dikkat.'),
    'ld_vo_king': dict(V, en='The Gloom King. Keep him in your light.', tr='Kasvet Kralı. Onu ışığında tut.'),
    'ld_vo_dark': dict(V, en='The Last Dark. Everything you learned, now.', tr='Son Karanlık. Öğrendiğin her şey, şimdi.'),
    'ld_vo_boss': dict(V, en='Ha! The dark is a little smaller now.', tr='Ha! Karanlık artık biraz daha küçük.'),
    'ld_vo_shrine': dict(V, en='A shrine. Take what helps you most.', tr='Bir sunak. En çok işine yarayanı al.'),
    'ld_vo_low': dict(V, en='Your lamp is flickering. Find oil.', tr='Fenerin titriyor. Yağ bul.'),
    'ld_vo_creep': dict(V, en='The dark is creeping in. Keep moving.', tr='Karanlık yaklaşıyor. İlerle.'),
    'ld_vo_out1': dict(V, en='Your lamp went out. Light it again.', tr='Fenerin söndü. Yeniden yak.'),
    'ld_vo_out2': dict(V, en='Every lamplighter falls once or twice.', tr='Her fenerci bir iki kez düşer.'),
    'ld_vo_pit': dict(V, en='Into the pit with you!', tr='Doğru çukura!'),
    'ld_vo_win': dict(V, en='You reached the Heart, and lit it. Well done, lamplighter.', tr='Kalbe ulaştın ve onu yaktın. Aferin, fenerci.'),
}

VISUALS = {}

VIDEOS = {}

COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py lampdeep

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
