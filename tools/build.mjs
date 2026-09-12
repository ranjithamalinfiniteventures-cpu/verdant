/* Release build: one HTML file, one JS file, plus assets.

   Development runs the raw ES modules straight from src/ with an import map, so
   an edit is visible on reload with no build step. That is the right trade for
   working on the game, but it means ~45 requests on a cold load, which is the
   wrong trade for a portal. This produces the shippable form: everything —
   three, the addons, and the game — bundled and minified into a single file, so
   dist/ can be zipped and uploaded as-is.

   Run: node tools/build.mjs */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const result = await build({
  entryPoints: [join(root, 'src/bootstrap.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  // MIT and OFL both require their notices to travel with the code: keep the
  // @license blocks (three.js and friends) at the end of the bundle.
  legalComments: 'eof',
  outfile: join(dist, 'verdant.js'),
  alias: { 'three': join(root, 'node_modules/three/build/three.module.js') },
  plugins: [{
    name: 'three-addons',
    setup(b){
      // `three/addons/x` is three's own shorthand for examples/jsm/x
      b.onResolve({ filter: /^three\/addons\// }, args => ({
        path: join(root, 'node_modules/three/examples/jsm', args.path.replace('three/addons/', '')),
      }));
    },
  }],
  metafile: true,
});

/* Strip the dev-only import map and point at the bundle. The import map MUST go:
   if it stays, the browser still tries to resolve bare `three` specifiers and
   the vendored copy gets loaded alongside the bundled one. */
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace('<script type="module" src="./src/bootstrap.js"></script>',
                    '<script type="module" src="./verdant.js"></script>');
if (/<script\s+type=["']importmap["']/.test(html) || /src=["']\.\/src\//.test(html))
  throw new Error('index.html rewrite failed — dist would still reference dev sources');
writeFileSync(join(dist, 'index.html'), html);

cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
cpSync(join(root, 'THIRD-PARTY.md'), join(dist, 'THIRD-PARTY.md'));
// the privacy notice ships with the game, so the in-game link works on a portal
// too, where there is no server of ours to link back to
cpSync(join(root, 'privacy.html'), join(dist, 'privacy.html'));

// the notices are a legal condition of shipping, not a nicety — fail the build
// rather than quietly publishing without them
const bundle = readFileSync(join(dist, 'verdant.js'), 'utf8');
if (!/Three\.js Authors/.test(bundle)) throw new Error('three.js MIT notice missing from the bundle');
for (const f of ['assets/fonts/OFL.txt', 'THIRD-PARTY.md'])
  if (!statSync(join(dist, f)).size) throw new Error(`${f} missing from dist`);

const kb = p => (statSync(p).size / 1024).toFixed(0) + ' KB';
console.log('dist/index.html   ', kb(join(dist, 'index.html')));
console.log('dist/verdant.js   ', kb(join(dist, 'verdant.js')));
console.log('dist/assets/      ', 'fonts + art');
console.log('\nZip the contents of dist/ and upload.');
console.log('One external request: the CrazyGames SDK (gameplay events, sitelock,');
console.log('storage, account name). It is optional — the game runs without it.');
