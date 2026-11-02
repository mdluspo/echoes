import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, PHYSICS, terrainY } from '../src/engine.js';
import { hamsterFrame, mainSpriteBand, groundProfilePoints, Illustrator } from '../src/art.js';

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
  assert.ok(game.level.platforms.every(platform=>platform.profile&&platform.section===4));
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

test('the fourth trail renders folding bridges, linked marks, and running or caught flags with finite canvas coordinates',()=>{
  let calls=0;const context=new Proxy({globalAlpha:1},{get(target,key){return key in target?target[key]:(...args)=>{calls++;for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${String(key)} needs finite coordinates`);};}});
  const canvas={getContext:()=>context,getBoundingClientRect:()=>({width:1000,height:570})};
  const frame={atlas:{},sx:0,sy:0,cw:100,ch:100,anchorX:50,anchorY:100,b:{ch:100}},art={frames:Array(18).fill(frame),scale:.72,landscape:{width:2048,height:683}};
  const previous=globalThis.devicePixelRatio,previousDocument=globalThis.document;globalThis.devicePixelRatio=1;
  globalThis.document={createElement:()=>({getContext:()=>context})};
  try{
    const game=new Adventure(3),painter=new Illustrator(canvas,art),start=game.section.start;
    game.player.x=start+820;
    for(const progress of [0,.5,1]){game.section.bridges[0].progress=progress;painter.draw(game,1000,1/60);}
    game.player.x=start+5600;painter.rewind();const flag=game.section.exit;
    for(const caught of [false,true]){Object.assign(flag,{x:flag.trapX,running:!caught,caught,stride:1.5});painter.draw(game,2000,1/60);}
    assert.ok(calls>1000);
  }finally{if(previous===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previous;if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

test('both simultaneous Echoes have distinct visible timers when overlapping or replaying offscreen',()=>{
  const arcs=[],context=new Proxy({globalAlpha:1},{get(target,key){if(key==='arc')return(...args)=>arcs.push(args);return key in target?target[key]:()=>{};}});
  const canvas={getContext:()=>context,getBoundingClientRect:()=>({width:1000,height:570})},frame={atlas:{},sx:0,sy:0,cw:100,ch:100,anchorX:50,anchorY:100,b:{ch:100}},art={frames:Array(18).fill(frame),scale:.72,landscape:{width:2048,height:683}};
  const previous=globalThis.devicePixelRatio,previousDocument=globalThis.document;globalThis.devicePixelRatio=1;globalThis.document={createElement:()=>({getContext:()=>context})};
  try{
    const game=new Adventure(3);for(let i=0;i<24;i++)game.update({right:true});assert.equal(game.commit().ok,true);assert.equal(game.commit().ok,true);
    assert.deepEqual(game.echoPosition(game.echoes[0]),game.echoPosition(game.echoes[1]));
    const painter=new Illustrator(canvas,art);painter.draw(game,1000,1/60);assert.equal(arcs.length,2);assert.notDeepEqual(arcs[0].slice(0,2),arcs[1].slice(0,2));
    arcs.length=0;game.player.x=game.section.start+1600;painter.rewind();painter.draw(game,1000,1/60);
    assert.equal(arcs.length,2);for(const arc of arcs)assert.ok(arc[0]>=painter.camera&&arc[0]<=painter.camera+painter.viewWidth);assert.notDeepEqual(arcs[0].slice(0,2),arcs[1].slice(0,2));
  }finally{if(previous===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previous;if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

test('bottom log rows draw in front and pressure plates draw above every projectile',()=>{
  const context=new Proxy({globalAlpha:1},{get(target,key){return key in target?target[key]:()=>{};}}),calls=[];
  const canvas={getContext:()=>context,getBoundingClientRect:()=>({width:1000,height:570})},frame={atlas:{},sx:0,sy:0,cw:100,ch:100,anchorX:50,anchorY:100,b:{ch:100}},art={frames:Array(18).fill(frame),scale:.72,landscape:{width:2048,height:683}};
  const previous=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;
  try{
    const game=new Adventure(3),painter=new Illustrator(canvas,art);game.player.x=game.section.start+1700;
    game.projectiles.push({x:game.player.x,y:450,len:72,r:18,angle:0,opacity:1});
    painter.log=(c,log)=>calls.push({kind:'log',y:log.y,index:log.index});painter.plate=()=>calls.push({kind:'plate'});
    painter.draw(game,0,1/60);const rows=calls.filter(call=>call.kind==='log'&&call.index!==undefined);
    assert.equal(rows.length,24);for(let i=1;i<rows.length;i++)assert.ok(rows[i].y>=rows[i-1].y);
    assert.ok(calls.findIndex(call=>call.kind==='plate')>calls.findLastIndex(call=>call.kind==='log'));
  }finally{if(previous===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previous;}
});
