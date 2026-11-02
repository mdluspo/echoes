import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, createLevel, terrainY } from '../src/engine.js';

const frames=(game,count,input={})=>{for(let i=0;i<count;i++)game.update(input);};
const place=(game,x,facing=1)=>Object.assign(game.player,{x,y:terrainY(game.level,x),vx:0,vy:0,grounded:true,facing});
function encounter(){const game=new Adventure(4),bush=game.section.bushes.find(b=>!b.berries);game.section.fences[1].broken=true;place(game,bush.x-240);return {game,bush};}

test('earlier trails establish harmless berry bushes; the only predator appears halfway through trail five',()=>{
  for(let index=0;index<4;index++){
    const section=createLevel(index);assert.ok(section.bushes.length>=3);assert.ok(section.bushes.every(b=>b.berries));
    const game=new Adventure(index);
    for(const bush of game.section.bushes){place(game,bush.x);frames(game,90);assert.equal(game.dead,false);assert.equal(bush.x,bush.homeX);assert.equal(bush.open,0);}
  }
  const section=createLevel(4),predators=section.bushes.filter(b=>!b.berries);assert.equal(predators.length,1);assert.equal(predators[0].x-section.start,(section.end-section.start)/2);
});

test('looking at the bush freezes it and looking away lets it close the distance',()=>{
  const {game,bush}=encounter(),home=bush.x;frames(game,25);assert.equal(bush.x,home);assert.equal(bush.phase,'frozen');
  game.player.facing=-1;frames(game,20);assert.ok(bush.x<home-90);assert.equal(bush.phase,'stalking');
  const x=bush.x;game.player.facing=1;frames(game,20);assert.equal(bush.x,x);assert.equal(game.dead,false);
});

test('an Echo watching the bush protects a player facing away; Vanish releases it immediately',()=>{
  const {game,bush}=encounter();game.player.facing=-1;
  game.echoes=[{id:1,slot:0,startTick:0,lifetime:1200,frames:[{...game.player,facing:1}]}];
  const x=bush.x;frames(game,30);assert.equal(bush.x,x);assert.equal(bush.phase,'frozen');
  game.resetEcho();game.update();assert.ok(bush.x<x);assert.equal(bush.phase,'stalking');
});

test('a recorded turn lets the bush move again even before its Echo expires',()=>{
  const {game,bush}=encounter(),home=bush.x;game.player.facing=-1;
  game.echoes=[{id:1,slot:0,startTick:0,lifetime:1200,frames:Array.from({length:30},(_,i)=>({...game.player,facing:i<12?1:-1}))}];
  frames(game,10);assert.equal(bush.x,home);frames(game,15);assert.ok(bush.x<home);assert.equal(game.echoes.length,1);assert.equal(game.dead,false);
});

test('close contact reveals teeth, swallows the hamster and keeps chewing while the body disappears',()=>{
  const {game,bush}=encounter();place(game,bush.x-60);const deathX=game.player.x;
  game.update();assert.equal(bush.phase,'opening');assert.equal(game.dead,false);
  for(let i=0;i<20&&!game.dead;i++)game.update();assert.equal(game.dead,true);assert.equal(game.deathReason,'bush');assert.equal(game.deathBody.eater,bush);assert.equal(bush.reveal,1);
  frames(game,6);assert.ok(game.deathBody.scale<1);assert.ok(game.deathBody.x>deathX);assert.equal(bush.phase,'chewing');
  frames(game,22);assert.equal(game.deathBody.opacity,0);assert.ok(bush.reveal>0);
  for(let i=0;i<110&&game.dead;i++)game.update();assert.equal(game.dead,false);assert.equal(bush.open,0);assert.equal(bush.reveal,0);assert.equal(game.player.x,game.section.spawn.x);
});

test('a quick high jump escapes the opening mouth and its bite never reaches a distant hamster',()=>{
  const {game,bush}=encounter();place(game,bush.x-60);game.update();game.update({jumpPressed:true,jumpHeld:true});frames(game,25,{jumpHeld:true});
  assert.equal(game.dead,false);assert.ok(game.player.y<bush.y-105);assert.notEqual(bush.phase,'chewing');
  place(game,bush.x+200);frames(game,15);assert.equal(game.dead,false);
});

test('the predator respects solid log piles and cannot chase across the creek out of its encounter',()=>{
  const {game,bush}=encounter(),start=game.section.start;bush.x=start+3510;place(game,start+3960);
  frames(game,25);assert.ok(bush.x<start+3540);assert.equal(game.dead,false);
  bush.x=start+3990;place(game,start+4500);frames(game,90);assert.equal(bush.x,bush.maxX);assert.equal(game.dead,false);assert.equal(terrainY(game.level,bush.x),510);
  game.restartTake();assert.equal(bush.x,bush.homeX);assert.equal(bush.phase,'dormant');assert.equal(bush.reveal,0);
});
