#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/{{SLUG}}/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/{{SLUG}}/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/{{SLUG}}/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = '{{TITLE}}'
STYLE = 'stylized low-poly game asset, bright saturated colors, clean readable silhouette'  # appended to model + visual prompts

REUSE = [  # library files shipped as-is (paths as in tools/catalog.py output, without the assets/ prefix)
    'models/hero_warrior@idle.glb', 'models/hero_warrior@run.glb',
    'models/prop_rock.glb', 'models/prop_tree.glb',
    'audio/coin.mp3', 'audio/hit.mp3', 'audio/skill_dash.mp3', 'audio/defeat.mp3', 'audio/ui_click.mp3', 'audio/bgm_field.mp3',
    'visuals/icon_coin.webp',
]

MODELS = [  # Tripo3D: dict(name, prompt, rig=None|'biped'|'quadruped', anims=['idle', 'walk', 'run'], faces=6000)
]

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
}

MUSIC = {  # ElevenLabs music: name: prompt  (start names with bgm_)
}

VOICE = {  # ElevenLabs TTS: name: dict(speaker='narrator'|'male'|'female'|'deep'|<voice id>, en='...', tr='...')
}

VISUALS = {  # Higgsfield stills: name: (prompt, aspect '1:1'|'16:9'|..., max_px)
}

VIDEOS = {  # Higgsfield image-to-video loops/cutscenes: name: (still prompt, motion prompt, seconds)
}

COVERS = None  # key-art prompt for the 3 CrazyGames covers (1920x1080, 800x1200, 800x800) -> ./covers/, title drawn on top

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
