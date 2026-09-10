/* Floor upgrades expire after 30s, so applying one must be exactly reversible.

   The risk this guards is a slow drift: if add/remove are not perfect inverses,
   every buff that expires leaves a residue and the player's stats wander away
   from the truth over a 20-floor run. It also guards independence — expiring an
   early buff must not roll back a later one that is still running. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Vector {
  constructor(x=0,y=0,z=0){ this.set(x,y,z); }
  set(x,y,z){ Object.assign(this,{x,y,z}); return this; }
  copy(v){ return this.set(v.x,v.y,v.z); }
  setScalar(s){ return this.set(s,s,s); }
  addScaledVector(v,s){ this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
}
class Matrix { makeScale(){return this} compose(){return this} }
class Quaternion { setFromUnitVectors(){return this} }
class Mesh {
  constructor(){ this.instanceMatrix={setUsage(){}}; this.material={color:{set(){}}}; }
  setMatrixAt(){}
}
const THREE = {
  Vector3:Vector, Matrix4:Matrix, Quaternion, BoxGeometry:class{},
  IcosahedronGeometry:class{}, MeshBasicMaterial:class{}, InstancedMesh:Mesh,
  PointLight:class{ constructor(){ this.position=new Vector(); this.color={set(){}}; this.intensity=0; } },
};
const context = vm.createContext({ THREE, audio:{shot(){},gun(){},impactFor(){}}, Math, Set });
vm.runInContext(
  readFileSync(new URL('../src/game/weapons.js', import.meta.url),'utf8')
    .replace(/^import .*\n/gm,'').replaceAll('export ','')
  + '\nglobalThis.Weapon=Weapon;globalThis.GUNS=GUNS;', context);

const snap = w => JSON.parse(JSON.stringify(w.runMods));
const mk = () => { const w = new context.Weapon({add(){}}); w.equip(context.GUNS[0],1); return w; };
const IDS = ['power','overclock','velocity','split','pierce','crit'];

// 1. every upgrade, applied then expired, returns the mods exactly to base
for (const id of IDS){
  const w = mk();
  const base = snap(w);
  const d = w.addRunUpgrade(id);
  assert.notDeepEqual(snap(w), base, `${id} must actually change something`);
  w.removeRunUpgrade(d);
  assert.deepEqual(snap(w), base, `${id} must revert exactly`);
}

// 2. expiring one buff must not disturb another that is still running
{
  const w = mk();
  const dPower = w.addRunUpgrade('power');
  const afterPower = snap(w);
  const dSplit = w.addRunUpgrade('split');
  w.removeRunUpgrade(dSplit);
  assert.deepEqual(snap(w), afterPower, 'expiring the later buff must leave the earlier one intact');
  w.removeRunUpgrade(dPower);
  assert.equal(w.runMods.damage, 1, 'both expired returns to base');
}

// 3. a long run of stacked buffs expiring in a shuffled order leaves no residue
{
  const w = mk();
  const base = snap(w);
  const deltas = [];
  for (let i = 0; i < 40; i++) deltas.push(w.addRunUpgrade(IDS[i % IDS.length]));
  // expire them out of order, the way independent 30s timers actually fire
  for (let i = deltas.length - 1; i >= 0; i -= 2) w.removeRunUpgrade(deltas.splice(i,1)[0]);
  for (const d of deltas.reverse()) w.removeRunUpgrade(d);
  const end = snap(w);
  for (const k of Object.keys(base)){
    assert.ok(Math.abs(end[k] - base[k]) < 1e-9, `${k} drifted: ${base[k]} -> ${end[k]}`);
  }
}

// 4. crit clamps at 0.6, and expiring a clamped buff gives back only what it added
{
  const w = mk();
  const ds = [];
  for (let i = 0; i < 5; i++) ds.push(w.addRunUpgrade('crit'));
  assert.ok(w.runMods.crit <= 0.6 + 1e-9, 'crit must stay clamped');
  for (const d of ds) w.removeRunUpgrade(d);
  assert.ok(Math.abs(w.runMods.crit) < 1e-9, `clamped crit must return to 0, got ${w.runMods.crit}`);
}

console.log('boons: ok');
