#!/bin/bash
# Compress every GLB in public/assets/models into public/assets/models/opt (meshopt geometry + 1024px WebP textures, ~10x smaller).
# Originals are kept. Needs Node with @gltf-transform/cli (npx installs it on first use). The game loads opt/ first, then models/.
set -e
cd "$(dirname "$0")/../public/assets/models"
mkdir -p opt
for f in *.glb; do
  [ -f "opt/$f" ] && [ "opt/$f" -nt "$f" ] && continue
  npx --yes @gltf-transform/cli@4.1.1 optimize "$f" "opt/$f" --compress meshopt --texture-compress webp --texture-size 1024 >/dev/null && echo "optimized $f"
done
# list of available model files so the game never requests missing candidates (avoids 404s in the console)
cd .. && python3 -c "import os,json; json.dump(sorted([f'models/{f}' for f in os.listdir('models') if f.endswith('.glb')]+[f'models/opt/{f}' for f in os.listdir('models/opt') if f.endswith('.glb')]), open('models/index.json','w'))" && echo "wrote models/index.json"
