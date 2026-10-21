#!/usr/bin/env python3
"""Report the anonymous play counters an online game server keeps (mp/data/<slug>-stats.json): no player identifiers, just sums per day.

  python3 tools/mp_stats.py whirlbash            last 14 days
  python3 tools/mp_stats.py whirlbash --days 60

Each finished run (solo or online) adds: mode, arena, length bucket, how it ended, tutorial done/skipped, power-ups used/lost,
Perfect hits, whether the device used the Fast graphics mode or touch."""
import json, os, sys, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('slug'); ap.add_argument('--days', type=int, default=14)
a = ap.parse_args()
path = os.path.join(os.environ.get('MP_DATA', os.path.join(ROOT, 'mp', 'data')), f'{a.slug}-stats.json')
if not os.path.exists(path): sys.exit(f'no stats yet: {path}')
days = json.load(open(path))['days']
keys = sorted(days)[-a.days:]
pct = lambda n, d: f'{100 * n / d:.0f}%' if d else '-'
print(f'{"day":<11}{"runs":>6}{"avg len":>9}{"<30s":>7}{"<1m":>6}{"<2m":>6}{"<5m":>6}{"5m+":>6}{"online":>8}{"touch":>7}{"fast gfx":>9}')
tot = {'runs': 0, 'time': 0}
for k in keys:
    d = days[k]; r = d['runs']; tot['runs'] += r; tot['time'] += d['time']
    print(f'{k:<11}{r:>6}{d["time"] / max(1, r):>8.0f}s' + ''.join(f'{pct(x, r):>{w}}' for x, w in zip(d['len'], (7, 6, 6, 6, 6))) + f'{pct(d["online"], r):>8}{pct(d.get("touch", 0), r):>7}{pct(d.get("gfxLow", 0), r):>9}')
def total(field):
    out = {}
    for k in keys:
        for name, n in days[k].get(field, {}).items(): out[name] = out.get(name, 0) + n
    return out
print(f'\n{tot["runs"]} runs, average {tot["time"] / max(1, tot["runs"]):.0f} s')
for field in ('mode', 'arena', 'how'):
    t = total(field); s = sum(t.values())
    print(f'{field:<6} ' + '  '.join(f'{name} {pct(n, s)}' for name, n in sorted(t.items(), key=lambda x: -x[1])))
tut = total('tut'); pu = total('pu')
print(f'tutorial: finished {tut.get("done", 0)}, skipped {tut.get("skipped", 0)} ({pct(tut.get("skipped", 0), tut.get("done", 0) + tut.get("skipped", 0))} skip)')
print(f'power-ups: used {pu.get("used", 0)}, lost unused {pu.get("lost", 0)} ({pct(pu.get("lost", 0), pu.get("used", 0) + pu.get("lost", 0))} wasted); Perfect hits per run {sum(days[k].get("perfect", 0) for k in keys) / max(1, tot["runs"]):.1f}')
ev = total('ev') # server-side happenings: rematches (Play again / Play now), live watchers, private matches started, daily challenge runs
if ev: print('online: ' + '  '.join(f'{name} {n}' for name, n in sorted(ev.items(), key=lambda x: -x[1])))
