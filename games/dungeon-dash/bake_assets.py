#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/dungeon-dash/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/dungeon-dash/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/dungeon-dash/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Dungeon Dash'
STYLE = 'stylized dark fantasy, hand-painted, readable'

HEROES = ['warrior', 'assassin', 'shaman', 'sura']
REUSE = [f'models/hero_{h}@{a}.glb' for h in HEROES for a in ('idle', 'run')] + [
    'models/mob_wolf@walk.glb', 'models/mob_golem@walk.glb', 'models/prop_rock.glb', 'models/prop_shrine.glb',
    'audio/sword_swing.mp3', 'audio/hit.mp3', 'audio/wolf_death.mp3', 'audio/golem_roar.mp3', 'audio/explosion.mp3', 'audio/skill_fire.mp3',
    'audio/skill_slam.mp3', 'audio/skill_heal.mp3', 'audio/skill_dash.mp3', 'audio/shock.mp3', 'audio/thunder.mp3', 'audio/level_up.mp3',
    'audio/coin.mp3', 'audio/victory.mp3', 'audio/defeat.mp3', 'audio/ui_click.mp3', 'audio/card_pick.mp3', 'audio/angry.mp3',
    'audio/bgm_battle.mp3', 'audio/bgm_overtime.mp3', 'audio/bgm_title.mp3',
    'visuals/icon_coin.webp', 'visuals/icon_gem.webp', 'visuals/icon_trophy.webp',
] + [f'visuals/class_{h}_card.webp' for h in HEROES] + [f'visuals/skill_{h}_{n}.webp' for h in HEROES for n in range(1, 5)]

MODELS = []  # all characters come from the library (Tripo credits are low)

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'dash_gem': ('tiny bright crystal shard pickup tink, magical, short', 0.4),
    'dash_card': ('magical card being drawn and revealed with a shimmering whoosh', 0.8),
    'dash_boss_horn': ('deep ominous dungeon war horn with rumbling stone, a boss approaches', 2.0),
}
MUSIC = {}  # bgm_battle (run), bgm_overtime (boss), bgm_title (menu)

VOICE = {
    'dash_boss': dict(speaker='deep', en='The Warden awakens!', tr='Gardiyan uyanıyor!'),
    'dash_survived': dict(speaker='deep', en='You survived the dungeon!', tr='Zindandan sağ çıktın!'),
}

VISUALS = {  # Higgsfield stills: name: (prompt, aspect, max_px)
    'dungeon_floor': ('seamless tileable top-down texture of old dark dungeon stone floor tiles with moss in the cracks and faint glowing blue rune '
                      'carvings, even lighting, no shadows, no perspective, flat orthographic view, game texture', '1:1', 1024),
}
VIDEOS = {}

COVERS = ('a lone fantasy hero with a glowing sword standing in the center of a torch-lit dungeon arena, surrounded by a huge horde of grey wolves '
          'and stone golems charging in from every side, magic orbs and lightning bursting around the hero, glowing blue crystals on the floor, '
          'epic dramatic lighting, stylized game key art')

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
