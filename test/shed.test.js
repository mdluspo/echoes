import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, STEP, terrainY, logTouchesActor } from '../src/engine.js';

const frames=(game,count)=>{for(let i=0;i<count;i++)game.update();};
const place=(game,x)=>Object.assign(game.player,{x,y:terrainY(game.level,x),vx:0,vy:0,grounded:true});
function homingGame(sheltered){
  const game=new Adventure(3,{},()=>.5),plate=game.section.plates.find(p=>p.homing),shed=game.section.sheds[0];
  place(game,plate.x);assert.ok(game.update().includes('logs'));assert.equal(game.projectiles.length,24);
  game.echoes=[{id:1,slot:0,startTick:game.tick,lifetime:1200,frames:[{...game.player}]}];
  const target=sheltered?shed.x+shed.w/2:plate.x+60;place(game,target);
  game.view={left:game.section.start+1200,right:game.section.start+2200,top:65,bottom:635};
  return {game,shed,plate};
}

test('the first level-four log puzzle flings all logs out of view and waits three seconds before returning',()=>{
  const {game}=homingGame(true);let waiting;
  for(let i=0;i<100&&!waiting;i++){game.update();waiting=game.projectiles.find(log=>log.stage==='waiting');assert.equal(game.dead,false);}
  assert.ok(waiting);assert.equal(waiting.opacity,0);const delay=waiting.wait;
  assert.ok(delay>2.9&&delay<=3);frames(game,120);assert.equal(waiting.stage,'waiting');assert.ok(waiting.wait>.8);
  for(let i=0;i<90&&waiting.stage==='waiting';i++)game.update();assert.notEqual(waiting.stage,'waiting');
});

test('returning homing logs kill an exposed hamster',()=>{
  const {game}=homingGame(false);for(let i=0;i<400&&!game.dead;i++)game.update();assert.equal(game.dead,true);assert.equal(game.deathReason,'logs');
});

test('a shed roof protects the hamster and deflects every returning log into harmless moving debris',()=>{
  const {game}=homingGame(true),deflected=new Set();
  for(let i=0;i<450;i++){game.update();assert.equal(game.dead,false);for(const log of game.projectiles)if(log.deflectedBy==='roof')deflected.add(log);}
  assert.equal(deflected.size,24);assert.ok(game.projectiles.every(log=>!log.hostile));
});

test('vanishing the last Echo cannot cancel the waiting return or create a duplicate volley',()=>{
  const {game,plate,shed}=homingGame(true),first=game.projectiles[0].volley,logs=[...game.projectiles];
  for(let i=0;i<100&&!game.projectiles.every(log=>log.stage==='waiting');i++)game.update();
  assert.ok(game.projectiles.every(log=>log.stage==='waiting'));
  game.resetEcho();game.update();assert.equal(first.cancelled,false);assert.equal(game.projectiles.length,24);
  place(game,plate.x);game.update();assert.equal(game.projectiles.length,24);
  assert.ok(game.projectiles.every(log=>logs.includes(log)&&log.volley===first));
  place(game,shed.x+shed.w/2);const deflected=new Set();
  for(let i=0;i<300;i++){game.update();assert.equal(game.dead,false);for(const log of game.projectiles)if(log.deflectedBy==='roof')deflected.add(log);}
  assert.equal(deflected.size,24);assert.equal(first.committed,true);
});

test('an immediate switch release still brings every homing log back after the outward fling',()=>{
  const game=new Adventure(3,{},()=>.5),plate=game.section.plates.find(p=>p.homing),shed=game.section.sheds[0];
  place(game,plate.x);game.update();const logs=[...game.projectiles],x=logs[0].x;
  place(game,shed.x+shed.w/2);game.update();assert.equal(logs[0].volley.cancelled,false);assert.notEqual(logs[0].x,x);
  const returned=new Set();for(let i=0;i<450;i++){game.update();assert.equal(game.dead,false);for(const log of game.projectiles)if(log.stage==='returning'||log.deflectedBy==='roof')returned.add(log);}
  assert.equal(returned.size,24);assert.equal(logs[0].volley.committed,true);
});

test('once the return begins, releasing and pressing again cannot cancel or duplicate that volley',()=>{
  const {game,plate,shed}=homingGame(true),volley=game.projectiles[0].volley,deflected=new Set();
  for(let i=0;i<350&&!volley.committed;i++)game.update();assert.equal(volley.committed,true);
  const logs=[...game.projectiles];assert.equal(logs.length,24);
  game.resetEcho();game.update();assert.equal(volley.cancelled,false);
  place(game,plate.x);game.update();assert.ok(game.projectiles.every(log=>logs.includes(log)));
  place(game,shed.x+shed.w/2);
  for(let i=0;i<180;i++){game.update();assert.equal(game.dead,false);for(const log of game.projectiles)if(log.deflectedBy==='roof')deflected.add(log);}
  assert.equal(deflected.size,24);assert.equal(volley.cancelled,false);
});

test('joining and handing off a held homing switch preserves one pending volley and its deadline',()=>{
  const {game,plate,shed}=homingGame(true),logs=[...game.projectiles],volley=logs[0].volley;
  for(let i=0;i<100&&!logs.every(log=>log.stage==='waiting');i++)game.update();
  const wait=logs[0].wait;
  place(game,plate.x);game.update();game.resetEcho();game.update();
  assert.equal(game.projectiles.length,24);assert.ok(game.projectiles.every(log=>logs.includes(log)));
  assert.equal(volley.cancelled,false);assert.ok(logs[0].wait<wait);
  game.echoes=[{id:2,slot:0,startTick:game.tick,lifetime:1200,frames:[{...game.player}]}];
  place(game,shed.x+shed.w/2);game.update();assert.equal(volley.cancelled,false);
  assert.equal(game.projectiles.length,24);assert.ok(game.projectiles.every(log=>log.volley===volley));
});

test('a pending direct attack survives switch release and Vanish without duplicate launches',()=>{
  const game=new Adventure(1,{},()=>0),plate=game.section.plates[0],pile=game.section.logPiles[0];
  place(game,plate.x);game.update();assert.equal(game.attacks.length,1);
  const remaining=game.attacks[0].remaining;
  place(game,game.section.start+620);game.resetEcho();game.update();assert.equal(game.attacks.length,1);assert.ok(game.attacks[0].remaining<remaining);assert.equal(game.logStacks.get(pile.x).phase,'armed');
  place(game,plate.x);game.update({},0);assert.equal(game.attacks.length,1);assert.equal(game.attacks[0].target.x,plate.x);
  place(game,game.section.start+620);game.update({},0);game.attacks[0].remaining=0;game.updateAttacks(0);
  const logs=[...game.projectiles];assert.equal(logs.length,24);
  place(game,game.section.start+620);game.update({},0);place(game,plate.x);game.update({},0);
  assert.equal(game.attacks.length,0);assert.deepEqual(game.projectiles,logs);
});

test('a triggered log attack finishes its windup even when death clears the Echo',()=>{
  const game=new Adventure(1,{},()=>0),plate=game.section.plates[0];place(game,game.section.start+620);
  game.echoes=[{id:1,slot:0,startTick:game.tick,lifetime:1200,frames:[{...game.player,x:plate.x,y:plate.y}]}];game.update();
  assert.equal(game.attacks.length,1);game.kill('fall');frames(game,35);
  assert.equal(game.echoes.length,0);assert.equal(game.attacks.length,0);assert.ok(game.projectiles.some(log=>log.pileX===game.section.logPiles[0].x));
});

test('Echo-only presses aim volleys at the Echo and do not reroll while the button stays held',()=>{
  const game=new Adventure(1,{},()=>0),plate=game.section.plates[0];place(game,game.section.start+630);
  game.echoes=[{id:1,slot:0,startTick:0,lifetime:600,frames:[{...game.player,x:plate.x,y:plate.y}]}];
  assert.ok(game.update().includes('warning'));assert.equal(game.attacks[0].actor,'echo:1');assert.equal(game.attacks[0].target.x,plate.x);
  for(let i=0;i<150;i++){assert.ok(!game.update().includes('warning'));assert.equal(game.dead,false);}
  game.echoes=[];game.update();game.echoes=[{id:2,slot:0,startTick:game.tick,lifetime:600,frames:[{...game.player,x:plate.x,y:plate.y}]}];
  assert.ok(game.update().includes('warning'));
});

test('rebuilding cannot crush anyone until a visible new log actually intersects them',()=>{
  const game=new Adventure(),pile=game.section.logPiles[0],stack=game.logStacks.get(pile.x);stack.update(true,.1);place(game,pile.x+pile.w/2);
  game.update();assert.equal(game.dead,false);assert.equal(stack.logs.some(log=>log.built),false);
  game.update();assert.equal(game.dead,false);assert.equal(stack.logs.some(log=>log.built),false);
  for(let i=0;i<30&&!game.dead;i++)game.update();assert.equal(game.dead,true);assert.ok(stack.newPieces.some(log=>log.opacity>0&&logTouchesActor(log,game.player)));
  const before=stack.logs.filter(log=>log.built).length;frames(game,20);assert.ok(stack.logs.filter(log=>log.built).length>before);
});

test('logs keep animating during death, then respawn clears flights and restores full piles',()=>{
  const game=new Adventure(1);place(game,game.section.start+600);game.view={left:4000,right:5200,top:0,bottom:650};
  const log={x:4500,y:100,vx:20,vy:0,angle:0,spin:1,len:72,r:18,age:0,opacity:1,hostile:true};game.projectiles.push(log);
  const stack=game.logStacks.get(game.section.logPiles[0].x);stack.update(true,.1);game.kill('fall');frames(game,10);
  assert.ok(log.x>4500);assert.ok(log.age>0);assert.equal(stack.phase,'building');assert.ok(stack.logs.some(piece=>piece.built));
  for(let i=0;i<130&&game.dead;i++)game.update();assert.equal(game.dead,false);assert.equal(game.projectiles.length,0);assert.equal(game.attacks.length,0);
  assert.equal(stack.phase,'stacked');assert.equal(stack.logs.filter(piece=>piece.built).length,24);assert.equal(game.echoes.length,0);
});

test('directional logs keep their velocity and remain until their entire body leaves the camera',()=>{
  const game=new Adventure(1);place(game,4600);game.view={left:4000,right:5200,top:0,bottom:650};
  const log={x:4500,y:100,vx:20,vy:0,angle:0,spin:0,len:72,r:18,age:0,opacity:1,hostile:true};game.projectiles.push(log);
  for(let i=0;i<240;i++)game.updateAttacks(STEP);assert.ok(game.projectiles.includes(log));assert.equal(log.vx,20);assert.equal(log.vy,0);assert.equal(log.y,100);
  game.view={left:6000,right:7000,top:0,bottom:650};game.updateAttacks(STEP);assert.equal(game.projectiles.length,0);
});

test('a lethal hit does not remove the projectile or stop its motion during the death animation',()=>{
  const game=new Adventure(1);place(game,game.section.start+1900);const log={x:game.player.x+70,y:game.player.y-30,vx:-1000,vy:0,angle:0,spin:0,len:72,r:18,age:0,opacity:1,hostile:true};game.projectiles.push(log);
  for(let i=0;i<8&&!game.dead;i++)game.update();assert.equal(game.dead,true);assert.ok(game.projectiles.includes(log));const x=log.x;frames(game,5);assert.ok(log.x<x);assert.ok(game.projectiles.includes(log));
});
