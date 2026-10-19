#!/usr/bin/env python3
"""Show remaining AI-service credits: python3 tools/balance.py"""
import factory

for label, fn in (('Tripo3D credits', factory.tripo_balance), ('ElevenLabs characters', factory.eleven_balance)):
    try: print(f'{label}: {fn()}')
    except Exception as e: print(f'{label}: unavailable ({e})')
print('Higgsfield: no balance endpoint; check https://cloud.higgsfield.ai')
