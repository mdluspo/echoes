import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, STEP, terrainY } from '../src/engine.js';
import { stepGeese } from '../src/goose.js';

const place=(game,x)=>Object.assign(game.player,{x,y:terrainY(game.level,x),vx:0,vy:0,grounded:true});
const hold=(game,plate,id=1)=>({id,slot:id-1,startTick:game.tick,lifetime:1200,frames:[{...game.player,x:plate.x,y:plate.y,grounded:true}]});

test('the flag switch sits at the far end beyond the snare and every earlier puzzle',()=>{
  const game=new Adventure(3),section=game.section,flag=section.exit,plate=section.plates.find(p=>p.id===flag.requires);
  assert.ok(plate.x>flag.trapX);assert.ok(section.end-plate.x<=40);
  assert.ok(section.logPiles.every(pile=>pile.x+pile.w<plate.x));
});

test('a bell warns before a charge, captures its target once, and ignores extra rings while busy',()=>{
  const game=new Adventure(4),plate=game.section.plates[0],goose=game.level.geese[0],home=goose.x;
  place(game,plate.x);assert.ok(game.update().includes('honk'));assert.equal(goose.phase,'warning');
  const target=goose.targetX;place(game,plate.x+90);game.update();place(game,plate.x);assert.ok(!game.update().includes('honk'));
  assert.equal(goose.targetX,target);assert.equal(goose.x,home);
  for(let i=0;i<50&&goose.phase==='warning';i++)game.update();assert.equal(goose.phase,'charge');
  place(game,plate.x+300);for(let i=0;i<4;i++)game.update();assert.equal(goose.targetX,target);assert.equal(goose.direction,-1);assert.ok(goose.x<home);
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

test('the final goose puzzle needs both Echoes to keep its log pile scattered',()=>{
  const game=new Adventure(4),pile=game.section.logPiles[2],plates=pile.requires.map(id=>game.level.plates.find(p=>p.id===id));
  place(game,game.section.start+4700);game.echoes=[hold(game,plates[0])];game.update();assert.equal(game.pileCleared(pile),false);
  game.echoes.push(hold(game,plates[1],2));game.update();assert.equal(game.pileCleared(pile),true);assert.equal(game.level.geese[2].phase,'warning');
  game.resetEcho();game.update();assert.equal(game.logStacks.get(pile.x).phase,'building');
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
