import test from 'node:test';
import assert from 'node:assert/strict';
import { LogStack, REBUILD_SECONDS } from '../src/log-motion.js';

function fixture(){
  let seed=123;
  return new LogStack({x:980,w:260},()=>510,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;});
}
const advance=(stack,seconds,held=true,occupied=false)=>{for(let t=0;t<seconds;t+=1/60)stack.update(held,1/60,occupied);};

test('a press flings logs up, down and sideways with spin; holding does not relaunch',()=>{
  const stack=fixture();assert.equal(stack.update(true,0),true);
  assert.equal(stack.solid,false);
  assert.ok(stack.logs.some(log=>log.vy<-1400));assert.ok(stack.logs.some(log=>log.vy>0));
  assert.ok(stack.logs.some(log=>log.vx>450));assert.ok(stack.logs.some(log=>log.vx<-450));
  assert.ok(stack.logs.every(log=>Math.abs(log.spin)>1));
  assert.equal(stack.update(true,1/60),false);
  const first=stack.logs.map(log=>log.vx);advance(stack,.3,false);advance(stack,REBUILD_SECONDS,false);
  stack.update(true,1/60);assert.notDeepEqual(stack.logs.map(log=>log.vx),first);
});

test('debris leaves the screen, falls under gravity and bounces on real ground',()=>{
  const stack=fixture();stack.update(true,1/60);
  const rocket=stack.logs[0],vy=rocket.vy;advance(stack,.2);
  assert.ok(rocket.vy>vy);assert.ok(stack.logs.some(log=>log.y<100));
  let bounced=false;
  for(let i=0;i<180;i++){stack.update(true,1/60);bounced||=stack.logs.some(log=>log.bounces>0&&log.vy<0);}
  assert.ok(bounced);assert.equal(stack.phase,'scattered');
  assert.ok(stack.logs.some(log=>log.x<0||log.x>2500));
});

test('release removes debris one by one while new pieces build locally from the bottom',()=>{
  const stack=fixture();advance(stack,2);
  const poses=stack.logs.map(({x,y,angle})=>({x,y,angle}));
  stack.update(false,0);assert.equal(stack.phase,'building');
  assert.deepEqual(stack.logs.map(({x,y,angle})=>({x,y,angle})),poses);
  stack.update(false,.01);assert.ok(stack.logs[0].opacity<1);assert.equal(stack.logs[1].opacity,1);
  advance(stack,.15,false);assert.equal(stack.solid,false);
  const built=stack.logs.filter(log=>log.built);assert.ok(built.length>0&&built.length<stack.logs.length);
  assert.deepEqual(built.map(log=>log.index),Array.from({length:built.length},(_,i)=>i));
  for(const log of built){assert.equal(log.x,stack.homes[log.index].x);assert.ok(Math.abs(log.y-stack.homes[log.index].y)<=8);}
  assert.ok(stack.logs.filter(log=>!log.built).some(log=>Math.abs(log.x-stack.homes[log.index].x)>100));
  advance(stack,REBUILD_SECONDS,false);assert.equal(stack.solid,true);
  assert.deepEqual(stack.logs.map(({x,y,angle})=>({x,y,angle})),stack.homes.map(({x,y,angle})=>({x,y,angle})));
});

test('a new press flings both new stack pieces and remaining debris from their current positions',()=>{
  const stack=fixture();advance(stack,.4);advance(stack,.1,false);
  const before=stack.logs.map(({x,y})=>({x,y}));
  stack.update(true,0);
  assert.equal(stack.phase,'scattered');assert.deepEqual(stack.logs.map(({x,y})=>({x,y})),before);
});

test('rebuilding waits for a hamster inside the crossing before restoring collision',()=>{
  const stack=fixture();advance(stack,.4);advance(stack,1,false,true);
  assert.equal(stack.solid,false);advance(stack,REBUILD_SECONDS,false,false);assert.equal(stack.solid,true);
});

test('fallen logs remain in the simulation and settle on their sides',()=>{
  const stack=fixture(),count=stack.logs.length;advance(stack,15);
  assert.equal(stack.logs.length,count);
  const onGround=stack.logs.filter(log=>log.y>485);
  assert.ok(onGround.length>count*.6);
  for(const log of onGround){assert.ok(Math.abs(Math.sin(log.angle))<.08);assert.ok(log.y+log.r<=511);}
});
