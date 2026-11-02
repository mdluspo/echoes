import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUSH_ATLAS, BUSH_MOUTHS, bushSpriteFrame } from '../src/bush-sprites.js';
import { Illustrator } from '../src/art.js';

test('the supplied fourteen drawings are repacked into padded RGBA frames with the same ground anchor',()=>{
  const png=readFileSync(new URL('../src/assets/bush-killer-sheet.png',import.meta.url)),meta=JSON.parse(readFileSync(new URL('../src/assets/bush-killer-sheet.json',import.meta.url),'utf8'));
  assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),BUSH_ATLAS.columns*BUSH_ATLAS.cellWidth);assert.equal(png.readUInt32BE(20),BUSH_ATLAS.rows*BUSH_ATLAS.cellHeight);
  assert.equal(png[25],6,'RGBA transparency is required');assert.equal(meta.columns*meta.rows,14);assert.deepEqual(meta.anchor,{x:BUSH_ATLAS.anchorX,y:BUSH_ATLAS.anchorY});
  assert.equal(meta.source,'bush-supplied-sheet.png');assert.equal(meta.animations.creep.distancePerCycle,150);assert.deepEqual(Object.values(meta.animations).map(a=>a.row),[0,1]);
  assert.deepEqual(meta.defaultFrame,{row:0,column:0});assert.deepEqual(BUSH_MOUTHS,meta.frames.map(frame=>frame.mouth));
  assert.ok(meta.frames[11].sourceBounds.w>meta.frames[0].sourceBounds.w*2,'the oversized attack must retain its complete width');
  for(const frame of meta.frames){const {sourceBounds:b,sourceAnchor:a}=frame;assert.ok(meta.anchor.x+b.x-a.x>=3);assert.ok(meta.anchor.x+b.x+b.w-a.x<BUSH_ATLAS.cellWidth-3);assert.ok(meta.anchor.y+b.y-a.y>=3);}
});

test('moving uses the top row and every resting bush uses the supplied first sprite',()=>{
  const bush={phase:'stalking',stride:75};assert.deepEqual(bushSpriteFrame(bush,0),{row:0,column:3});
  for(const phase of ['idle','dormant','frozen'])for(const berries of [true,false])assert.deepEqual(bushSpriteFrame({...bush,phase,berries},10000),{row:0,column:0});
  assert.deepEqual(bushSpriteFrame({phase:'stalking',stride:149}),{row:0,column:6});assert.deepEqual(bushSpriteFrame({phase:'stalking',stride:150}),{row:0,column:0});
});

test('the opening, swallowing, chewing and settling states select the matching eating frames',()=>{
  assert.deepEqual([0,.11,.22].map(age=>bushSpriteFrame({phase:'opening',age},0).column),[0,2,4]);
  assert.deepEqual([0,.42,.55,.9,1.2].map(age=>bushSpriteFrame({phase:'chewing',age},0).column),[4,5,5,6,6]);
  assert.equal(bushSpriteFrame({phase:'opening',age:.2}).row,1);assert.equal(BUSH_MOUTHS[7],null);assert.ok(BUSH_MOUTHS[11].w>250);
});

test('the renderer slices the sprite sheet with a fixed ground anchor and draws foreground teeth separately',()=>{
  const draws=[],clips=[],atlas={},context=new Proxy({globalAlpha:1},{get(target,key){if(key==='drawImage')return(...args)=>draws.push(args);if(key==='rect')return(...args)=>clips.push(args);return key in target?target[key]:()=>{};}});
  const previous=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;
  try{
    const painter=new Illustrator({getContext:()=>context,getBoundingClientRect:()=>({width:1000,height:570})},{bushSheet:atlas});
    const bush={x:400,y:510,homeX:400,berries:false,phase:'stalking',stride:75,facing:-1,open:0,reveal:0};
    painter.bush(context,bush,0);assert.deepEqual(draws[0],[atlas,3*512,0,512,384,-256,-360,512,384]);
    Object.assign(bush,{phase:'chewing',age:.1,open:1,reveal:1});painter.bush(context,bush,0);assert.equal(draws[1][2],384);
    painter.bush(context,bush,0,{teethOnly:true});assert.equal(draws.length,3);assert.deepEqual(clips[0],Object.values(BUSH_MOUTHS[11]),'the foreground must use the supplied mouth pixels rather than generated teeth');
  }finally{if(previous===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previous;}
});
