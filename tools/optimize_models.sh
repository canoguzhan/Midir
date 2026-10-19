#!/bin/bash
# Compress every GLB in library/models into library/models/opt (meshopt geometry + 1024px WebP textures, ~10x smaller).
# Originals are kept. Needs Node with @gltf-transform/cli (npx installs it on first use). factory.py ships the opt/ copy.
set -e
cd "$(dirname "$0")/../library/models"
mkdir -p opt
for f in *.glb; do
  [ -f "opt/$f" ] && [ "opt/$f" -nt "$f" ] && continue
  npx --yes @gltf-transform/cli@4.1.1 optimize "$f" "opt/$f" --compress meshopt --texture-compress webp --texture-size 1024 >/dev/null && echo "optimized $f"
done
