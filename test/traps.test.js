import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, terrainY, groundBanks, STEP, segmentBox, SECTION_LENGTH, logAttackCover, logAttackEscape, logTouchesActor } from '../src/engine.js';
function place(game,x){Object.assign(game.player,{x,y:terrainY(game.level,x),vx:0,vy:0,grounded:true});}
function press(game,puzzle=0){place(game,game.section.plates[puzzle].x);return game.update();}
function arm(game,puzzle=0){assert.ok(press(game,puzzle).includes('warning'));}

test('the tutorial never arms attacks, even after repeats, retries and saved learning',()=>{
  const game=new Adventure(0,{echoes:30,logDeaths:10},()=>0),plate=game.section.plates[0];
  for(let i=0;i<10;i++){place(game,plate.x);game.update();place(game,plate.x+70);game.update();}
  assert.equal(game.attacks.length,0);assert.equal(game.projectiles.length,0);assert.equal(game.dead,false);
  game.projectiles.push({hostile:true});assert.equal(game.updateAttacks(STEP),false);assert.equal(game.projectiles.length,0);
  for(let i=0;i<game.section.plates.length;i++){game.restartTake();press(game,i);for(let j=0;j<45;j++)game.update();assert.equal(game.attacks.length,0);assert.equal(game.projectiles.length,0);assert.equal(game.dead,false);}
});

test('flat switches only scatter harmless debris, even when the attack roll would always pass',()=>{
  for(const index of [1,2])for(let attempt=0;attempt<3;attempt++){
    const game=new Adventure(index,{logDeaths:100},()=>0);game.restartTake();const events=press(game,1);
    assert.ok(!events.includes('warning'));assert.ok(events.includes('logs'));
    for(let i=0;i<150;i++){game.update();assert.equal(game.dead,false);assert.equal(game.attacks.length,0);assert.equal(game.projectiles.length,0);}
  }
});

test('level three first and last puzzles can attack while its flat middle switch stays harmless',()=>{
  for(const puzzle of [0,2]){
    const game=new Adventure(2,{},()=>0);arm(game,puzzle);
    for(let i=0;i<30&&!game.projectiles.length;i++)game.update();
    assert.equal(game.projectiles.length,24);assert.ok(game.projectiles.every(log=>log.hostile));
    const skipped=new Adventure(2,{},()=>.999);assert.equal(press(skipped,puzzle).includes('warning'),puzzle===0);assert.equal(skipped.attacks.length,puzzle===0?1:0);
  }
  const middle=new Adventure(2,{},()=>0);assert.ok(!press(middle,1).includes('warning'));assert.equal(middle.attacks.length,0);
});

test('level two first and final puzzles each roll their own lethal full-pile attack',()=>{
  for(const puzzle of [0,2]){
    const game=new Adventure(1,{},()=>0);arm(game,puzzle);
    for(let i=0;i<28;i++)game.update();assert.equal(game.projectiles.length,24);assert.ok(game.projectiles.every(log=>log.hostile));
    for(let i=0;i<100&&!game.dead;i++)game.update();assert.equal(game.dead,true);assert.equal(game.deathReason,'logs');
    const skipped=new Adventure(1,{},()=>.999);assert.equal(press(skipped,puzzle).includes('warning'),puzzle===0);assert.equal(skipped.attacks.length,puzzle===0?1:0);
  }
});

test('the opening grove attack requires a jumpable retreat and a solid landing beyond the hole',()=>{
  const game=new Adventure(2,{},()=>0),plate=game.section.plates[0],pile=game.section.logPiles[0],hole=game.section.holes[0];
  assert.equal(logAttackEscape(game.level,plate,pile,game.section.trap).kind,'jump');
  plate.jumpEscape.x=hole.x+hole.w/2;assert.equal(logAttackEscape(game.level,plate,pile,game.section.trap),null);
  plate.jumpEscape.x=game.section.start+50;assert.equal(logAttackEscape(game.level,plate,pile,game.section.trap),null);
});

test('each eligible shelter supports the hamster and protects it from the full volley',()=>{
  for(const [index,puzzle]of [[1,0],[1,2],[2,2]])for(const offset of [-8,0,8]){
    const game=new Adventure(index,{},()=>0),plate=game.section.plates[puzzle],pile=game.section.logPiles[puzzle],cover=logAttackCover(game.level,plate,pile,game.section.trap);
    assert.ok(cover);arm(game,puzzle);game.echoes=[{id:1,startTick:game.tick,lifetime:600,frames:[{...game.player}]}];place(game,cover.x+offset);
    for(let i=0;i<220;i++){game.update();assert.equal(game.dead,false,`Shelter for ${plate.id} must block the complete volley`);}
    assert.ok(game.projectiles.every(log=>!log.hostile));
  }
});

test('cover must be real terrain and cannot depend on a collapsing hole',()=>{
  const game=new Adventure(1,{},()=>0),plate=game.section.plates[0],pile=game.section.logPiles[0];
  assert.ok(logAttackCover(game.level,plate,pile,game.section.trap));game.level.mounds=[];game.level.terraces=[];
  assert.equal(logAttackCover(game.level,plate,pile,game.section.trap),null);assert.ok(!press(game).includes('warning'));
  const grove=new Adventure(2,{},()=>0);assert.equal(logAttackCover(grove.level,grove.section.plates[0],grove.section.logPiles[0],grove.section.trap),null);
  assert.equal(logAttackEscape(grove.level,grove.section.plates[0],grove.section.logPiles[0],grove.section.trap).kind,'jump');
});

test('an armed volley becomes harmless scatter if its shelter stops existing before launch',()=>{
  const game=new Adventure(1,{},()=>0);arm(game);game.level.mounds=[];game.level.terraces=[];
  for(let i=0;i<80;i++){game.update();assert.equal(game.dead,false);assert.equal(game.projectiles.length,0);}
  assert.equal(game.attacks.length,0);
});
test('staying exposed on the later ledge is lethal',()=>{
  const game=new Adventure(1,{},()=>0);arm(game);
  for(let i=0;i<160&&!game.dead;i++)game.update();
  assert.equal(game.dead,true);assert.equal(game.deathReason,'logs');assert.equal(game.memory.logDeaths,1);
});
test('an attack launches every log in the pile, without duplicate harmless debris',()=>{
  const game=new Adventure(1,{},()=>0);arm(game);const stack=game.logStacks.get(game.section.logPiles[0].x);
  assert.equal(stack.phase,'armed');game.attacks[0].remaining=0;game.updateAttacks(0);
  assert.equal(game.projectiles.length,stack.homes.length);assert.equal(game.projectiles.length,24);
  assert.ok(game.projectiles.every(log=>log.hostile));assert.ok(stack.logs.every(log=>log.opacity===0));
  const target=game.player;
  for(const log of game.projectiles){
    assert.ok(Math.hypot(log.vx,log.vy)>1450&&Math.hypot(log.vx,log.vy)<1900,'logs stay fast but allow a fair retreat');
    const flight=(target.x-log.x)/log.vx;
    assert.ok(flight>0&&flight<.4,'short, direct flight instead of a hanging arc');
    assert.ok(Math.abs(log.y+log.vy*flight-(target.y-34))<.01);
  }
});
test('dropping behind the ledge blocks the entire volley',()=>{
  const game=new Adventure(1,{},()=>0);arm(game);game.echoes=[{id:1,startTick:game.tick,lifetime:600,frames:[{...game.player}]}];place(game,game.section.start+620);
  for(let i=0;i<200;i++){game.update();assert.equal(game.dead,false);}
  assert.equal(game.dead,false);assert.ok(game.projectiles.every(log=>!log.hostile));
});

test('a log passing just above cover cannot hit the larger invisible box above a protected head',()=>{
  const game=new Adventure(1),x=game.section.start+648;
  Object.assign(game.player,{x,y:415,grounded:false,vx:0,vy:100});
  game.projectiles.push({x:x+84,y:330,vx:-1600,vy:-1700*STEP,angle:0,spin:0,len:72,r:18,age:0,hostile:true});
  assert.equal(game.updateAttacks(STEP),false);
});

test('the rounded edge of a log does not deal damage through an empty hitbox corner',()=>{
  const game=new Adventure(1),x=game.section.start+930;place(game,x);
  game.projectiles.push({x:x+40,y:433,vx:0,vy:-1700*STEP,angle:0,spin:0,len:36,r:18,age:0,hostile:true});
  assert.equal(game.updateAttacks(STEP),false);
});

test('the leading rounded end hits the vertical face of cover before the hamster behind it',()=>{
  const game=new Adventure(1),start=game.section.start;game.level.mounds=[];game.level.terraces=[{x:start+665,y:400,w:8,h:110}];
  Object.assign(game.player,{x:start+648,y:480,grounded:false,vx:0,vy:0});
  game.projectiles.push({x:start+720,y:440,vx:-9000,vy:-1700*STEP,angle:0,spin:0,len:72,r:18,age:0,hostile:true});
  assert.equal(game.updateAttacks(STEP),false);assert.ok(game.projectiles.every(log=>!log.hostile&&log.deflected));
});
test('recrossing the plate while the Echo holds it does not ambush the return journey',()=>{
  const game=new Adventure(1,{},()=>0);arm(game);place(game,game.section.start+620);for(let i=0;i<160;i++){game.update();assert.equal(game.dead,false);}
  const plate=game.section.plates[0];game.echoes=[{id:1,startTick:game.tick,lifetime:600,frames:[{...game.player,x:plate.x,y:plate.y}]}];game.update();
  for(let i=0;i<160;i++){game.update();assert.equal(game.dead,false);}
  place(game,game.section.plates[0].x);game.update();assert.equal(game.attacks.length,0);
});

test('joining a plate already held by an Echo never rebuilds or relaunches its scattered pile',()=>{
  for(const index of [1,2]){
    const game=new Adventure(index,{},()=>0),plate=game.section.plates[0],stack=game.logStacks.get(game.section.logPiles[0].x);
    game.echoes.push({id:1,startTick:0,lifetime:1200,frames:[{...game.player,x:plate.x,y:plate.y}]});
    assert.ok(game.update({},0).includes('warning'));assert.equal(stack.phase,'armed');
    const logs=stack.logs.map(log=>({...log}));
    place(game,plate.x);assert.ok(!game.update({},0).includes('warning'));
    assert.deepEqual(stack.logs,logs);assert.equal(game.attacks.length,1);assert.equal(game.section.trapResolved,true);
    // An Echo handing the held plate to the player is also not a second press.
    game.echoes=[];game.update({},0);assert.equal(game.attacks.length,1);
    game.attacks=[];stack.launchAttack();
    place(game,plate.x-80);game.update({},0);place(game,plate.x);
    assert.equal(game.update({},0).includes('warning'),true,'a fresh press may arm either the cover trap or the grove jump trap');
  }
});

test('hostile logs lift harmlessly, hover briefly, then burst from their floating positions',()=>{
  const game=new Adventure(1,{},()=>0);arm(game);const stack=game.logStacks.get(game.section.logPiles[0].x);
  for(let i=0;i<15;i++)game.update();
  assert.equal(stack.phase,'armed');assert.equal(game.dead,false);assert.equal(game.projectiles.length,0);
  for(const log of stack.logs)assert.ok(log.y<stack.homes[log.index].y-25);
  const poses=stack.logs.map(log=>({...log}));game.attacks[0].remaining=0;game.updateAttacks(0);
  assert.equal(game.projectiles.length,24);
  game.projectiles.forEach((log,i)=>{assert.equal(log.x,poses[i].x);assert.equal(log.y,poses[i].y);assert.equal(log.angle,poses[i].angle);});
});

test('the brief launch timer fires on schedule even when the player stays on the switch',()=>{
  const game=new Adventure(1,{},()=>0);arm(game);
  for(let i=0;i<18;i++)game.update();assert.equal(game.projectiles.length,0);assert.equal(game.dead,false);
  for(let i=0;i<10;i++)game.update();assert.ok(game.projectiles.length>0);assert.equal(game.section.trap.windup,.46);
});

test('later puzzles retain their own attack decision after the first puzzle was resolved',()=>{
  const game=new Adventure(1,{},()=>0);arm(game);game.attacks=[];game.logStacks.get(game.section.logPiles[0].x).launchAttack();
  const second=game.section.plates[2];place(game,second.x);assert.ok(game.update({},0).includes('warning'));
  assert.equal(game.attacks.length,1);assert.deepEqual(game.attacks[0].pile.requires,[second.id]);
  assert.equal(game.section.plates[0].trapResolved,true);assert.equal(second.trapResolved,true);
});
test('an eligible attack is random on the first encounter as well as retries, with no held-frame rerolls',()=>{
  let rolls=0;const game=new Adventure(1,{},()=>{rolls++;return .999;});assert.ok(!press(game,2).includes('warning'));
  for(let i=0;i<120;i++)game.update();assert.equal(rolls,1);assert.equal(game.attacks.length,0);assert.equal(game.projectiles.length,0);assert.equal(game.dead,false);
  game.restartTake();game.random=()=>0;arm(game,2);assert.equal(game.attacks.length,1);
  game.restartTake();game.random=()=>.999;assert.ok(!press(game,2).includes('warning'));assert.equal(game.attacks.length,0);
});
test('the third retreat opens an actual gap in the ground and resets on retry',()=>{
  const game=new Adventure(2,{},()=>0);press(game);place(game,game.section.start+599);game.update({left:true});
  const hole=game.section.holes[0];assert.equal(hole.open,true);assert.equal(terrainY(game.level,hole.x+hole.w/2),null);
  assert.ok(groundBanks(game.level).every(bank=>bank.x>=hole.x+hole.w||bank.x+bank.w<=hole.x));
  game.restartTake();assert.equal(hole.open,false);assert.notEqual(terrainY(game.level,hole.x+hole.w/2),null);
});
test('walking back into the third-level collapse falls through the visible hole',()=>{
  const game=new Adventure(2,{},()=>0);press(game);
  for(let i=0;i<160&&!game.dead;i++)game.update({left:true});
  assert.equal(game.section.holes[0].open,true);assert.equal(game.dead,true);assert.equal(game.deathReason,'fall');
  const hole=game.section.holes[0];assert.ok(game.player.x>hole.x&&game.player.x<hole.x+hole.w);
});
test('ordinary scattered logs do not damage the hamster',()=>{
  const game=new Adventure(),stack=game.logStacks.get(980);place(game,930);stack.update(true,0);
  for(const log of stack.logs)Object.assign(log,{x:930,y:480,vx:-800,vy:0});
  for(let i=0;i<12;i++)game.update();assert.equal(game.dead,false);
});

test('a hamster caught inside a pile when rebuilding begins is crushed and loses its Echoes',()=>{
  const game=new Adventure(),pile=game.section.logPiles[0],stack=game.logStacks.get(pile.x);
  stack.update(true,.2);place(game,pile.x+pile.w/2);
  game.echoes.push({id:99,slot:0,startTick:0,lifetime:600,frames:[{...game.player,x:100}]});
  game.update();assert.equal(game.dead,false);assert.equal(stack.newPieces.length,0);
  for(let i=0;i<15&&!game.dead;i++)game.update();assert.equal(game.dead,true);assert.ok(stack.newPieces.length>0);assert.equal(game.deathReason,'crushed');assert.equal(game.echoes.length,0);
});

test('a rebuilding pile blocks new entry from both sides throughout construction',()=>{
  for(const right of [false,true]){
    const game=new Adventure(),pile=game.section.logPiles[0],stack=game.logStacks.get(pile.x);
    stack.update(true,.2);stack.update(false,0);place(game,right?pile.x-45:pile.x+pile.w+45);
    for(let i=0;i<100;i++){
      game.update({right,left:!right});assert.equal(game.dead,false);
      assert.ok(right?game.player.x<pile.x+30:game.player.x>pile.x+pile.w-30);
      assert.ok(stack.logs.filter(log=>log.built).every(log=>!logTouchesActor(log,game.player)));
    }
  }
});

test('the empty upper corner of a rebuilding pile is safe even inside its old rectangle',()=>{
  const game=new Adventure(),pile=game.section.logPiles[0],stack=game.logStacks.get(pile.x);
  stack.update(true,.2);Object.assign(game.player,{x:pile.x+12,y:330,grounded:false,vx:0,vy:0});
  assert.ok(stack.homes.every(log=>!logTouchesActor(log,game.player)));game.update();assert.equal(stack.phase,'building');assert.equal(game.dead,false);
});

test('construction only crushes on its opening transition; later overlap is resolved without another death check',()=>{
  const game=new Adventure(),pile=game.section.logPiles[0],stack=game.logStacks.get(pile.x);
  stack.update(true,.2);stack.update(false,.4);place(game,pile.x+pile.w/2);
  game.update();assert.equal(game.dead,false);assert.ok(stack.logs.filter(log=>log.built).every(log=>!logTouchesActor(log,game.player)));
});
test('the former buried-bramble spot is safe to walk through',()=>{
  const game=new Adventure(1);place(game,game.section.start+1950);
  for(let i=0;i<70;i++){game.update({right:true});assert.equal(game.dead,false);}
  assert.ok(game.player.x>game.section.start+2100);assert.equal(game.level.thorns.length,0);
});
test('aimed log ends and fast sweeps register hits',()=>{
  const game=new Adventure(1),x=game.section.start+930;place(game,x);
  game.projectiles.push({x:x+52,y:475,vx:0,vy:0,angle:0,spin:0,len:100,r:8,age:0,hostile:true});
  assert.equal(game.updateAttacks(STEP),true);
  game.projectiles.push({x:x+70,y:478,vx:-9000,vy:0,angle:0,spin:0,len:60,r:12,age:0,hostile:true});assert.equal(game.updateAttacks(STEP),true);
  assert.equal(segmentBox({x:0,y:0},{x:20,y:0},{x:8,y:-1,w:2,h:2}),.4);
});
test('the first death message remains anchored and is restored only at that location',()=>{
  const game=new Adventure();place(game,930);game.kill('fall');const first={...game.skyMessages[0]};game.restartTake();
  place(game,1400);game.kill('fall');assert.deepEqual(game.skyMessages,[first]);
  const restored=new Adventure(0,JSON.parse(JSON.stringify(game.memory)));assert.deepEqual(restored.skyMessages,[first]);
  restored.activeIndex=1;restored.syncWorld();restored.retireBehind(SECTION_LENGTH);restored.restartTake();restored.kill('fall');assert.equal(restored.skyMessages.length,0);
});

test('the first-death message disappears forever once it leaves either camera edge',()=>{
  for(const camera of [1600,0]){
    const game=new Adventure();place(game,930);game.kill('fall');
    game.updateSkyMessages(500,1000);assert.equal(game.skyMessages.length,1);
    game.updateSkyMessages(camera,400);assert.equal(game.skyMessages.length,0);
    game.updateSkyMessages(500,1000);assert.equal(game.skyMessages.length,0);
    game.restartTake();game.kill('logs');assert.equal(game.skyMessages.length,0);
    const restored=new Adventure(0,JSON.parse(JSON.stringify(game.memory)));assert.equal(restored.skyMessages.length,0);assert.equal(restored.hasWitnessedDeath,true);
  }
});
