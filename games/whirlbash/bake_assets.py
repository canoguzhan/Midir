#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/whirlbash/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/whirlbash/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/whirlbash/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>

Whirlbash draws every top, the arena and the UI icons procedurally in Three.js / SVG, so the whole game shares one
glossy toy-plastic look and needs no 3D models. Covers are rendered from the game itself (tools/game_covers.py)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Whirlbash'
STYLE = ''  # no generated visuals: the look is procedural

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'fonts/lilita-one-latin-400-normal.woff2', 'fonts/lilita-one-latin-ext-400-normal.woff2',  # bundled OFL fonts used by style.css
    'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-ext-800-normal.woff2',
    'audio/dash_gem.mp3',   # spark pickup tink
    'audio/ui_click.mp3', 'audio/upgrade.mp3', 'audio/unlock.mp3', 'audio/defeat.mp3', 'audio/countdown.mp3',
    # power-ups: blast, shield, magnet, turbo, pick up, lost
    'audio/skill_slam.mp3', 'audio/skill_heal.mp3', 'audio/portal.mp3', 'audio/frenzy.mp3', 'audio/gate_good.mp3', 'audio/gate_bad.mp3',
    # 1.3: level up, victory (Last Top Spinning), mission complete, decoy pop
    'audio/level_up.mp3', 'audio/victory.mp3', 'audio/quest_complete.mp3', 'audio/pop.mp3',
]

MODELS = []

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'whirl_clash': ('two hard plastic spinning battle tops colliding, sharp bright metallic clang with a crackle of sparks, short, punchy', 0.8),
    'whirl_clash_heavy': ('heavy spinning tops slamming together, deep metallic crunch and ringing clang with sparks, powerful impact', 1.2),
    'whirl_dash': ('spinning top surging forward, rising high-pitched whirr and air whoosh, fast', 0.7),
    'whirl_ringout': ('cartoon falling whoosh as a spinning top drops into a deep pit, descending whistle then a distant thud', 1.5),
    'whirl_topple': ('spinning top wobbling, losing speed and clattering to a stop on a smooth plastic floor', 1.5),
    'whirl_hum': ('steady smooth high-pitched whirring hum of a fast spinning top on a plastic arena, constant, seamless loop, no attack', 3),
    'whirl_launch': ('spinning top launched onto a plastic stadium floor, quick zipping whirr and a crisp landing click', 1.0),
    'whirl_cheer': ('small excited arena crowd cheering and clapping, short burst', 2.0),
    'whirl_event': ('stadium event alarm, two bright synth horn blasts, energetic, game show', 1.2),
    'whirl_wall': ('spinning top bouncing off a rubber bumper wall, springy plastic thunk', 0.5),
    'whirl_champion': ('stadium arrival of a giant champion: two deep booming synth horn blasts over a rising heavy mechanical whirr and an excited crowd roar', 2.5),
    'whirl_perfect': ('perfectly timed hit in an arcade game: crisp bright metallic ding with a sparkly electric zap, satisfying, short', 0.7),
    'whirl_anchor': ('heavy metal clamp locking onto a floor, deep clunk with a short chain rattle and low hum, toy-like', 0.9),
    'whirl_shutter': ('mechanical arena trapdoor sliding, quick motorized whirr ending in a solid clack', 1.0),
    'whirl_zone': ('electric force field closing in, low buzzing warning pulse with a rising tone, arcade', 1.2),
    'whirl_pull': ('giant magnet powering up, deep wobbling electromagnetic hum swelling and pulling, arcade sci-fi, toy-like', 2.2),
    'whirl_confetti': ('festive confetti cannon pop followed by a short sparkly shower and a tiny crowd cheer', 1.5),
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
    'bgm_whirl_showdown': 'tense driving electronic showdown music for the final duel in a spinning-top arena game, pulsing synth bass, big drums, rising arpeggios, 140 bpm, no vocals, seamless loop',
    'bgm_whirl_funk': 'funky upbeat disco-house arcade battle music for a spinning-top arena game, slap bass, wah guitar, bright brass stabs, 124 bpm, no vocals, seamless loop',
    'bgm_whirl_chip': 'bouncy chiptune pop battle music with modern punchy drums, playful square-wave leads, energetic and cheerful, 132 bpm, no vocals, seamless loop',
    'bgm_whirl_breaks': 'high-energy breakbeat electronic arena music, rolling drums, rubbery bass, sparkly synth arpeggios, stadium energy, 140 bpm, no vocals, seamless loop',
    'bgm_whirl_showdown2': 'intense electronic boss battle music, pounding drums, heavy synth bass, rising synth strings and brass hits, 145 bpm, no vocals, seamless loop',
    'bgm_whirl_menu': 'relaxed groovy lounge electronic music for a colourful game menu, mellow electric piano, soft drums, warm bass, 100 bpm, no vocals, seamless loop',
    'bgm_whirl_arena': 'energetic upbeat electronic arcade battle music for a spinning-top arena game, punchy drums, bouncy synth bass, bright synth leads, 128 bpm, no vocals, seamless loop',
}

AN = dict(stability=0.32, style=0.55)  # livelier, less flat delivery than the defaults
VOICE = {  # ElevenLabs TTS: three announcers per line (different voices and wording), picked at random in game
    'wb3_go_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Three... two... one... SPIN!', tr='Üç... iki... bir... DÖN!'),
    'wb3_go_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Ready? Three, two, one, let it rip!', tr='Hazır mısın? Üç, iki, bir, bırak gitsin!'),
    'wb3_go_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Alright, tops! Three, two, one... spin!', tr='Haydi bakalım! Üç, iki, bir... dön!'),
    'wb3_ringout_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Ring out!', tr='Pist dışı!'),
    'wb3_ringout_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Out of the ring!', tr='Çukura gitti!'),
    'wb3_ringout_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en="And it's gone! Ring out!", tr='Ve gitti! Pist dışı!'),
    'wb3_topple_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Toppled!', tr='Devrildi!'),
    'wb3_topple_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Down it goes!', tr='Yere serildi!'),
    'wb3_topple_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Spun out!', tr='Dönüşü bitti!'),
    'wb3_leader_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='New leader!', tr='Yeni lider!'),
    'wb3_leader_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en="We've got a new number one!", tr='Yeni bir bir numaramız var!'),
    'wb3_leader_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Top of the board!', tr='Zirvede!'),
    'wb3_storm_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Spark storm!', tr='Kıvılcım fırtınası!'),
    'wb3_storm_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en="It's raining sparks!", tr='Kıvılcım yağıyor!'),
    'wb3_storm_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Spark storm incoming!', tr='Kıvılcım fırtınası geliyor!'),
    'wb3_tilt_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Arena tilt!', tr='Arena eğiliyor!'),
    'wb3_tilt_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en="Hold on, the arena's tilting!", tr='Sıkı tutun, arena eğiliyor!'),
    'wb3_tilt_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en="Everything's sliding!", tr='Her şey kayıyor!'),
    'wb3_overdrive_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Overdrive!', tr='Aşırı hız!'),
    'wb3_overdrive_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Maximum speed!', tr='Tam gaz!'),
    'wb3_overdrive_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Overdrive! Everybody faster!', tr='Aşırı hız! Herkes daha hızlı!'),
    'wb3_champion_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='The Champion has entered the arena!', tr='Şampiyon arenaya çıktı!'),
    'wb3_champion_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Uh oh... here comes the Champion!', tr='Eyvah... Şampiyon geliyor!'),
    'wb3_champion_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Make way for the Champion!', tr='Yol açın, Şampiyon geliyor!'),
    'wb3_champdown_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Champion down!', tr='Şampiyon düştü!'),
    'wb3_champdown_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='The Champion falls!', tr='Şampiyon yere serildi!'),
    'wb3_champdown_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='What a takedown!', tr='Ne nakavt ama!'),
    'wb3_magnetar_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='The Magnetar has entered the arena!', tr='Manyetar arenaya çıktı!'),
    'wb3_magnetar_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Watch out, the Magnetar pulls you in!', tr='Dikkat, Manyetar seni çekiyor!'),
    'wb3_magnetar_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Here comes the Magnetar!', tr='Manyetar geliyor!'),
    'wb3_perfect_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Perfect!', tr='Mükemmel!'),
    'wb3_perfect_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Perfect hit!', tr='Mükemmel vuruş!'),
    'wb3_perfect_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Ooh, perfect!', tr='Oha, mükemmel!'),
    'wb3_lasttop_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Last Top Spinning!', tr='Son Dönen Topaç!'),
    'wb3_lasttop_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Last top standing wins!', tr='Ayakta kalan son topaç kazanır!'),
    'wb3_lasttop_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='No respawns. Last top spinning!', tr='Geri dönüş yok. Son dönen topaç!'),
    'wb3_victory_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Victory! You are the last top spinning!', tr='Zafer! Son dönen topaç sensin!'),
    'wb3_victory_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='You did it! Last one spinning!', tr='Başardın! Son dönen sensin!'),
    'wb3_victory_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='And the winner is... you!', tr='Ve kazanan... sensin!'),
    'wb3_levelup_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Level up!', tr='Seviye atladın!'),
    'wb3_levelup_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='You levelled up!', tr='Bir seviye yükseldin!'),
    'wb3_levelup_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='New level!', tr='Yeni seviye!'),
    'wb3_teamwin_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Your team wins!', tr='Takımın kazandı!'),
    'wb3_teamwin_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Team victory!', tr='Takım zaferi!'),
    'wb3_teamwin_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en="That's a win for your team!", tr='Bu galibiyet takımının!'),
    'wb3_teams_1': dict(speaker='IKne3meq5aSn9XLyUdCD', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Team battle!', tr='Takım savaşı!'),
    'wb3_teams_2': dict(speaker='FGY2WhTYpPnrIDTdsKH5', speaker_tr='xyqF3vGMQlPk3e7yA4DI', settings=AN, en='Blue versus Red!', tr='Mavi, kırmızıya karşı!'),
    'wb3_teams_3': dict(speaker='N2lVS1w4EtoT3dr4eOWO', speaker_tr='xgYIZvUB5h2eFY3HUFNj', settings=AN, en='Teams, get ready!', tr='Takımlar, hazır olun!'),
}

VISUALS = {}
VIDEOS = {}

COVERS = None  # rendered from the game: python3 tools/game_covers.py whirlbash

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
