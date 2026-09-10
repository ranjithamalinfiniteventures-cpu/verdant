/* Copy the exact three modules the game imports (and everything they import in
   turn) out of node_modules into vendor/, so index.html can run straight from
   the filesystem with no CDN.

   The addons pull in each other — EffectComposer needs Pass and CopyShader,
   GTAOPass needs half a dozen shaders and SimplexNoise — so this walks the
   import graph rather than relying on a hand-maintained list, which would go
   stale the moment an effect is added. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root    = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsmRoot = join(root, 'node_modules/three/examples/jsm');
const outRoot = join(root, 'vendor');

// every `three/addons/...` specifier that appears anywhere in src/
const entries = new Set();
const walkSrc = (dir) => {
  for (const name of readdirSyncSafe(dir)){
    const p = join(dir, name);
    if (statIsDir(p)) walkSrc(p);
    else if (name.endsWith('.js')){
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)) entries.add(m[1]);
    }
  }
};
import { readdirSync, statSync } from 'node:fs';
function readdirSyncSafe(d){ try { return readdirSync(d); } catch { return []; } }
function statIsDir(p){ try { return statSync(p).isDirectory(); } catch { return false; } }
walkSrc(join(root, 'src'));

// walk the addon import graph
const copied = new Set();
const queue = [...entries];
while (queue.length){
  const rel = queue.shift();
  if (copied.has(rel)) continue;
  const from = join(jsmRoot, rel);
  if (!existsSync(from)){ console.warn('  missing:', rel); continue; }
  copied.add(rel);
  const code = readFileSync(from, 'utf8');
  const to = join(outRoot, 'addons', rel);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, code);
  for (const m of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){
    const dep = relative(jsmRoot, resolve(dirname(from), m[1]));
    if (!dep.startsWith('..')) queue.push(dep);
  }
}

mkdirSync(outRoot, { recursive: true });
writeFileSync(join(outRoot, 'three.module.min.js'),
  readFileSync(join(root, 'node_modules/three/build/three.module.min.js')));

console.log(`vendored three core + ${copied.size} addon modules -> vendor/`);
for (const c of [...copied].sort()) console.log('  ', c);
