import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventure, createLevel, terrainY, STEP, segmentBox } from '../src/engine.js';

function place(game,x){Object.assign(game.player,{x,y:terrainY(game.level,x),vx:0,vy:0,grounded:true});}
function pressAgain(game){
  const plate=game.section.plates[0];place(game,plate.x);game.update();
  assert.equal(game.attacks.length,0);
  place(game,plate.x+70);game.update();place(game,plate.x);
  assert.ok(game.update().includes('warning'));
}
test('only repeat entries trigger a volley; holding a plate is one press',()=>{
  const game=new Adventure(1,{},()=>0),plate=game.section.plates[0];place(game,plate.x);
  for(let i=0;i<120;i++)game.update();
  assert.equal(game.pressCounts.get(plate.id),1);assert.equal(game.attacks.length,0);
  place(game,plate.x+70);game.update();place(game,plate.x);game.update();
  assert.equal(game.pressCounts.get(plate.id),2);assert.equal(game.attacks.length,1);
});
test('an aimed volley kills an exposed hamster and records the death',()=>{
  const game=new Adventure(1,{},()=>0);pressAgain(game);place(game,game.section.start+930);
  for(let i=0;i<150&&!game.dead;i++)game.update();
  assert.equal(game.dead,true);assert.equal(game.deathReason,'logs');assert.equal(game.memory.logDeaths,1);
  assert.equal(game.skyMessages[0].text,'Baviloya is Watching You');
});
test('a raised bank intercepts the same attack before it can hit the sheltered hamster',()=>{
  const game=new Adventure(1,{},()=>0);pressAgain(game);place(game,game.section.start+600);
  for(let i=0;i<200;i++)game.update();
  assert.equal(game.dead,false);assert.equal(game.projectiles.length,0);assert.equal(game.attacks.length,0);
});
test('the warning remains at its death location after respawn and movement',()=>{
  const game=new Adventure();place(game,930);game.kill('logs');
  const message={...game.skyMessages[0]};
  for(let i=0;i<130&&game.dead;i++)game.update();
  assert.equal(game.dead,false);assert.notEqual(game.player.x,message.x);
  for(let i=0;i<35;i++)game.update({right:true});
  assert.deepEqual(game.skyMessages[0],message);
});
test('later sections add shots, speed, shorter warnings and a second volley',()=>{
  const first=createLevel(0),second=createLevel(1),third=createLevel(2);
  assert.ok(first.trap.speed<second.trap.speed&&second.trap.speed<third.trap.speed);
  assert.ok(first.trap.windup>second.trap.windup&&second.trap.windup>third.trap.windup);
  assert.deepEqual([first.trap.shots,second.trap.shots,third.trap.shots],[0,2,3]);
  assert.equal(third.trap.waves,2);assert.ok(second.thorns.length>first.thorns.length);
  assert.ok(createLevel(2,{logDeaths:3}).trap.speed>third.trap.speed);
});
test('projectile sweeps catch a hamster even when a fast log crosses it in one step',()=>{
  const game=new Adventure(1);place(game,3330);
  game.projectiles.push({x:3400,y:478,vx:-9000,vy:0,angle:0,spin:0,len:60,r:12,age:0,hostile:true});
  assert.equal(game.updateAttacks(STEP),true);
  assert.equal(segmentBox({x:0,y:0},{x:20,y:0},{x:8,y:-1,w:2,h:2}),.4);
  assert.equal(segmentBox({x:0,y:5},{x:20,y:5},{x:8,y:-1,w:2,h:2}),null);
});

test('the first level never arms attacks, including repeats, retries and old saved learning',()=>{
  const game=new Adventure(0,{echoes:30,logDeaths:10},()=>0),plate=game.section.plates[0];
  for(let repeat=0;repeat<8;repeat++){
    place(game,plate.x);assert.equal(game.update().includes('warning'),false);
    place(game,plate.x+70);game.update();
    assert.equal(game.attacks.length,0);assert.equal(game.projectiles.length,0);assert.equal(game.dead,false);
  }
  game.restartTake();place(game,plate.x);game.update();assert.equal(game.attacks.length,0);
});
test('later levels can skip a repeat-press attack without rerolling each held frame',()=>{
  for(const index of [1,2]){
    const game=new Adventure(index,{},()=>.999),plate=game.section.plates[0];
    place(game,plate.x);game.update();place(game,plate.x+70);game.update();place(game,plate.x);
    assert.equal(game.update().includes('warning'),false);
    for(let i=0;i<120;i++)game.update();
    assert.equal(game.attacks.length,0);assert.equal(game.projectiles.length,0);assert.equal(game.dead,false);
  }
});
test('the sky warning is created only for the first death, including across retries and sections',()=>{
  const game=new Adventure();place(game,930);game.kill('logs');const first={...game.skyMessages[0]};game.restartTake();
  place(game,1400);game.kill('brambles');assert.deepEqual(game.skyMessages,[first]);game.restartTake();
  game.activeIndex=1;game.syncWorld();game.retireBehind(2400);assert.equal(game.skyMessages.length,0);
  game.restartTake();game.kill('logs');assert.equal(game.skyMessages.length,0);assert.equal(game.hasWitnessedDeath,true);
});
test('ordinary scattered logs can pass through the hamster without damage',()=>{
  const game=new Adventure(),stack=game.logStacks.get(980);place(game,930);stack.update(true,0);
  for(const log of stack.logs)Object.assign(log,{x:930,y:480,vx:-800,vy:0});
  for(let i=0;i<12;i++)game.update();
  assert.equal(game.dead,false);assert.equal(game.projectiles.length,0);assert.equal(game.skyMessages.length,0);
});
test('saved memory restores the first warning and suppresses later death messages after reloading',()=>{
  const game=new Adventure();place(game,930);game.kill('logs');
  const restored=new Adventure(0,JSON.parse(JSON.stringify(game.memory)));
  assert.deepEqual(restored.skyMessages,game.skyMessages);
  place(restored,1400);restored.kill('brambles');assert.equal(restored.skyMessages.length,1);
  const later=new Adventure(1,game.memory);later.kill('fall');assert.equal(later.skyMessages.length,0);
});
test('the first-level player and Echo remain harmless on repeated presses',()=>{
  const game=new Adventure(0,{echoes:30,logDeaths:10},()=>.999),plate=game.section.plates[0];
  place(game,plate.x);game.recordingStarted=true;for(let i=0;i<15;i++)game.update();
  assert.equal(game.commit().ok,true);for(let i=0;i<40;i++)game.update();
  assert.equal(game.pressCounts.get(plate.id),2);assert.equal(game.playerPressCounts.get(plate.id),1);
  assert.equal(game.attacks.length,0);assert.equal(game.projectiles.length,0);assert.equal(game.dead,false);
  place(game,plate.x+70);game.update();place(game,plate.x);
  assert.equal(game.update().includes('warning'),false);assert.equal(game.playerPressCounts.get(plate.id),2);assert.equal(game.attacks.length,0);
});
test('a visible aimed-log end registers a hit when its center misses the hamster',()=>{
  const game=new Adventure();place(game,930);
  game.projectiles.push({x:3382,y:475,vx:0,vy:0,angle:0,spin:0,len:100,r:8,age:0,hostile:true});
  assert.equal(game.updateAttacks(STEP),true);
});

test('the tutorial clears stray hostile shots before they can damage the player',()=>{
  const game=new Adventure();place(game,930);
  game.projectiles.push({x:940,y:478,vx:-9000,vy:0,angle:0,spin:0,len:60,r:12,age:0,hostile:true});
  assert.equal(game.updateAttacks(STEP),false);assert.equal(game.projectiles.length,0);
});
