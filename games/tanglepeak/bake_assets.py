#!/usr/bin/env python3
"""Bake Tanglepeak's assets offline (never at runtime). Everything on screen is procedural Three.js (the cliff, holds,
ledges, campfires, the two climbers and their rope), so only sound, music and the narrator's voice are baked.

  python3 games/tanglepeak/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/tanglepeak/bake_assets.py           bake everything into ./assets/
  python3 games/tanglepeak/bake_assets.py audio     only one group: models | audio | visuals | covers

Covers are rendered in-engine: python3 tools/game_covers.py tanglepeak"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Tanglepeak'
STYLE = 'cosy low-poly flat-shaded mountain diorama, chunky stylized rocks, two cute chibi climbers in beanies tied by an orange rope, warm storybook light'

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'audio/bgm_bloom_meadow.mp3', 'audio/bgm_kite_day.mp3', 'audio/bgm_wool_frost.mp3', 'audio/bgm_kite_night.mp3',  # music by altitude
    'audio/kite_wind_loop.mp3', 'audio/bloom_birds.mp3', 'audio/bloom_rain_loop.mp3',  # ambience: wind, meadow birds, waterfall spray
    'audio/wool_crack.mp3', 'audio/keel_gust.mp3', 'audio/dp_ribbon.mp3', 'audio/bloom_petal.mp3', 'audio/kite_sky_done.mp3',
    'audio/unlock.mp3', 'audio/rune_tile_tap.mp3', 'audio/rune_tray_warn.mp3', 'audio/footstep.mp3', 'audio/whirl_anchor.mp3',
    'audio/wool_star.mp3', 'audio/swv_blocked.mp3', 'audio/keel_night_fail.mp3',
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
]

MODELS = []  # none: the mountain and the climbers are procedural (world.js)

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'tp_grab': ('a small cartoon climber grabbing a rock hold, quick chalky hand slap on stone with a tiny cute effort grunt, short', 0.6),
    'tp_slip': ('fingers slipping off a rock hold, quick gritty scrape and a small cute cartoon gasp, short', 0.8),
    'tp_crumble': ('a small sandstone rock hold crumbling apart, gritty crunch and little pebbles trickling down a cliff, short', 1.2),
    'tp_fall': ('a cartoon falling whistle sliding down in pitch, comedic and light, no impact at the end', 1.6),
    'tp_land': ('a small climber landing on a rocky ledge, soft thud with a little gravel crunch and a cute oof, short', 0.7),
    'tp_rope': ('a climbing rope snapping taut, quick creaky stretch of a thick rope with a soft thwump, short', 0.5),
    'tp_camp': ('a campfire catching light with a warm whoosh and crackle, then a soft friendly bell chime, cosy, short', 1.6),
}

MUSIC = {}  # four library tracks change with altitude (see REUSE)

V = dict(speaker='narrator', settings=dict(stability=0.45, style=0.35))  # Old Juniper, the mountain guide: warm and a little wry
VOICE = {
    'tp_vo_intro': dict(V, en='Two climbers, one rope, one very tall mountain. Up we go!', tr='İki tırmanıcı, bir ip, kocaman bir dağ. Hadi yukarı!'),
    'tp_vo_grab': dict(V, en="That's it. One holds on, the other swings.", tr='İşte böyle. Biri tutunur, öteki sallanır.'),
    'tp_vo_fall_s1': dict(V, en='Oops. Dust yourselves off.', tr='Hoppala. Üstünüzü silkeleyin.'),
    'tp_vo_fall_s2': dict(V, en='The mountain says hello.', tr='Dağ size merhaba diyor.'),
    'tp_vo_fall_s3': dict(V, en='Down is easy. Up is the fun part.', tr='Aşağı inmek kolay. Asıl eğlence yukarıda.'),
    'tp_vo_fall_b1': dict(V, en='Well... that was a long way down.', tr='Eh... epey uzun bir düşüştü.'),
    'tp_vo_fall_b2': dict(V, en="Deep breath. The summit isn't going anywhere.", tr='Derin bir nefes. Zirve bir yere kaçmıyor.'),
    'tp_vo_fall_b3': dict(V, en='Every great climber has fallen exactly like that.', tr='Her büyük tırmanıcı tam da böyle düşmüştür.'),
    'tp_vo_fall_h1': dict(V, en='Somebody clip that. Actually... maybe don\'t.', tr='Biri bunu kaydetsin. Yok, en iyisi kaydetmesin.'),
    'tp_vo_fall_h2': dict(V, en="Oh dear. I'll put the kettle on.", tr='Eyvah. Ben çaydanlığı ocağa koyayım.'),
    'tp_vo_catch': dict(V, en='What a catch!', tr='Ne yakalayış!'),
    'tp_vo_camp': dict(V, en='A warm campfire. Rest your fingers.', tr='Sıcak bir kamp ateşi. Parmaklarını dinlendir.'),
    'tp_vo_pines': dict(V, en="Sandy rocks crumble. Don't linger.", tr='Kumlu kayalar ufalanır. Oyalanma.'),
    'tp_vo_falls': dict(V, en='Wet moss is slippery. Keep moving.', tr='Islak yosun kaygandır. Durma, ilerle.'),
    'tp_vo_ridge': dict(V, en='Feel that wind? Hold on when the flags snap.', tr='Rüzgârı hissettin mi? Bayraklar çırpınınca sıkı tutun.'),
    'tp_vo_frost': dict(V, en='Ice steals your grip fast. Be quick!', tr='Buz tutuşunu çabuk çalar. Hızlı ol!'),
    'tp_vo_cable': dict(V, en='The old cable hooks still run. Time your grab.', tr='Eski kablo kancaları hâlâ çalışıyor. Zamanlamana dikkat.'),
    'tp_vo_crown': dict(V, en='The crown of the mountain. Almost there.', tr='Dağın tacı. Az kaldı.'),
    'tp_vo_summit': dict(V, en='You made it! Two climbers, one rope, one summit.', tr='Başardınız! İki tırmanıcı, bir ip, bir zirve.'),
    'tp_vo_back': dict(V, en="And we're back where we were!", tr='Ve kaldığımız yere döndük!'),
    'tp_vo_flower': dict(V, en='Edelweiss! A lucky find.', tr='Dağ çiçeği! Şanslı bir buluş.'),
    'tp_vo_tired': dict(V, en='Fingers are getting tired!', tr='Parmaklar yoruluyor!'),
}

VISUALS = {}

VIDEOS = {}

COVERS = None  # covers are rendered in-engine: python3 tools/game_covers.py tanglepeak

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
