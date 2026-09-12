import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const storage = new Map();
// vault.js persists through the platform storage shim, so strip its import and
// hand the sandbox an equivalent `storage`.
const src = readFileSync(new URL('../src/game/vault.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '').replaceAll('export ', '');
const store = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
const ctx = vm.createContext({ Math, JSON, Number, storage: store, localStorage: store });
vm.runInContext(src + '\nglobalThis.Vault = Vault; globalThis.PERKS = PERKS;', ctx);
const v = new ctx.Vault();
assert.equal(v.gems, 0);
assert.equal(v.buy('plating'), false, 'cannot buy with no gems');
assert.equal(v.spend(1), false);
v.earn(4); assert.equal(v.buy('plating'), true); assert.equal(v.gems, 0); assert.equal(v.damageMul, 0.94);
v.earn(200);
for (let i = 1; i < 5; i++) assert.equal(v.buy('plating'), true);
assert.equal(v.buy('plating'), false, 'perk caps at max'); assert.equal(v.cost('plating'), Infinity);
assert.ok(Math.abs(v.damageMul - 0.7) < 1e-9);
assert.equal(v.buy('choice'), true); assert.equal(v.cardCount, 4);
assert.equal(v.buy('revive'), true); assert.equal(v.revives, 1);
assert.equal(v.buy('shield'), true); assert.equal(v.startShield, 1);
assert.equal(v.buy('salvage'), true); assert.ok(Math.abs(v.coinMul - 1.1) < 1e-9);
const again = new ctx.Vault();
assert.equal(again.gems, v.gems); assert.equal(again.level('plating'), 5); assert.equal(again.level('choice'), 1);
storage.set('verdant.vault.v1', '{nope'); assert.doesNotThrow(() => new ctx.Vault());
storage.set('verdant.vault.v1', JSON.stringify({ gems: -5, levels: { plating: 99, revive: -1 } }));
const clean = new ctx.Vault(); assert.equal(clean.gems, 0); assert.equal(clean.level('plating'), 5); assert.equal(clean.level('revive'), 0);
assert.equal(ctx.Vault.floorReward(0, 10), 1); assert.equal(ctx.Vault.floorReward(2, 10), 2); assert.equal(ctx.Vault.floorReward(9, 10), 4);
assert.equal(ctx.Vault.floorReward(10, 20), 2, 'upper tower pays double'); assert.equal(ctx.Vault.floorReward(11, 20), 4); assert.equal(ctx.Vault.floorReward(19, 20), 4);
let total = 0; for (let i = 0; i < 20; i++) total += ctx.Vault.floorReward(i, 20);
assert.equal(total, 41, 'a clean 20-floor run banks 41 gems from floors alone');
console.log('PASS: vault earn/spend, perk caps, derived stats, persistence, corrupt and out-of-range saves, floor rewards');
