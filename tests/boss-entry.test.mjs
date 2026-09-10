import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const transition = main.slice(main.indexOf('const EXIT_T'), main.indexOf('/* ---------------------------------------------------------------- loop'));
const shortcut = main.slice(main.indexOf('const DEV_HOST'), main.indexOf('let t = 0;'));
const bossEntry = main.slice(main.indexOf('function bossArena()'), main.indexOf('function clearRoom()'));

for (const search of ['?boss', '?floor=20']){
  let choice, spawned = 0;
  const state = { run:{}, zones:[], flash:0 };
  const player = { pos:{}, group:{ position:{ copy(){} } }, equipGun(){} };
  const ctx = vm.createContext({
    URLSearchParams, POWER_TEST:false, assistedRun:false, location:{ hostname:'localhost', search },
    MODULES:Array.from({ length:20 }, () => ({ name:'HEARTROOT' })),
    GUNS:[{ id:'laser', color:0xffffff }], state, player,
    startModule(i){
      Object.assign(state, { module:i, phase:'enter', phaseT:0, flash:1, zones:[{ budget:10 }] });
    },
    story:{ finish(){} }, revealGame(){},
    armory:{ levels:{}, updateWallet(){}, save(){} }, weapon:{ equip(){} },
    enemies:{ alive:0, external:[] }, storeTutorial:{ active:false },
    hud:{ toast(){} }, audio:{ duck(){} }, engine:{ addShake(){}, follow(){} },
    room:{ plan:{ rooms:[{ x0:-10, x1:10, z0:-10, z1:10 }] }, colliders:[] },
    boss:{ spawn(){ spawned++; } }, fx:{ ring(){} },
    floorUpgrades:{ openWildcards(cb){ choice = cb; } }
  });
  vm.runInContext(transition + bossEntry + shortcut, ctx);
  assert.equal(state.phase, 'enter', `${search} must finish the entrance fade`);
  vm.runInContext('transition(.375)', ctx);
  assert.equal(state.flash, .5);
  vm.runInContext('transition(.375)', ctx);
  assert.equal(state.phase, 'fight');
  assert.equal(state.flash, 0, 'combat must be visible before the card choice');
  vm.runInContext('startBoss()', ctx);
  assert.equal(state.bossFight, true);
  assert.equal(spawned, 0, 'boss waits for the choice');
  choice({ name:'TEST CARD' }, false);
  assert.equal(spawned, 1);
  assert.equal(state.flash, 0, 'choosing a wildcard must reveal an unobscured fight');
}
console.log('boss entry: entrance fade clears before wildcard selection and boss spawn');
