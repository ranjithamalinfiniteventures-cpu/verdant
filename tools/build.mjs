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
/* Two builds from one source. `web` (default) is for itch, Newgrounds and our
   own site and makes no external requests; `crazygames` carries their SDK. */
const portal = (process.argv.find(a => a.startsWith('--portal=')) || '--portal=web').split('=')[1];
if (!['web', 'crazygames'].includes(portal)) throw new Error(`unknown portal "${portal}"`);
const dist = join(root, portal === 'web' ? 'dist' : `dist-${portal}`);

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
  define: { __VERDANT_PORTAL__: JSON.stringify(portal) },
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

// Enforce the difference rather than trusting it: a web build that still
// mentions the portal SDK would put a third-party request on Newgrounds.
const hasSdk = bundle.includes('sdk.crazygames.com');
if (portal === 'web' && hasSdk) throw new Error('web build still references the CrazyGames SDK');
if (portal === 'crazygames' && !hasSdk) throw new Error('crazygames build is missing its SDK');

const kb = p => (statSync(p).size / 1024).toFixed(0) + ' KB';
const rel = dist.slice(root.length + 1);
console.log(`${rel}/index.html   `, kb(join(dist, 'index.html')));
console.log(`${rel}/verdant.js   `, kb(join(dist, 'verdant.js')));
console.log(portal === 'web'
  ? '\nWeb build (itch, Newgrounds, own site): no external requests.'
  : '\nCrazyGames build: loads their SDK for events, storage, mute and sitelock.');
