// Asset layer: reads /assets/manifest.json, loads Tripo3D GLBs (base mesh + per-clip animation files),
// textures/icons, audio and video URLs, reports progress, and never throws — missing assets resolve to null
// so the engine keeps its procedural fallbacks.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export class AssetManager {
  constructor(base = 'assets/') {
    this.base = base; this.manifest = null; this.models = {}; this.textures = {};
    this.loader = new GLTFLoader(); this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.texLoader = new THREE.TextureLoader(); this.total = 0; this.done = 0; this.onProgress = () => {};
  }
  async loadManifest() {
    try { this.manifest = await (await fetch(this.base + 'manifest.json', { cache: 'no-cache' })).json(); }
    catch { this.manifest = { models: {}, audio: {}, voice: {}, music: {}, video: {}, icons: {} }; }
    try { this.available = new Set(await (await fetch(this.base + 'models/index.json', { cache: 'no-cache' })).json()); } catch { this.available = null; } // skip probing files that don't exist
    return this.manifest;
  }
  url(rel) { return rel ? this.base + rel : null; }
  icon(id) { return this.url(this.manifest.icons?.[id]); }
  track(p) { this.total++; this.onProgress(this.done / this.total); return p.finally(() => { this.done++; this.onProgress(this.done / this.total); }); }

  // ---- models
  async tryGLB(path) {
    if (this.available && !this.available.has(path)) return null;
    try { return await this.loader.loadAsync(this.base + path); } catch { return null; }
  }
  model(id) {
    const def = this.manifest.models?.[id]; if (!def) return Promise.resolve(null);
    return (this.models[id] ??= this.track((async () => {
      const anims = def.anims || [];
      for (const name of def.candidates) for (const dir of this.manifest.modelDirs || ['models/']) {  // first hit wins: Tripo 'merchant' before the stand-in, compressed opt/ before originals
        let base = null, baseClip = null;
        for (const a of anims) { base = await this.tryGLB(`${dir}${name}@${a}.glb`); if (base) { baseClip = a; break; } }
        if (!base) base = await this.tryGLB(`${dir}${name}.glb`);
        if (!base) continue;
        const clips = {};
        if (baseClip && base.animations[0]) clips[baseClip] = base.animations[0];
        await Promise.all(anims.filter((a) => a !== baseClip).map(async (a) => { const g = await this.tryGLB(`${dir}${name}@${a}.glb`); if (g?.animations[0]) clips[a] = g.animations[0]; }));
        for (const c of Object.values(clips)) stripRootMotion(c, base.scene);
        base.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        return { scene: base.scene, clips, def, source: name };
      }
      return null;
    })()));
  }
  // a ready-to-place copy: scaled to the manifest height, feet on y=0, facing +Z
  instance(asset) {
    const o = SkeletonUtils.clone(asset.scene);
    asset.fit ??= measureFit(SkeletonUtils.clone(asset.scene), asset.def.height || 1.8); // measured once per model
    o.scale.multiplyScalar(asset.fit.s); o.position.y -= asset.fit.oy;
    const g = new THREE.Group(); o.rotation.y = THREE.MathUtils.degToRad(asset.def.yaw ?? 0); g.add(o); g.userData.inner = o; return g;
  }
  texture(rel, srgb = true) {
    if (!rel) return Promise.resolve(null);
    return (this.textures[rel] ??= this.track(new Promise((res) => this.texLoader.load(this.base + rel, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null)))));
  }
}

// precise bounds of the posed mesh (handles skinning and quantized/compressed vertex data)
function measureFit(obj, height) {
  obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj, true);
  const s = height / Math.max(0.01, b.max.y - b.min.y); return { s, oy: b.min.y * s };
}
export function fitHeight(obj, height) { // measure raw geometry (skinned meshes report bogus boxes before posing)
  obj.updateMatrixWorld(true); const b = new THREE.Box3(), tb = new THREE.Box3();
  obj.traverse((m) => { if (m.isMesh) { m.geometry.boundingBox || m.geometry.computeBoundingBox(); b.union(tb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld)); } });
  const s = height / Math.max(0.01, b.max.y - b.min.y); obj.scale.multiplyScalar(s); obj.position.y -= b.min.y * s;
}

// Tripo3D clips move the hip bone forward through the loop (root motion), so bodies drift ahead and snap back.
// Remove the linear drift and any constant offset larger than natural sway, keep the bob.
function stripRootMotion(clip, root) {
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.position')) continue;
    const bone = root.getObjectByName(tr.name.slice(0, -9)), v = tr.values, t = tr.times, n = t.length;
    if (!bone || n < 3) continue;
    const T = t[n - 1] - t[0] || 1;
    for (let c = 0; c < 3; c++) {
      const drift = v[(n - 1) * 3 + c] - v[c]; let mean = 0;
      for (let i = 0; i < n; i++) { v[i * 3 + c] -= (drift * (t[i] - t[0])) / T; mean += v[i * 3 + c] / n; }
      const off = mean - bone.position.getComponent(c);
      if (Math.abs(off) > 0.12) for (let i = 0; i < n; i++) v[i * 3 + c] -= off;
    }
  }
}
