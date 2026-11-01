import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, PHYSICS, STEP, createLevel, ECHO_TICKS, ECHO_HOLD_TICKS, terrainY } from '../src/engine.js';

function frames(game,count,input={}){for(let i=0;i<count;i++)game.update(typeof input==='function'?input(i):input);}
function aim(game,x){
  const distance=x-game.player.x,stopping=game.player.vx**2/(2*2800)+3;
  if(game.player.grounded&&Math.sign(game.player.vx)===Math.sign(distance)&&Math.abs(distance)<stopping)return{};
  return{right:distance>2,left:distance< -2,walk:game.player.grounded&&Math.abs(distance)<70};
}
function walkTo(game,x,limit=600){
  for(let i=0;i<limit;i++){game.update(aim(game,x));if(Math.abs(game.player.x-x)<3&&Math.abs(game.player.vx)<25)return;}
  assert.fail(`Could not walk to ${x}; at ${game.player.x}, ${game.player.y}`);
}
function jumpTo(game,x){
  game.update({...aim(game,x),jumpPressed:true,jumpHeld:true});
  for(let i=0;i<100;i++){game.update({...aim(game,x),jumpHeld:true});if(game.player.grounded)return;}
  assert.fail('Jump did not land');
}
function firstPlate(game){walkTo(game,210);jumpTo(game,290);assert.equal(game.player.y,455);walkTo(game,300);jumpTo(game,450);assert.equal(game.player.y,390);walkTo(game,500);}
function runUntil(game,x,limit=600){for(let i=0;i<limit&&game.player.x<x;i++)game.update({right:true});assert.ok(game.player.x>=x-1,`Run stopped at ${game.player.x}`);}

// These exercise the real continuous simulation rather than moving the actor by hand.
test('running accelerates continuously and stops on release',()=>{
  const game=new Adventure();game.update({right:true});assert.ok(game.player.x>100&&game.player.x<105);
  frames(game,20,{right:true});assert.equal(game.player.vx,PHYSICS.speed);
  frames(game,15);assert.equal(game.player.vx,0);assert.equal(game.player.y,terrainY(game.level,game.player.x));
});
test('jump has an airborne arc and lands exactly on a surface',()=>{
  const game=new Adventure();game.update({jumpPressed:true,jumpHeld:true});assert.ok(!game.player.grounded&&game.player.vy<0);
  let highest=game.player.y;for(let i=0;i<90;i++){game.update({jumpHeld:true});highest=Math.min(highest,game.player.y);}
  assert.ok(highest<410);assert.equal(game.player.y,510);assert.equal(game.player.grounded,true);
});
test('releasing jump early makes a smaller leap; held jump never repeats automatically',()=>{
  const heights=[];
  for(const held of [false,true]){const game=new Adventure();game.update({jumpPressed:true,jumpHeld:held});let min=510;for(let i=0;i<120;i++){game.update({jumpHeld:held});min=Math.min(min,game.player.y);}heights.push(min);assert.equal(game.player.grounded,true);}
  assert.ok(heights[0]>heights[1]+35);
});
test('a second jump cannot be triggered in midair',()=>{
  const game=new Adventure();game.update({jumpPressed:true,jumpHeld:true});frames(game,20,{jumpHeld:true});const before=game.player.vy;game.update({jumpPressed:true,jumpHeld:true});assert.ok(game.player.vy>before);
});
test('jump buffer fires on landing',()=>{
  const game=new Adventure();game.update({jumpPressed:true,jumpHeld:true});
  while(game.player.vy<0||game.player.y<495)game.update({jumpHeld:true});
  game.update({jumpPressed:true,jumpHeld:true});let jumpedAgain=false;
  for(let i=0;i<10;i++)if(game.update({jumpHeld:true}).includes('jump'))jumpedAgain=true;
  assert.ok(jumpedAgain);
});
test('the first two ledges and striped plate can be reached with actual jumps',()=>{
  const game=new Adventure();firstPlate(game);assert.equal(game.pressed('A'),true);
});
test('creating an Echo preserves the player, world time and existing logs',()=>{
  const game=new Adventure();firstPlate(game);const player={...game.player},tick=game.tick,phase=game.logStacks.get(980).phase;
  assert.equal(game.commit().ok,true);assert.deepEqual(game.player,player);assert.equal(game.tick,tick);assert.equal(game.logStacks.get(980).phase,phase);
  assert.equal(game.echoPosition(game.echoes[0]).x,game.echoes[0].frames[0].x);assert.notEqual(game.echoPosition(game.echoes[0]).x,game.player.x);
});
test('an Echo replays from its own birth tick, holds, then releases its plate',()=>{
  const game=new Adventure();firstPlate(game);const count=game.recording.length;game.commit();const echo=game.echoes[0];
  walkTo(game,600);while(game.tick-echo.startTick<count-1)game.update();
  assert.equal(game.pressed('A'),true);assert.equal(game.echoPosition(echo).y,390);assert.equal(game.echoPosition(echo).vx,0);
  frames(game,ECHO_HOLD_TICKS+1);assert.equal(game.dead,false);assert.equal(game.pressed('A'),false);assert.equal(game.echoActive(echo),false);
});
test('recorded frames stay immutable across retries and excess Echoes are rejected',()=>{
  const game=new Adventure();assert.equal(game.commit().reason,'empty');firstPlate(game);game.commit();const recording=JSON.stringify(game.echoes[0].frames);
  frames(game,30,{right:true});game.restartTake();assert.equal(JSON.stringify(game.echoes[0].frames),recording);assert.equal(game.echoes[0].startTick,0);frames(game,15);assert.equal(game.commit().reason,'limit');
  const position={...game.player};assert.equal(game.removeEcho(),true);assert.deepEqual(game.player,position);
});
test('airborne recordings cannot be committed',()=>{
  const game=new Adventure();frames(game,15);game.update({jumpPressed:true,jumpHeld:true});assert.equal(game.commit().reason,'air');
});
test('waiting before the first movement does not fill the recording',()=>{
  const game=new Adventure();frames(game,1800);assert.equal(game.recording.length,1);frames(game,30,{right:true});assert.ok(game.recording.length>12);assert.equal(game.commit().ok,true);
});
test('a stacked pile blocks movement and a replaying Echo scatters it',()=>{
  const game=new Adventure();firstPlate(game);game.commit();const echo=game.echoes[0];walkTo(game,600);
  while(game.tick-echo.startTick<echo.frames.length)game.update();assert.ok(game.pileCleared(game.level.logPiles[0]));
  const closed=new Adventure();closed.player.x=930;frames(closed,120,{right:true});assert.ok(closed.player.x<=980-PHYSICS.width/2);
});
test('death pauses before a safe checkpoint respawn and preserves the recorded frames',()=>{
  const game=new Adventure();firstPlate(game);game.commit();const recording=JSON.stringify(game.echoes[0].frames);game.player.x=810;game.player.y=940;game.player.vy=900;
  assert.ok(game.update().includes('death'));assert.equal(game.dead,true);assert.notEqual(game.player.x,100);
  for(let i=0;i<130&&game.dead;i++)game.update();
  assert.equal(game.dead,false);assert.equal(game.player.x,100);assert.equal(game.tick,0);assert.equal(JSON.stringify(game.echoes[0].frames),recording);assert.equal(game.echoes[0].startTick,0);
});
test('seed pickup is persistent across a retry and reset clears it',()=>{
  const game=new Adventure();game.player.x=285;game.player.y=441;game.player.grounded=false;
  assert.ok(game.update().includes('seed'));assert.equal(game.seeds.size,1);game.restartTake();assert.equal(game.seeds.size,1);game.reset();assert.equal(game.seeds.size,0);
});
test('the grove remembers a route without mutating an active scene',()=>{
  const memory={lastRoute:'high'},game=new Adventure(2,memory),geometry=JSON.stringify(game.level);memory.lastRoute='low';assert.equal(JSON.stringify(game.level),geometry);
  assert.equal(game.section.blockedRoute,'high');assert.equal(createLevel(2,memory).blockedRoute,'low');
});

function finishCurrentSection(game){
  const section=game.section,start=section.start,index=section.index;
  walkTo(game,section.plates[0].x);assert.ok(game.pressed(section.plates[0].id));assert.equal(game.commit().ok,true);
  walkTo(game,start+600);const echo=game.echoes[0];
  const safeAfter=echo.frames.length+Math.ceil((section.trap.windup+(section.trap.waves-1)*.24+.6)/STEP);
  while(game.tick-echo.startTick<safeAfter){game.update();assert.equal(game.dead,false,'cover must stop the volley');}
  const gap=index===1?[720,880,1590,1740]:index===2?[760,900,1540,1690]:[740,900,1530,1680];
  runUntil(game,start+gap[0]-30);jumpTo(game,start+gap[1]+65);
  runUntil(game,start+1280);
  if(index===2&&section.blockedRoute==='low'){jumpTo(game,start+1425);runUntil(game,start+1505);}
  else if(index===2)runUntil(game,start+1500);
  else runUntil(game,start+gap[2]-40);
  jumpTo(game,start+gap[3]+70);
  if(index===1){runUntil(game,start+1950);jumpTo(game,start+2110);}
  if(index===2&&section.blockedRoute==='high'){runUntil(game,start+2010);jumpTo(game,start+2165);}
  runUntil(game,section.end);
}
for(const index of [0,1,2])for(const route of index===2?['high','low']:['low']){
  test('section '+(index+1)+' reaches its flag with real movement ('+route+' memory)',()=>{
    const game=new Adventure(index,{lastRoute:route});finishCurrentSection(game);
    assert.ok(game.completed.includes(index));assert.equal(game.won,index===2);
    if(index<2){assert.equal(game.activeIndex,index+1);assert.ok(game.player.vx>0);assert.ok(game.player.x>=game.section.start);}
  });
}
test('all three sections form one playable continuous run',()=>{
  const game=new Adventure();
  for(let i=0;i<3;i++){
    finishCurrentSection(game);
    if(i<2){assert.equal(game.won,false);game.retireBehind((i+1)*2400);}
  }
  assert.equal(game.won,true);assert.deepEqual(game.completed,[0,1,2]);assert.equal(game.memory.completed,3);
});
test('a big closed log pile cannot be bypassed with repeated jumps',()=>{
  const game=new Adventure(),pile=game.level.logPiles[0];game.player.x=pile.x-65;game.player.y=510;
  for(let i=0;i<500;i++)game.update({right:true,jumpPressed:i%65===0,jumpHeld:true});
  assert.ok(game.player.x<=pile.x-PHYSICS.width/2);assert.ok(pile.h>PHYSICS.jump**2/(2*PHYSICS.gravity));
});
test('completed scenery retires only once entirely behind the view, and locks backtracking',()=>{
  const game=new Adventure();finishCurrentSection(game);
  game.retireBehind(2399);assert.equal(game.sections[0].retired,false);assert.equal(game.cameraFloor,0);
  game.retireBehind(2400);assert.equal(game.sections[0].retired,true);assert.equal(game.cameraFloor,2400);
  assert.ok(game.level.plates.every(p=>p.section!==0));assert.ok(game.level.ground.every(g=>g.x>=2400));
  frames(game,200,{left:true});assert.ok(game.player.x>=2417);assert.equal(game.activeIndex,1);
  game.restartTake();assert.equal(game.player.x,2500);assert.equal(game.cameraFloor,2400);
});

test('recording is a rolling eight-second window, including recent waits',()=>{
  const game=new Adventure();frames(game,20,{right:true});frames(game,1000);assert.equal(game.recording.length,ECHO_TICKS+1);assert.equal(game.recording[0].x,game.player.x);assert.equal(game.commit().ok,true);assert.equal(game.echoes[0].frames.length,ECHO_TICKS+1);
});
test('an expired clone frees its slot for another recording without moving the hamster',()=>{
  const game=new Adventure();firstPlate(game);game.commit();const echo=game.echoes[0];walkTo(game,600);
  while(game.tick-echo.startTick<=echo.lifetime)game.update();assert.equal(game.dead,false);assert.equal(game.echoActive(echo),false);
  const before={...game.player};assert.equal(game.commit().ok,true);assert.equal(game.echoes.length,1);assert.deepEqual(game.player,before);
});
test('logs rebuild after an Echo releases the plate; retry restores the stack',()=>{
  const game=new Adventure();firstPlate(game);game.commit();const echo=game.echoes[0],pile=game.level.logPiles[0];walkTo(game,600);
  while(game.tick-echo.startTick<echo.frames.length+5)game.update();assert.equal(game.pileCleared(pile),true);
  while(game.tick-echo.startTick<echo.lifetime+55)game.update();assert.equal(game.dead,false);assert.equal(game.pressed('A'),false);assert.equal(game.pileCleared(pile),false);
  game.restartTake();assert.equal(game.pileCleared(pile),false);
});
