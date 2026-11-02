import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, PHYSICS, STEP, terrainY } from '../src/engine.js';
import { stepGeese } from '../src/goose.js';

const place=(game,x)=>Object.assign(game.player,{x,y:terrainY(game.level,x),vx:0,vy:0,grounded:true});
const hold=(game,plate,id=1)=>({id,slot:id-1,startTick:game.tick,lifetime:1200,frames:[{...game.player,x:plate.x,y:plate.y,grounded:true}]});

test('the flag switch sits at the far end beyond the snare and every earlier puzzle',()=>{
  const game=new Adventure(3),section=game.section,flag=section.exit,plate=section.plates.find(p=>p.id===flag.requires);
  assert.ok(plate.x>flag.trapX);assert.ok(section.end-plate.x<=40);
  assert.ok(section.logPiles.every(pile=>pile.x+pile.w<plate.x));
});

test('every released and freshly pressed bell rearms its goose, even during a charge',()=>{
  const game=new Adventure(4),plate=game.section.plates[0],goose=game.level.geese[0],home=goose.x;
  place(game,plate.x);assert.ok(game.update().includes('honk'));assert.equal(goose.phase,'warning');
  const target=goose.targetX;place(game,plate.x+90);game.update();place(game,plate.x);assert.ok(game.update().includes('honk'));
  assert.equal(goose.targetX,target);assert.equal(goose.x,home);
  for(let i=0;i<50&&goose.phase==='warning';i++)game.update();assert.equal(goose.phase,'charge');
  place(game,plate.x+300);for(let i=0;i<4;i++)game.update();assert.equal(goose.targetX,target);assert.equal(goose.direction,-1);assert.ok(goose.x<home);
  place(game,plate.x);assert.ok(game.update().includes('honk'));assert.equal(goose.phase,'warning');
});

test('joining a bell held by an Echo never rings it again',()=>{
  const game=new Adventure(4),plate=game.section.plates[0];
  place(game,plate.x-100);game.echoes=[hold(game,plate)];assert.ok(game.update().includes('honk'));
  place(game,plate.x);assert.ok(!game.update().includes('honk'));
  place(game,plate.x-100);assert.ok(!game.update().includes('honk'));
});

test('an Echo rings the bell and clears logs while real raised ground stops the charging goose',()=>{
  const game=new Adventure(4),plate=game.section.plates[0],goose=game.level.geese[0],fence=game.level.fences[0];
  place(game,game.section.start+430);game.echoes=[hold(game,plate)];assert.ok(game.update().includes('honk'));
  assert.equal(game.pileCleared(game.section.logPiles[0]),true);
  for(let i=0;i<240;i++){game.update();assert.equal(game.dead,false);}
  assert.equal(fence.broken,true);assert.equal(fence.debris.length,6);assert.notEqual(goose.phase,'charge');
  assert.equal(game.echoes.length,1);
});

test('a direct goose charge is lethal, but a hamster above its actual head is safe',()=>{
  for(const airborne of [false,true]){
    const game=new Adventure(4),goose=game.level.geese[0];place(game,goose.x-180);
    if(airborne)game.player.y-=125;
    Object.assign(goose,{phase:'charge',targetX:game.player.x,chargeY:510,direction:-1});
    let hit=false;for(let i=0;i<25;i++)hit=stepGeese(game.level,STEP,x=>terrainY(game.level,x),game.player)||hit;
    assert.equal(hit,!airborne);
  }
});

test('the final bell needs one Echo, leaving the other free to watch the bush',()=>{
  const game=new Adventure(4),pile=game.section.logPiles[2],plate=game.level.plates.find(p=>p.id===pile.requires[0]);
  assert.equal(pile.requires.length,1);assert.equal(game.section.plates.filter(p=>p.x>game.section.start+5610).length,1);
  place(game,game.section.start+6040);game.echoes=[hold(game,plate)];game.update();assert.equal(game.pileCleared(pile),true);assert.equal(game.level.geese[2].phase,'warning');
  assert.equal(game.level.limit-game.echoes.length,1);
  game.resetEcho();game.update();assert.equal(game.logStacks.get(pile.x).phase,'building');
});

test('the second goose closes into view before the hamster reaches its fleeing cover',()=>{
  const game=new Adventure(4),goose=game.section.geese[1],plate=game.section.plates[1],mound=game.section.platforms[0];
  place(game,plate.x);game.player.vx=-PHYSICS.speed;game.echoes=[hold(game,plate)];game.update({left:true});
  let closeAt=null;
  for(let tick=0;tick<160;tick++){
    game.update({left:true});assert.equal(game.dead,false);
    if(closeAt===null&&goose.x-game.player.x<220)closeAt=mound.elapsed;
  }
  assert.ok(closeAt!==null&&closeAt<2,`goose should close up early, got ${closeAt}`);
  assert.ok(goose.x-game.player.x>185&&goose.x-game.player.x<210);
  assert.equal(goose.speed,PHYSICS.speed);assert.equal(mound.speed,PHYSICS.speed);
});

test('the close chase still leaves enough room to jump over the goose',()=>{
  const game=new Adventure(4),goose=game.section.geese[1],x=game.section.start+3600;
  place(game,x);game.player.vx=PHYSICS.speed;
  Object.assign(goose,{x:x+190,y:510,phase:'charge',chargeY:510,direction:-1,targetX:x});
  game.update({right:true,jumpPressed:true,jumpHeld:true});
  let crossed=false;for(let tick=0;tick<25;tick++){game.update({right:true,jumpHeld:true});assert.equal(game.dead,false);crossed||=game.player.x>goose.x;}
  assert.ok(crossed);
});

test('tall fences block walking and jumping until a goose physically breaks them',()=>{
  const game=new Adventure(4),fence=game.level.fences[0];place(game,fence.x-70);
  for(let i=0;i<160;i++){game.update({right:true,jumpPressed:i%50===0,jumpHeld:true});assert.equal(game.dead,false);assert.ok(game.player.x<=fence.x-17);}
  assert.equal(fence.broken,false);assert.equal(game.level.geese[0].phase,'idle');
});

test('goose charges and broken fence animations continue through death; explicit retry restores them',()=>{
  const game=new Adventure(4),plate=game.section.plates[0],goose=game.level.geese[0],fence=game.level.fences[0];
  place(game,plate.x);game.update();game.kill('fall');
  for(let i=0;i<90;i++)game.update();assert.equal(fence.broken,true);assert.ok(fence.debris.some(chip=>chip.age>0));assert.ok(goose.x<goose.homeX);
  game.restartTake();assert.equal(fence.broken,false);assert.deepEqual(fence.debris,[]);assert.equal(goose.phase,'idle');assert.equal(goose.x,goose.homeX);
});
