import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, createLevel, terrainY } from '../src/engine.js';

const frames=(game,count,input={})=>{for(let i=0;i<count;i++)game.update(input);};
const place=(game,x,facing=1)=>Object.assign(game.player,{x,y:terrainY(game.level,x),vx:0,vy:0,grounded:true,facing});
function encounter(){const game=new Adventure(4),bush=game.section.bushes.find(b=>!b.berries);game.section.fences[1].broken=true;place(game,bush.x+140,-1);game.update();place(game,bush.x-240);return {game,bush};}

test('earlier trails establish safe bushes; the predator has room before the final creek and third bell',()=>{
  for(let index=0;index<4;index++){
    const section=createLevel(index);assert.ok(section.bushes.length>=3);assert.ok(section.bushes.every(b=>b.berries));
    const game=new Adventure(index);
    for(const bush of game.section.bushes){place(game,bush.x);frames(game,90);assert.equal(game.dead,false);assert.equal(bush.x,bush.homeX);assert.equal(bush.open,0);}
  }
  for(let run=0;run<3;run++){
    const section=createLevel(4),predators=section.bushes.filter(b=>!b.berries),bell=section.plates.filter(p=>p.bell).at(-1);
    assert.equal(predators.length,1);assert.equal(predators[0].x,bell.x-1250);assert.ok(predators[0].x>section.logPiles[1].x+section.logPiles[1].w);assert.ok(predators[0].x<section.ground[2].x);assert.equal(terrainY(section,predators[0].x),510);
  }
});

test('looking at the bush freezes it and looking away lets it close the distance',()=>{
  const {game,bush}=encounter(),home=bush.x;frames(game,25);assert.equal(bush.x,home);assert.equal(bush.phase,'frozen');
  game.player.facing=-1;frames(game,220);assert.ok(bush.x<home-90);assert.notEqual(bush.phase,'frozen');
  game.player.x=bush.x-200;game.player.y=terrainY(game.level,game.player.x);game.player.facing=1;
  const x=bush.x;frames(game,20);assert.equal(bush.x,x);assert.equal(game.dead,false);
});

test('the predator stays harmless until the hamster passes it',()=>{
  const game=new Adventure(4),bush=game.section.bushes.find(b=>!b.berries),home=bush.x;
  for(const distance of [-200,-60,0,50]){place(game,home+distance);frames(game,25);assert.equal(bush.activated,false);assert.equal(bush.x,home);assert.equal(bush.phase,'dormant');assert.equal(game.dead,false);}
  place(game,home+140,-1);game.update();assert.equal(bush.activated,true);assert.equal(bush.phase,'frozen');
  game.player.facing=1;frames(game,5);assert.equal(bush.x,home);frames(game,180);assert.ok(bush.x>home);
});

test('respawning restores the predator before the third bell even after it chased beyond it',()=>{
  const {game,bush}=encounter(),bell=game.section.plates.filter(p=>p.bell).at(-1);
  bush.x=bell.x+200;game.kill('fall');for(let i=0;i<130&&game.dead;i++)game.update();
  assert.equal(game.dead,false);assert.equal(bush.x,bell.x-1250);assert.equal(bush.activated,false);assert.equal(bush.phase,'dormant');
});

test('an Echo watching the bush protects a player facing away; Vanish releases it immediately',()=>{
  const {game,bush}=encounter();game.player.facing=-1;
  game.echoes=[{id:1,slot:0,startTick:0,lifetime:1200,frames:[{...game.player,facing:1}]}];
  const x=bush.x;frames(game,30);assert.equal(bush.x,x);assert.equal(bush.phase,'frozen');
  game.resetEcho();frames(game,185);assert.ok(bush.x<x);assert.equal(bush.phase,'stalking');
});

test('a recorded turn lets the bush move again even before its Echo expires',()=>{
  const {game,bush}=encounter(),home=bush.x;game.player.facing=-1;
  game.echoes=[{id:1,slot:0,startTick:0,lifetime:1200,frames:Array.from({length:30},(_,i)=>({...game.player,facing:i<12?1:-1}))}];
  frames(game,10);assert.equal(bush.x,home);frames(game,240);assert.ok(bush.x<home);assert.equal(game.echoes.length,1);assert.equal(game.dead,false);
});

test('close contact reveals teeth, swallows the hamster and keeps chewing while the body disappears',()=>{
  const {game,bush}=encounter();bush.chaseDelay=0;place(game,bush.x-60);const deathX=game.player.x;
  game.update();assert.equal(bush.phase,'opening');assert.equal(game.dead,false);
  for(let i=0;i<20&&!game.dead;i++)game.update();assert.equal(game.dead,true);assert.equal(game.deathReason,'bush');assert.equal(game.deathBody.eater,bush);assert.equal(bush.reveal,1);
  frames(game,6);assert.ok(game.deathBody.scale<1);assert.ok(game.deathBody.x>deathX);assert.equal(bush.phase,'chewing');
  frames(game,22);assert.equal(game.deathBody.opacity,0);assert.ok(bush.reveal>0);
  for(let i=0;i<110&&game.dead;i++)game.update();assert.equal(game.dead,false);assert.equal(bush.open,0);assert.equal(bush.reveal,0);assert.equal(game.player.x,game.checkpoint.x);
});

test('a quick high jump escapes the opening mouth and its bite never reaches a distant hamster',()=>{
  const {game,bush}=encounter();bush.chaseDelay=0;place(game,bush.x-60);game.update();game.update({jumpPressed:true,jumpHeld:true});frames(game,25,{jumpHeld:true});
  assert.equal(game.dead,false);assert.ok(game.player.y<bush.y-105);assert.notEqual(bush.phase,'chewing');
  place(game,bush.x+200);frames(game,15);assert.equal(game.dead,false);
});

test('the predator jumps across the creek to follow the hamster into the next encounter',()=>{
  const {game,bush}=encounter(),start=game.section.start;Object.assign(bush,{x:start+5380,y:510,grounded:true});place(game,start+6000);
  bush.chaseDelay=0;bush.speed=315;
  let airborne=false;for(let i=0;i<100;i++){game.update();airborne||=!bush.grounded;assert.equal(game.dead,false);if(airborne&&bush.grounded&&bush.x>start+5610)break;}
  assert.ok(airborne);assert.ok(bush.jumps>0);assert.ok(bush.x>start+5610);assert.equal(bush.grounded,true);assert.equal(bush.y,terrainY(game.level,bush.x));
  game.restartTake();assert.equal(bush.x,bush.homeX);assert.equal(bush.phase,'dormant');assert.equal(bush.reveal,0);
  assert.equal(bush.activated,false);
});
