import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
class Value {set(){return this}setScalar(){return this}setFromEuler(){return this}makeScale(){return this}compose(){return this}}
class Mesh {constructor(){this.instanceMatrix={setUsage(){}}}setMatrixAt(){}}
const context=vm.createContext({THREE:{InstancedMesh:Mesh,OctahedronGeometry:Value,Matrix4:Value,Quaternion:Value,Euler:Value,Vector3:Value},emissive(){},PAL:{gold:0},audio:{pickup(){}},Math});
vm.runInContext(readFileSync(new URL('../src/game/pickups.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export class','class')+'\nglobalThis.Pickups=Pickups;',context);
const create=()=>new context.Pickups({add(){}});
const player={pos:{x:0,z:0}};
for(const dt of [1/120,1/60,1/30]){
 const loot=create();loot.drop({x:3.8,z:0},3);
 let got=0;
 for(let t=0;t<4;t+=dt)got+=loot.update(dt,player);
 assert.equal(got,3,'nearby coins collected at different frame rates');assert.equal(loot.pending,false);
 assert.equal(loot.update(dt,player),0,'no double credit');
}
const sweep=create();sweep.drop({x:18,z:12},95);
let total=0;for(let i=0;i<240;i++)total+=sweep.update(1/60,player,true);
assert.equal(total,95,'pool overflow and room sweep preserve every reward');
const moving=create();moving.drop({x:2,z:0});let count=0;
for(let i=0;i<240;i++){player.pos.x=i/60*7.6;count+=moving.update(1/60,player)}
assert.equal(count,1,'magnet catches a running player');
const far=create();far.drop({x:20,z:0});assert.equal(far.update(0.2,{pos:{x:0,z:0}}),0);assert.equal(far.pending,true);
far.clear();assert.equal(far.pending,false);
console.log('PASS: magnet at 30/60/120 Hz, no double credit, room sweep, pool overflow, running player, distant pickup and clear');
