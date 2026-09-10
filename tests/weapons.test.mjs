import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
class Vector {
  constructor(x=0,y=0,z=0){this.set(x,y,z)}
  set(x,y,z){Object.assign(this,{x,y,z});return this}
  copy(v){return this.set(v.x,v.y,v.z)}
  setScalar(s){return this.set(s,s,s)}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this}
}
class Matrix {makeScale(){return this} compose(){return this}}
class Quaternion {setFromUnitVectors(){return this}}
class Mesh {constructor(){this.instanceMatrix={setUsage(){}};this.material={color:{set(){}}}} setMatrixAt(){}}
const THREE={Vector3:Vector,Matrix4:Matrix,Quaternion,BoxGeometry:class{},IcosahedronGeometry:class{},MeshBasicMaterial:class{},InstancedMesh:Mesh,PointLight:class{constructor(){this.position=new Vector();this.color={set(){}};this.intensity=0}}};
const context=vm.createContext({THREE,audio:{shot(){},gun(){},impactFor(){}},Math,Set});
vm.runInContext(readFileSync(new URL('../src/game/weapons.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ','')+'\nglobalThis.Weapon=Weapon;globalThis.GUNS=GUNS;',context);
const fx={burst(){},ring(){}};const engine={addShake(){}};
for(const spec of context.GUNS){
 const w=new context.Weapon({add(){}});w.equip(spec,1);
 const player={pos:new Vector(),group:{updateMatrixWorld(){}},muzzle:{getWorldPosition(v){v.set(0,0.8,0)}}};
 const target={alive:true,pos:new Vector(0,0,4),def:{radius:0.5},hp:100};
 const secondary={alive:true,pos:new Vector(spec.splash?1:0,0,spec.splash?4:6),def:{radius:0.5},hp:100};
 const hits=[];const enemies={list:[target,secondary],nearest(){return target},hit(e,d){hits.push(e);e.hp-=d;return false}};
 w.update(1/60,player,enemies,fx,engine,{x:20,z:20});
 assert.equal(w.bolts.filter(b=>b.alive).length,spec.pellets||1,`${spec.id} projectile count`);
 w.cd=999;
 for(let i=0;i<50;i++)w.update(1/60,player,enemies,fx,engine,{x:20,z:20});
 assert.ok(target.hp<100,`${spec.id} hits target`);
 if(spec.pierce){assert.ok(secondary.hp<100);assert.equal(hits.filter(e=>e===target).length,1,'rail cannot hit same enemy repeatedly')}
 if(spec.splash)assert.ok(secondary.hp<100,'plasma splash damages nearby enemy');
 w.equip(spec,5);assert.equal(w.spec.damage,spec.damage*2);assert.equal(w.bolts.some(b=>b.alive),false);
 w.addRunUpgrade('power');assert.ok(Math.abs(w.spec.damage-spec.damage*2*1.12)<1e-9);
 w.addRunUpgrade('overclock');assert.ok(Math.abs(w.spec.fireRate-spec.fireRate*1.10)<1e-9);
 w.addRunUpgrade('velocity');assert.ok(Math.abs(w.spec.range-spec.range*1.12)<1e-9);assert.ok(Math.abs(w.spec.boltSpeed-spec.boltSpeed*1.12)<1e-9);
 w.resetRunUpgrades();assert.equal(w.spec.damage,spec.damage*2);assert.equal(w.spec.fireRate,spec.fireRate);
}
console.log('PASS: all five guns fire and damage, five scatter pellets, rail piercing without repeat hits, plasma splash, upgrade damage and projectile cleanup');
