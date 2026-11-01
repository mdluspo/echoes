import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, PHYSICS, terrainY } from '../src/engine.js';
import { hamsterFrame, mainSpriteBand, groundProfilePoints } from '../src/art.js';

test('movement plays all six supplied locomotion frames, independently of wall-clock time',()=>{
  const game=new Adventure(),poses=new Set();
  for(let i=0;i<70;i++){
    game.update({right:true});
    if(game.player.vx>18){const pose=hamsterFrame(game.player,0);poses.add(pose);assert.equal(hamsterFrame(game.player,9000),pose);}
  }
  assert.deepEqual([...poses].sort((a,b)=>a-b),[6,7,8,9,10,11]);
  game.commit();
  for(const frame of game.echoes[0].frames)if(Math.abs(frame.vx)>18)assert.equal(hamsterFrame(frame,0),hamsterFrame(frame,99000));
});

test('walk uses a slower physical speed and preserves its gait in a clone recording',()=>{
  const game=new Adventure();
  for(let i=0;i<40;i++)game.update({right:true,walk:true});
  assert.equal(game.player.vx,PHYSICS.walkSpeed);assert.equal(game.player.gait,'walk');
  assert.equal(game.commit().ok,true);assert.equal(game.echoes[0].frames.at(-1).gait,'walk');
});

test('idle, rise, apex, fall and landing select the corresponding supplied strips',()=>{
  const game=new Adventure(),p=game.player;
  for(let t=0;t<1260;t+=210)assert.ok(hamsterFrame(p,t)>=0&&hamsterFrame(p,t)<6);
  const poses=new Set();
  game.update({jumpPressed:true,jumpHeld:true});
  for(let i=0;i<60;i++){poses.add(hamsterFrame(game.player,0));game.update({jumpHeld:true});}
  for(const pose of [13,14,15,16,17])assert.ok(poses.has(pose),`Missing jump pose ${pose}`);
});

test('the outdoor sky has no invisible ceiling',()=>{
  const game=new Adventure();game.player.y=205;game.player.grounded=false;game.player.vy=-500;
  for(let i=0;i<10;i++)game.update({jumpHeld:true});
  assert.ok(game.player.y-PHYSICS.height<125);assert.equal(game.level.ceiling,undefined);
});

test('the grassy rises are continuous walkable ground',()=>{
  const game=new Adventure();
  for(let i=0;i<90;i++){
    game.update({right:true});
    assert.equal(game.player.grounded,true);
    assert.equal(game.player.y,terrainY(game.level,game.player.x));
  }
  assert.ok(game.player.y<400);
  assert.equal(game.level.platforms,undefined);
});

test('sprite cropping excludes detached pixels from the row above without trimming the pose',()=>{
  const rows=Array(256).fill(0);rows[0]=55;rows[1]=43;
  for(let y=66;y<=252;y++)rows[y]=y===66?2:80;
  assert.deepEqual(mainSpriteBand(rows),{top:66,bottom:252,pixels:2+186*80});
});

test('slope vertices stay identical in world space when the camera moves fractionally',()=>{
  const game=new Adventure(1),x=game.section.start;
  const visible=points=>points.filter(([px])=>px>=x+450&&px<=x+730);
  const first=visible(groundProfilePoints(game.level,x+400.25,x+780.25));
  for(const offset of [.5,.75,1.25,2.9])assert.deepEqual(visible(groundProfilePoints(game.level,x+400+offset,x+780+offset)),first);
});
