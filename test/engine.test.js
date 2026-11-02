import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, CHAPTERS, PHYSICS, STEP, createLevel, ECHO_TICKS, ECHO_REPLAY_TICKS, ECHO_HOLD_TICKS, terrainY, SECTION_LENGTH, logTouchesActor } from '../src/engine.js';

function frames(game,count,input={}){for(let i=0;i<count;i++)game.update(typeof input==='function'?input(i):input);}
function aim(game,x){
  const distance=x-game.player.x,stopping=game.player.vx**2/(2*2800)+3;
  if(game.player.grounded&&Math.sign(game.player.vx)===Math.sign(distance)&&Math.abs(distance)<stopping)return{};
  return{right:distance>2,left:distance< -2,walk:game.player.grounded&&Math.abs(distance)<70};
}
function walkTo(game,x,limit=600){
  for(let i=0;i<limit;i++){game.update(aim(game,x));assert.equal(game.dead,false,`Walking to ${x} must survive`);if(Math.abs(game.player.x-x)<3&&Math.abs(game.player.vx)<25)return;}
  assert.fail(`Could not walk to ${x}; at ${game.player.x}, ${game.player.y}`);
}
function jumpTo(game,x){
  game.update({...aim(game,x),jumpPressed:true,jumpHeld:true});
  for(let i=0;i<100;i++){game.update({...aim(game,x),jumpHeld:true});assert.equal(game.dead,false,`Jumping to ${x} must survive`);if(game.player.grounded)return;}
  assert.fail('Jump did not land');
}
function firstPlate(game){walkTo(game,210);jumpTo(game,290);assert.equal(game.player.y,455);walkTo(game,300);jumpTo(game,450);assert.equal(game.player.y,390);walkTo(game,500);}
function runUntil(game,x,limit=600){for(let i=0;i<limit&&game.player.x<x;i++){game.update({right:true});assert.equal(game.dead,false,`Running to ${x} must survive`);}assert.ok(game.player.x>=x-1,`Run stopped at ${game.player.x}`);}
function waitForEchoVolley(game,plate){
  for(let i=0;i<260;i++){game.update();assert.equal(game.dead,false,'shelter must remain safe during the replayed volley');
    if(game.echoes.some(e=>game.echoActive(e)&&game.onPlate(game.echoPosition(e),plate))&&!game.attacks.length&&!game.projectiles.some(log=>log.hostile))return;
  }assert.fail('The Echo volley must finish while its switch is still held');
}

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
  const game=new Adventure();firstPlate(game);game.commit();const echo=game.echoes[0],count=echo.frames.length;
  walkTo(game,600);while(game.tick-echo.startTick<count-1)game.update();
  assert.equal(game.pressed('A'),true);assert.equal(game.echoPosition(echo).y,390);assert.equal(game.echoPosition(echo).vx,0);
  frames(game,ECHO_HOLD_TICKS+1);assert.equal(game.dead,false);assert.equal(game.pressed('A'),false);assert.equal(game.echoActive(echo),false);
});
test('recorded frames stay immutable across retries and excess Echoes are rejected',()=>{
  const game=new Adventure();assert.equal(game.commit().reason,'empty');firstPlate(game);game.commit();const recording=JSON.stringify(game.echoes[0].frames);
  frames(game,30,{right:true});game.restartTake();assert.equal(JSON.stringify(game.echoes[0].frames),recording);assert.equal(game.echoes[0].startTick,0);frames(game,15);assert.equal(game.commit().ok,true);assert.equal(game.commit().reason,'limit');
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
  const closed=new Adventure();closed.player.x=930;frames(closed,120,{right:true});assert.ok(closed.player.x<1000);assert.ok(closed.logStacks.get(980).homes.every(log=>!logTouchesActor(log,closed.player)));
});
test('death clears the Echo and recording immediately, then respawns at the checkpoint',()=>{
  const game=new Adventure();firstPlate(game);game.commit();game.player.x=810;game.player.y=940;game.player.vy=900;
  assert.ok(game.update().includes('death'));assert.equal(game.dead,true);assert.notEqual(game.player.x,100);
  assert.equal(game.echoes.length,0);assert.equal(game.recording.length,1);assert.equal(game.recordingStarted,false);
  for(let i=0;i<130&&game.dead;i++)game.update();
  assert.equal(game.dead,false);assert.equal(game.player.x,100);assert.equal(game.tick,0);assert.equal(game.echoes.length,0);assert.equal(game.recording.length,1);
});
test('floating collectibles are removed from every trail',()=>{
  const game=new Adventure();assert.deepEqual(game.level.seeds,[]);for(let i=0;i<CHAPTERS.length;i++)assert.deepEqual(createLevel(i).seeds,[]);
});
test('levels two and three share the ledge layout, with a retreat hole added to the third',()=>{
  const second=createLevel(1),third=createLevel(2),local=(items,start)=>items.map(p=>({...p,x:p.x-start,section:0}));
  assert.deepEqual(local(second.ground,second.start),local(third.ground,third.start));
  assert.deepEqual(local(second.terraces,second.start),local(third.terraces,third.start));
  assert.equal(second.holes.length,0);assert.equal(third.holes.length,1);
});

test('every section contains three separate Echo puzzles with matching unique switch marks',()=>{
  const ids=new Set();
  for(let index=0;index<3;index++){
    const level=createLevel(index);assert.equal(level.plates.length,3);assert.equal(level.logPiles.length,3);
    for(let i=0;i<3;i++){const plate=level.plates[i],pile=level.logPiles[i];assert.equal(terrainY(level,plate.x),plate.y);assert.deepEqual(pile.requires,[plate.id]);assert.ok(!ids.has(plate.id));ids.add(plate.id);assert.ok(pile.x>plate.x+250);}
  }
});

test('death flings the body backward, flickers it, then removes it before respawn',()=>{
  const game=new Adventure();game.player.x=1900;game.player.facing=1;game.kill('fall');const x=game.deathBody.x,y=game.deathBody.y;
  frames(game,12);assert.ok(game.deathBody.x<x-20);assert.ok(game.deathBody.y<y);assert.notEqual(game.deathBody.angle,0);
  const opacity=new Set();for(let i=0;i<35;i++){game.update();opacity.add(game.deathBody.opacity);}assert.deepEqual([...opacity].sort(),[0,1]);
  frames(game,12);assert.equal(game.dead,true);assert.equal(game.deathBody.opacity,0);assert.equal(game.echoes.length,0);
  while(game.dead)game.update();assert.equal(game.deathBody,null);assert.equal(game.player.x,100);
});

function finishCurrentSection(game){
  const section=game.section,start=section.start,index=section.index;
  if(index===3){finishFourthSection(game);return;}
  if(index===4){finishFifthSection(game);return;}
  if(index===0){
    walkTo(game,500);game.commit();runUntil(game,710);jumpTo(game,970);runUntil(game,1490);jumpTo(game,1750);
  }else{
  walkTo(game,start+520);jumpTo(game,start+690);assert.equal(game.commit().ok,true);
  if(index===1){frames(game,9);while(game.player.x>start+625){game.update({left:true});assert.equal(game.dead,false);}}
  else{frames(game,18);jumpTo(game,start+480);assert.ok(section.holes[0].open);}
  waitForEchoVolley(game,section.plates[0]);
  if(index===1){jumpTo(game,start+490);walkTo(game,start+520);jumpTo(game,start+690);}
  else{walkTo(game,start+490);jumpTo(game,start+700);}
  walkTo(game,start+720);jumpTo(game,start+950);runUntil(game,start+1280);runUntil(game,start+1570);jumpTo(game,start+1800);
  }
  // The middle switch requires a fresh clip and, in later sections, a quick jump dodge.
  walkTo(game,start+1800);game.resetEcho();walkTo(game,start+1840);assert.equal(game.commit().ok,true);
  frames(game,8);jumpTo(game,start+1840);runUntil(game,start+2010);
  for(let i=0;i<300&&!game.pileCleared(section.logPiles[1]);i++){game.update();assert.equal(game.dead,false);}
  assert.equal(game.pileCleared(section.logPiles[1]),true);runUntil(game,start+2440);
  runUntil(game,start+(index===0?2580:2540));jumpTo(game,start+2810);
  // The final perch must be held by a different Echo during the long creek crossing.
  walkTo(game,start+3080);game.resetEcho();walkTo(game,start+(index===0?3130:3124));assert.equal(game.commit().ok,true);
  if(index>0){walkTo(game,start+2970);waitForEchoVolley(game,section.plates[2]);walkTo(game,start+3130);}else frames(game,8);
  jumpTo(game,start+3200);runUntil(game,start+(index===0?3290:3260));jumpTo(game,start+3540);
  for(let i=0;i<300&&!game.pileCleared(section.logPiles[2]);i++){game.update();assert.equal(game.dead,false);}
  assert.equal(game.pileCleared(section.logPiles[2]),true);runUntil(game,section.end);
}
for(const index of [0,1,2])for(const route of index===2?['high','low']:['low']){
  test('section '+(index+1)+' reaches its flag with real movement ('+route+' memory)',()=>{
    const game=new Adventure(index,{lastRoute:route},()=>0);finishCurrentSection(game);
    assert.ok(game.completed.includes(index));assert.equal(game.won,false);
    assert.equal(game.activeIndex,index+1);assert.ok(game.player.vx>0);assert.ok(game.player.x>=game.section.start);
  });
}
function waitForLinkedEchoes(game,bridge){
  for(let i=0;i<620;i++){
    game.update();assert.equal(game.dead,false);
    if(bridge.progress===1&&bridge.requires.every(id=>game.echoes.some(e=>game.echoActive(e)&&game.onPlate(game.echoPosition(e),game.level.plates.find(p=>p.id===id)))))return;
  }assert.fail('Both Echoes must hold the linked switches long enough to cross');
}
function finishFourthSection(game){
  const start=game.section.start;
  walkTo(game,start+480);assert.equal(game.commit().ok,true);walkTo(game,start+740);assert.equal(game.commit().ok,true);
  waitForLinkedEchoes(game,game.section.bridges[0]);runUntil(game,start+1490);
  game.resetEcho();walkTo(game,start+1550);assert.equal(game.commit().ok,true);
  walkTo(game,start+1755);
  for(let i=0;i<360;i++){game.update();assert.equal(game.dead,false,'the shed must protect the hamster through both returning waves');}
  assert.ok(game.projectiles.every(log=>!['outbound','waiting','returning'].includes(log.stage)));
  walkTo(game,start+2210);assert.equal(game.commit().ok,true);
  waitForLinkedEchoes(game,game.section.bridges[1]);runUntil(game,start+2820);
  game.resetEcho();walkTo(game,start+2980);jumpTo(game,start+3100);assert.equal(game.commit().ok,true);
  frames(game,9);while(game.player.x>start+3055){game.update({left:true});assert.equal(game.dead,false);}
  waitForEchoVolley(game,game.section.plates.find(p=>p.id==='D6'));assert.equal(game.dead,false);jumpTo(game,start+2970);jumpTo(game,start+3100);
  walkTo(game,start+3130);runUntil(game,start+3900);jumpTo(game,start+4200);
  game.resetEcho();walkTo(game,start+4370);assert.equal(game.commit().ok,true);
  for(let i=0;i<200&&!game.pileCleared(game.section.logPiles[2]);i++)game.update();runUntil(game,start+5000);
  const fourth=game.section;game.resetEcho();walkTo(game,start+5980);assert.equal(game.commit().ok,true);
  for(let i=0;i<600&&!fourth.exit.caught;i++){game.update();assert.equal(game.dead,false);}
  assert.equal(fourth.exit.caught,true);walkTo(game,start+5910);assert.equal(game.activeIndex,4);assert.equal(game.won,false);
}
test('the fourth trail teaches two linked crossings before trapping and catching the runaway flag',()=>{finishFourthSection(new Adventure(3));});

test('respawn folds the linked bridges and restores the runaway flag with no pending attacks',()=>{
  const game=new Adventure(3),flag=game.section.exit;
  for(const bridge of game.section.bridges)bridge.progress=1;
  Object.assign(flag,{x:flag.maxX,running:false,caught:true});
  game.kill('fall');for(let tick=0;tick<130&&game.dead;tick++)game.update();
  assert.equal(game.dead,false);assert.ok(game.section.bridges.every(bridge=>bridge.progress===0));
  assert.equal(flag.x,flag.homeX);assert.equal(flag.caught,false);assert.equal(flag.running,false);
  assert.equal(game.projectiles.length,0);assert.equal(game.attacks.length,0);assert.equal(game.echoes.length,0);
});

function finishFifthSection(game){
  const fifth=game.section,start=fifth.start;
  for(const [i,base]of [0,2720,5610].entries()){
    walkTo(game,start+base+550);if(i!==2)game.resetEcho();walkTo(game,start+base+570);frames(game,15);
    walkTo(game,start+base+650);assert.equal(game.commit().ok,true);
    walkTo(game,start+(i===1?2295:base+430));
    for(let tick=0;tick<600&&(!fifth.fences[i].broken||['warning','charge'].includes(fifth.geese[i].phase));tick++){game.update();assert.equal(game.dead,false,'raised grass must protect the hamster from the goose');}
    assert.equal(fifth.fences[i].broken,true);assert.ok(!['warning','charge'].includes(fifth.geese[i].phase));
    runUntil(game,start+base+1800);
    if(i===1){const bush=fifth.bushes.find(b=>!b.berries);game.resetEcho();walkTo(game,bush.homeX-110);assert.equal(game.commit().ok,true);jumpTo(game,bush.homeX+110);}
    if(i<2){runUntil(game,start+(i===0?1840:5400));jumpTo(game,start+(i===0?2110:5670));}
  }
  runUntil(game,fifth.end);assert.equal(game.won,true);
}
test('the goose trail is playable using recorded bell decoys, raised cover, and both Echoes in the finale',()=>{finishFifthSection(new Adventure(4,{},()=>0));});

test('the longer fourth level retains three log puzzles, both bridges, and level-three log mechanics',()=>{
  const game=new Adventure(3),fourth=game.section,third=createLevel(2);
  assert.equal(fourth.end-fourth.start,6000);assert.ok(fourth.end-fourth.start>third.end-third.start);assert.equal(game.level.width,game.sections.at(-1).end+300);
  assert.equal(third.logPiles.length,3);assert.equal(fourth.logPiles.length,3);assert.equal(fourth.bridges.length,2);
  for(const pile of fourth.logPiles)assert.ok(pile.requires.every(id=>fourth.plates.some(plate=>plate.id===id)));
  for(const bridge of fourth.bridges){bridge.progress=0;assert.equal(terrainY(game.level,bridge.x-.01),bridge.y);assert.equal(terrainY(game.level,bridge.x+bridge.w+.01),bridge.y);}
});

test('linked bridges need both switches, have no floor before fully lowered, and close when an Echo expires',()=>{
  const game=new Adventure(3),bridge=game.section.bridges[0],plates=bridge.requires.map(id=>game.level.plates.find(p=>p.id===id));
  const hold=(plate,id)=>({id,slot:id-1,startTick:game.tick,lifetime:600,frames:[{...game.player,x:plate.x,y:plate.y}]});
  game.echoes=[hold(plates[0],1)];frames(game,50);assert.equal(bridge.progress,0);assert.equal(terrainY(game.level,bridge.x+200),null);
  game.echoes.push(hold(plates[1],2));frames(game,12);assert.ok(bridge.progress>0&&bridge.progress<1);assert.equal(terrainY(game.level,bridge.x+200),null);
  frames(game,30);assert.equal(terrainY(game.level,bridge.x+200),510);
  game.echoes[0].lifetime=game.tick-game.echoes[0].startTick;game.update();assert.ok(bridge.progress<1);assert.equal(terrainY(game.level,bridge.x+200),null);
  game.restartTake();assert.equal(bridge.progress,0);
});

test('the flag escapes without a snare and cannot be bypassed at the old finish boundary',()=>{
  const game=new Adventure(3),flag=game.section.exit;
  Object.assign(game.player,{x:flag.homeX-100,y:510,grounded:true});game.update();assert.equal(flag.running,true);assert.ok(flag.x>flag.homeX);
  frames(game,200);assert.equal(flag.caught,false);assert.ok(flag.x>=flag.minX&&flag.x<=flag.maxX);
  game.player.x=game.section.end+60;game.update();assert.equal(game.won,false);
  const plate=game.section.plates.find(p=>p.id===flag.requires);
  game.echoes=[{id:1,slot:0,startTick:game.tick,lifetime:600,frames:[{...game.player,x:plate.x,y:plate.y,grounded:true}]}];
  for(let i=0;i<260&&!flag.caught;i++)game.update();assert.equal(flag.caught,true);assert.equal(flag.x,flag.trapX);assert.equal(game.won,false);
  game.resetEcho();frames(game,30);assert.equal(flag.caught,true);game.restartTake();assert.equal(flag.x,flag.homeX);assert.equal(flag.caught,false);assert.equal(flag.running,false);
});

test('all five sections form one playable continuous run',()=>{
  const game=new Adventure(0,{},()=>0);
  for(let i=0;i<CHAPTERS.length;i++){
    finishCurrentSection(game);
    if(i<CHAPTERS.length-1){assert.equal(game.won,false);game.retireBehind(game.sections[i].end);}
  }
  assert.equal(game.won,true);assert.deepEqual(game.completed,[0,1,2,3,4]);assert.equal(game.memory.completed,5);
});
test('a big closed log pile cannot be bypassed with repeated jumps',()=>{
  const game=new Adventure(),pile=game.level.logPiles[0];game.player.x=pile.x-65;game.player.y=510;
  for(let i=0;i<500;i++)game.update({right:true,jumpPressed:i%65===0,jumpHeld:true});
  assert.ok(game.player.x<pile.x+pile.w/2);assert.ok(game.logStacks.get(pile.x).homes.every(log=>!logTouchesActor(log,game.player)));assert.ok(pile.h>PHYSICS.jump**2/(2*PHYSICS.gravity));
});
test('a closed log pile is not a climbable platform',()=>{
  const game=new Adventure(),pile=game.level.logPiles[0];
  game.player.x=pile.x+pile.w/2;game.player.y=300;game.player.grounded=false;game.player.vy=0;
  for(let i=0;i<90;i++)game.update();
  assert.equal(game.player.y,terrainY(game.level,game.player.x));
  assert.equal(game.player.grounded,true);
});
test('completed scenery retires only once entirely behind the view, and locks backtracking',()=>{
  const game=new Adventure();finishCurrentSection(game);
  game.retireBehind(SECTION_LENGTH-1);assert.equal(game.sections[0].retired,false);assert.equal(game.cameraFloor,0);
  game.retireBehind(SECTION_LENGTH);assert.equal(game.sections[0].retired,true);assert.equal(game.cameraFloor,SECTION_LENGTH);
  assert.ok(game.level.plates.every(p=>p.section!==0));assert.ok(game.level.ground.every(g=>g.x>=SECTION_LENGTH));
  frames(game,200,{left:true});assert.ok(game.player.x>=SECTION_LENGTH+17);assert.equal(game.activeIndex,1);
  game.restartTake();assert.equal(game.player.x,SECTION_LENGTH+100);assert.equal(game.cameraFloor,SECTION_LENGTH);
});
test('levels four and five save a halfway checkpoint for death respawns',()=>{
  for(const index of [3,4]){
    const game=new Adventure(index),half=game.section.checkpoint.x;
    assert.equal(game.player.x,game.section.spawn.x);
    Object.assign(game.player,{x:half+1,y:terrainY(game.level,half+1)??510,grounded:true});game.update();
    assert.equal(game.checkpoint.x,half);
    game.kill('fall');while(game.dead)game.update();
    assert.equal(game.player.x,half);assert.equal(game.player.y,game.checkpoint.y);
    game.reset();assert.equal(game.player.x,game.section.spawn.x);
  }
});

test('Echoes replay the last three seconds at the original speed, including recorded waits',()=>{
  const game=new Adventure();frames(game,20,{right:true});frames(game,1000);frames(game,20,{left:true});
  assert.equal(game.recording.length,ECHO_TICKS+1);const recent=game.recording.slice(-ECHO_REPLAY_TICKS-1).map(frame=>({...frame})),player={...game.player};
  assert.equal(game.commit().ok,true);const echo=game.echoes[0];assert.deepEqual(echo.frames,recent);assert.deepEqual(game.player,player);
  for(let i=0;i<=ECHO_REPLAY_TICKS;i++){assert.deepEqual(game.echoPosition(echo),i===ECHO_REPLAY_TICKS?{...recent[i],vx:0,vy:0,landing:0}:recent[i]);game.update();}
  assert.equal(game.echoPosition(echo).x,player.x);
});

test('an Echo replays its approach to a switch rather than spawning on the current button',()=>{
  const game=new Adventure();firstPlate(game);const plate=game.section.plates[0],pile=game.section.logPiles[0];
  const recording=game.recording.map(p=>({...p}));assert.equal(game.commit().ok,true);const echo=game.echoes[0];assert.equal(game.onPlate(game.echoPosition(echo),plate),false);
  assert.deepEqual(echo.frames,recording);walkTo(game,600);assert.equal(game.onPlate(game.player,plate),false);
  while(game.tick-echo.startTick<echo.frames.length-1)game.update();assert.equal(game.pressed(plate.id),true);assert.equal(game.pileCleared(pile),true);
});

test('Vanish frees both slots immediately while a new clip starts without moving the player',()=>{
  const game=new Adventure();firstPlate(game);game.commit();walkTo(game,600);game.commit();assert.equal(game.echoes.length,2);
  const player={...game.player},tick=game.tick,stack=game.logStacks.get(980),phase=stack.phase,clip=game.echoClip().map(p=>({...p}));
  game.resetEcho();assert.equal(game.echoes.length,0);assert.deepEqual(game.player,player);assert.equal(game.tick,tick);assert.equal(stack.phase,phase);
  assert.equal(game.recording.length,1);assert.equal(game.commit().ok,true);assert.deepEqual(game.echoes[0].frames,clip);assert.equal(game.commit().ok,true);
  game.resetEcho();game.resetEcho();assert.equal(game.echoes.length,0);assert.equal(game.commit().ok,true);
  frames(game,16,{left:true});assert.equal(game.commit().ok,true);assert.equal(game.echoes[1].frames[0].x,player.x);
  game.kill('logs');assert.equal(game.echoFallback,null);assert.equal(game.echoRecording.length,1);
  game.restartTake();assert.equal(game.echoRecording.length,1);assert.equal(game.commit().reason,'empty');
});

test('Vanish can immediately reuse the full three-second recording without inventing new actions',()=>{
  const game=new Adventure();firstPlate(game);frames(game,ECHO_TICKS+50);assert.equal(game.recording.length,ECHO_TICKS+1);
  game.commit();game.resetEcho();assert.equal(game.recording.length,1);assert.equal(game.commit().ok,true);
  const echo=game.echoes[0];assert.ok(echo.frames.length<=ECHO_REPLAY_TICKS+1);
  assert.equal(game.onPlate(game.echoPosition(echo),game.section.plates[0]),true);
  frames(game,20,{right:true});assert.equal(game.onPlate(game.player,game.section.plates[0]),false);assert.equal(game.pressed('A'),true);
});

test('two Echoes replay independently and the earlier slot becomes available when it expires',()=>{
  for(const index of [0,1,2])assert.equal(createLevel(index).limit,2);
  const game=new Adventure();frames(game,30,{right:true});assert.equal(game.commit().ok,true);const first=game.echoes[0];
  frames(game,45);assert.equal(game.commit().ok,true);const second=game.echoes[1];
  assert.deepEqual(game.echoes.map(e=>e.slot),[0,1]);assert.notEqual(first.startTick,second.startTick);assert.equal(game.commit().reason,'limit');
  while(game.echoActive(first))game.update();assert.equal(game.echoActive(second),true);
  const player={...game.player};assert.equal(game.commit().ok,true);assert.deepEqual(game.player,player);assert.deepEqual(game.echoes.map(e=>e.slot),[1,0]);assert.equal(game.echoes[0],second);
  game.kill('fall');assert.equal(game.echoes.length,0);
});

test('the steep grassy bank supports walking uphill and downhill without falling into the soil',()=>{
  for(const walk of [false,true])for(const right of [false,true]){
    const game=new Adventure(1),start=game.section.start;
    Object.assign(game.player,{x:start+(right?480:575),y:terrainY(game.level,start+(right?480:575)),vx:0,vy:0,grounded:true});
    for(let i=0;i<(walk?45:22);i++){
      game.update({right,left:!right,walk});assert.equal(game.dead,false);assert.equal(game.player.grounded,true);assert.equal(game.player.y,terrainY(game.level,game.player.x));
    }
    assert.ok(right?game.player.x>start+540:game.player.x<start+520);
  }
});

test('the repaired descent takes multiple gradual steps instead of snapping down the bank',()=>{
  const game=new Adventure(1),start=game.section.start;Object.assign(game.player,{x:start+510,y:430,vx:PHYSICS.speed});
  let descending=0,largest=0,previous=game.player.y;
  for(let i=0;i<35;i++){
    game.update({right:true});const delta=game.player.y-previous;if(delta>0){descending++;largest=Math.max(largest,delta);}previous=game.player.y;
    assert.equal(game.dead,false);assert.ok(game.player.y<=terrainY(game.level,game.player.x)+.001);
  }
  assert.ok(descending>=15);assert.ok(largest<7);assert.equal(game.player.y,510);
});

test('a genuinely steep downstroke uses gravity and lands once without entering solid soil',()=>{
  for(const dt of [STEP,1/30]){
    const game=new Adventure(1),start=game.section.start;game.section.mounds[0].rampRight=20;
    Object.assign(game.player,{x:start+520,y:430,vx:PHYSICS.speed});let airborne=false,landings=0,previous=430,largest=0;
    for(let i=0;i<Math.ceil(.55/dt);i++){
      const events=game.update({right:true},dt);landings+=events.filter(e=>e==='land').length;airborne||=!game.player.grounded;
      largest=Math.max(largest,game.player.y-previous);previous=game.player.y;
      assert.equal(game.dead,false);assert.ok(game.player.y<=terrainY(game.level,game.player.x)+.001);
    }
    assert.ok(airborne);assert.equal(landings,1);assert.ok(largest<20);assert.equal(game.player.y,510);
  }
});

test('terrain collision recovers feet embedded in soil while actual cliff sides remain solid',()=>{
  const game=new Adventure(1),x=game.section.start+540;
  Object.assign(game.player,{x,y:terrainY(game.level,x)+25,grounded:false,vy:180});game.update();
  assert.equal(game.player.y,terrainY(game.level,game.player.x));assert.equal(game.player.grounded,true);assert.equal(game.dead,false);
  const bank=game.section.ground[1];Object.assign(game.player,{x:bank.x-19,y:570,vx:PHYSICS.speed,vy:-100,grounded:false});
  game.update({right:true,jumpHeld:true});assert.ok(game.player.x<=bank.x-PHYSICS.width/2);assert.ok(game.player.y>bank.y);
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
