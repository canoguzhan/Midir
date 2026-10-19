#!/usr/bin/env python3
"""Bake this game's assets offline (never at runtime). Reuses the shared library first, generates only what is missing.

  python3 games/wolf-pack-run/bake_assets.py --dry     show what would be reused / generated (free)
  python3 games/wolf-pack-run/bake_assets.py           bake everything into ./assets/ (+ ./covers/ for the submission form)
  python3 games/wolf-pack-run/bake_assets.py audio     only one group: models | audio | visuals | covers

Keys: TRIPO_API_KEY, ELEVENLABS_API_KEY, HIGGSFIELD_API_KEY or HF_KEY (from the repo's .env or the environment).
Search the library before adding prompts: python3 tools/catalog.py search <words>"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
from factory import bake

TITLE = 'Wolf Pack Run'
STYLE = 'stylized fantasy, bright saturated colors, readable'

REUSE = [
    'models/mob_wolf@walk.glb', 'models/mob_golem@walk.glb', 'models/mob_golem@slash.glb', 'models/prop_tree.glb', 'models/prop_rock.glb',
    'audio/wolf_growl.mp3', 'audio/wolf_death.mp3', 'audio/golem_roar.mp3', 'audio/golem_step.mp3', 'audio/hit.mp3', 'audio/explosion.mp3',
    'audio/coin.mp3', 'audio/pop.mp3', 'audio/upgrade.mp3', 'audio/victory.mp3', 'audio/defeat.mp3', 'audio/ui_click.mp3', 'audio/bgm_menu.mp3',
    'visuals/icon_coin.webp',
]

MODELS = []  # the pack is the library wolf, baked into instanced animation frames at load time

SFX = {  # ElevenLabs sound generation: name: (prompt, seconds)
    'pack_howl': ('a pack of wolves howling together, rousing, outdoors, short', 2.2),
    'gate_good': ('bright magical whoosh and rising chime, positive power-up', 0.8),
    'gate_bad': ('descending sad whoosh with a soft thud, negative', 0.8),
    'saw_whoosh': ('heavy spinning blade whooshing past, metallic', 0.8),
}
MUSIC = {
    'bgm_wolf_run': 'Energetic upbeat folk-rock chase music, driving drums, fiddle and electric guitar, adventurous and fun, seamless loop for a runner game',
}
VOICE = {}
VISUALS = {}
VIDEOS = {}

COVERS = ('a huge pack of grey wolves stampeding down a forest road toward the camera, glowing blue x2 and +10 magic gates over the road, '
          'a giant stone golem waiting at the end of the road, dust and sunlight, dynamic perspective, stylized game key art, vibrant colors')

if __name__ == '__main__':
    bake(__file__, style=STYLE, reuse=REUSE, three=True, models=MODELS, sfx=SFX, music=MUSIC, voice=VOICE,
         visuals=VISUALS, videos=VIDEOS, covers=COVERS, title=TITLE)
