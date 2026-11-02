import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, PHYSICS, STEP, terrainY } from '../src/engine.js';
import { startRunawayPlatform, stepRunawayPlatforms } from '../src/runaway-platform.js';
import { groundProfilePoints } from '../src/art.js';

test('the fleeing cover is continuous grassy terrain, slides for three seconds, and carries riders',()=>{
  const game=new Adventure(4),mound=game.section.platforms[0],home=mound.x;
  const rider={x:home+50,y:410,grounded:true};
  startRunawayPlatform(game.level,'E2');
  for(let tick=0;tick<181;tick++){
    const before=mound.x;stepRunawayPlatforms(game.level,STEP,[rider]);
    assert.ok(before-mound.x<=PHYSICS.speed*STEP+.001);
    assert.equal(terrainY(game.level,rider.x),rider.y);
    assert.equal(terrainY(game.level,mound.x-mound.rampLeft),510);
    assert.equal(terrainY(game.level,mound.x+mound.w+mound.rampRight),510);
  }
  assert.equal(mound.running,false);assert.equal(mound.x,home-PHYSICS.speed*3);
  assert.ok(Math.abs(rider.x-(mound.x+50))<.001);
  const points=groundProfilePoints(game.level,mound.x-130,mound.x+180);
  assert.ok(points.some(([x,y])=>x===mound.x&&y===410));
  startRunawayPlatform(game.level,'E2');stepRunawayPlatforms(game.level,STEP);assert.equal(mound.running,false);
});

test('respawning restores the sliding cover, goose, fence, bush and log piles together',()=>{
  const game=new Adventure(4),mound=game.section.platforms[0],goose=game.section.geese[1],fence=game.section.fences[1],bush=game.section.bushes.find(b=>!b.berries);
  fence.broken=true;fence.debris=[{x:fence.x,y:400,vx:1,vy:0,spin:1,age:0,angle:0}];
  Object.assign(goose,{phase:'return',x:goose.homeX-100});Object.assign(bush,{x:bush.homeX+200,activated:true});
  game.logStacks.get(game.section.logPiles[1].x).launchAttack();
  startRunawayPlatform(game.level,'E2');game.kill('fall');
  for(let tick=0;tick<60;tick++)game.update();assert.ok(mound.x<mound.homeX-280);assert.equal(mound.running,true);
  for(let tick=0;tick<80&&game.dead;tick++)game.update();assert.equal(game.dead,false);
  assert.equal(mound.x,mound.homeX);assert.equal(mound.triggered,false);assert.equal(mound.running,false);assert.equal(mound.elapsed,0);
  assert.equal(goose.x,goose.homeX);assert.equal(goose.phase,'idle');assert.equal(fence.broken,false);assert.deepEqual(fence.debris,[]);
  assert.equal(bush.x,bush.homeX);assert.equal(bush.activated,false);
  assert.ok([...game.logStacks.values()].every(stack=>stack.phase==='stacked'&&stack.logs.every(log=>log.built)));
  assert.equal(game.player.x,game.section.spawn.x);assert.equal(game.echoes.length,0);
  startRunawayPlatform(game.level,'E2');assert.equal(mound.running,true);
});
