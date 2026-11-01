import { LogStack } from './log-motion.js';
/** Deterministic side-view physics and recordings. Rendering and input live elsewhere. */
export const STEP = 1 / 60;
export const ECHO_SECONDS = 8;
export const ECHO_TICKS = Math.round(ECHO_SECONDS / STEP);
export const ECHO_HOLD_TICKS = Math.round(3 / STEP);
export const PHYSICS = { speed: 285, walkSpeed: 125, jump: 600, gravity: 1600, width: 34, height: 61, coyote: .10, buffer: .13 };
export const SECTION_LENGTH=2400;
export const CHAPTERS = [
  { name:'A friend from before', region:'The Meadow Path', limit:1 },
  { name:'Over the creek', region:'Willow Creek', limit:1 },
  { name:'The path remembers', region:'The Remembering Grove', limit:1 },
];
const approach = (value, target, amount) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
const overlaps = (a, b) => a.x + PHYSICS.width / 2 > b.x && a.x - PHYSICS.width / 2 < b.x + b.w && a.y > b.y && a.y - PHYSICS.height < b.y + b.h;
const snapshot = p => ({ x:p.x, y:p.y, vx:p.vx, vy:p.vy, grounded:p.grounded, facing:p.facing, landing:p.landing, stride:p.stride, gait:p.gait });

export function segmentBox(from,to,box){
  let entry=0,exit=1;
  for(const [position,delta,min,max] of [[from.x,to.x-from.x,box.x,box.x+box.w],[from.y,to.y-from.y,box.y,box.y+box.h]]){
    if(Math.abs(delta)<1e-9){if(position<min||position>max)return null;continue;}
    const a=(min-position)/delta,b=(max-position)/delta;entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));if(entry>exit)return null;
  }return entry;
}

export function createLevel(index,memory={}){
  if(!CHAPTERS[index])throw new Error('Unknown trail section');
  const start=index*SECTION_LENGTH,end=start+SECTION_LENGTH,id=String.fromCharCode(65+index);
  const gaps=index===1?[720,880,1590,1740]:index===2?[760,900,1540,1690]:[740,900,1530,1680];
  const ground=[{x:index===0?-300:0,y:510,w:gaps[0]+(index===0?300:0),h:700},{x:gaps[1],y:510,w:gaps[2]-gaps[1],h:700},{x:gaps[3],y:510,w:SECTION_LENGTH-gaps[3]+(index===2?300:0),h:700}];
  const mounds=index===1?[
    {x:250,y:455,w:110},{x:420,y:410,w:190},{x:1370,y:445,w:90},{x:1480,y:385,w:110},{x:1880,y:440,w:140},{x:2110,y:405,w:100}
  ]:index===2?[
    {x:235,y:455,w:125},{x:410,y:395,w:220},{x:1370,y:445,w:90},{x:1460,y:380,w:80},{x:1850,y:440,w:120},{x:2080,y:395,w:120}
  ]:[
    {x:235,y:455,w:125},{x:390,y:390,w:220},{x:1360,y:445,w:90},{x:1420,y:380,w:110},{x:1830,y:450,w:135},{x:2040,y:395,w:160}
  ];
  mounds.push({x:660,y:355+index*5,w:100,ramp:140,cover:true});
  const plates=[{id,x:index===2?520:500,y:index===0?390:index===1?410:395}];
  const logPiles=[{x:index===1?970:980,y:288,w:260,h:222,requires:[id]}];
  const blockedRoute=index===2?(memory.lastRoute==='high'?'high':'low'):null;
  const thorns=index===0?[]:index===1?[{x:2035,y:451,w:26,h:24}]:blockedRoute==='high'?[{x:2100,y:371,w:30,h:24}]:[{x:1375,y:409,w:30,h:36}];
  const seeds=[{x:285,y:418},{x:445,y:350},{x:565,y:350},{x:(gaps[0]+gaps[1])/2,y:420},{x:1390,y:402},{x:1510,y:338},{x:1900,y:405},{x:2120,y:355},{x:2250,y:470}];
  const shift=items=>items.map(item=>({...item,x:item.x+start,section:index}));
  return{...CHAPTERS[index],index,start,end,width:end,spawn:{x:start+100,y:510},exit:{x:end,y:510},ground:shift(ground),mounds:shift(mounds),plates:shift(plates),logPiles:shift(logPiles),thorns:shift(thorns),seeds:shift(seeds).map((seed,i)=>({...seed,id:index+':'+i})),blockedRoute,trap:{enabled:index>0,speed:1000+index*180+Math.min(100,(memory.logDeaths||0)*15),windup:.85-index*.17,shots:index===0?0:1+index,waves:index===0?0:index===2?2:1,chance:index===0?0:index===1?.5:.7},retired:false};
}

/** The renderer and collisions share this continuous grass-bank profile. */
export function terrainY(level,x){
  const bank=level.ground.find(g=>x>=g.x&&x<=g.x+g.w);
  if(!bank)return null;
  let y=bank.y;
  for(const mound of level.mounds){
    if(mound.x<bank.x||mound.x>=bank.x+bank.w)continue;
    const ramp=mound.ramp??120,start=mound.x-ramp,end=mound.x+mound.w+ramp;
    if(x<start||x>end)continue;
    const t=x<mound.x?(x-start)/ramp:x>mound.x+mound.w?(end-x)/ramp:1;
    y=Math.min(y,bank.y-(bank.y-mound.y)*(1-Math.cos(Math.PI*t))/2);
  }
  return y;
}

export class Adventure {
  constructor(index=0,memory={},random=Math.random){
    if(!CHAPTERS[index])throw new Error('Unknown trail section');
    this.random=random;this.memory={...memory};this.activeIndex=index;this.cameraFloor=index*SECTION_LENGTH;this.completed=Array.from({length:index},(_,i)=>i);
    this.sections=CHAPTERS.map((_,i)=>({...createLevel(i,this.memory),retired:i<index}));this.level={sections:this.sections,width:CHAPTERS.length*SECTION_LENGTH+300};
    this.echoes=[];this.seeds=new Set();this.logStacks=new Map();this.route=null;this.attempts=1;this.stats={jumps:0,falls:0,echoes:0};this.pressCounts=new Map();this.playerPressCounts=new Map();this.skyMessages=memory.firstDeath&&memory.firstDeath.section>=index?[{...memory.firstDeath,text:'Baviloya is Watching You'}]:[];this.hasWitnessedDeath=memory.hasWitnessedDeath===true||Boolean(memory.firstDeath);this.echoSerial=0;this.projectiles=[];this.attacks=[];this.dead=false;this.deathTimer=0;this.syncWorld();this.restartTake();
  }
  get section(){return this.sections[this.activeIndex];}
  syncWorld(){
    for(const key of ['ground','mounds','plates','logPiles','thorns','seeds'])this.level[key]=this.sections.filter(s=>!s.retired).flatMap(s=>s[key]);
    this.level.ground=this.level.ground.reduce((banks,bank)=>{const last=banks.at(-1);if(last&&last.x+last.w===bank.x&&last.y===bank.y)last.w+=bank.w;else banks.push({...bank});return banks;},[]);
    Object.assign(this.level,{index:this.activeIndex,region:this.section.region,limit:this.section.limit,spawn:this.section.spawn,exit:this.sections.at(-1).exit});
    for(const pile of this.level.logPiles)if(!this.logStacks.has(pile.x))this.logStacks.set(pile.x,new LogStack(pile,x=>terrainY(this.level,x)));
    for(const key of this.logStacks.keys())if(!this.level.logPiles.some(p=>p.x===key))this.logStacks.delete(key);
  }
  retireBehind(cameraLeft){
    for(const section of this.sections)if(!section.retired&&section.index<this.activeIndex&&cameraLeft>=section.end){
      section.retired=true;this.skyMessages=this.skyMessages.filter(message=>message.section!==section.index);this.cameraFloor=Math.max(this.cameraFloor,section.end);this.syncWorld();
    }
  }
  finishSection(events){
    const index=this.activeIndex;
    if(!this.completed.includes(index))this.completed.push(index);
    this.memory.lastRoute=this.route||(this.stats.jumps>4?'high':'low');
    this.memory.jumps=(this.memory.jumps||0)+this.stats.jumps;this.memory.falls=(this.memory.falls||0)+this.stats.falls;
    this.memory.completed=(this.memory.completed||0)+1;this.memory.echoes=(this.memory.echoes||0)+(this.stats.echoes||0);
    if(index===CHAPTERS.length-1){this.won=true;this.player.vx=0;events.push('win');return;}
    this.activeIndex++;this.echoes=[];this.tick=0;this.route=null;this.stats={jumps:0,falls:0,echoes:0};
    this.sections[this.activeIndex]=createLevel(this.activeIndex,this.memory);this.level.sections=this.sections;
    this.syncWorld();this.recording=[snapshot(this.player)];this.recordingStarted=false;this.lastPressed=new Set();this.lastPlateActors=new Map();events.push('section');
  }
  restartTake() {
    for(const stack of this.logStacks.values())stack.reset();
    this.player = { ...this.level.spawn, vx:0, vy:0, grounded:true, facing:1, landing:0, stride:0, gait:'idle' };
    this.dead=false;this.deathTimer=0;this.projectiles=[];this.attacks=[];for(const echo of this.echoes)echo.startTick=0;
    this.lastPlateActors=new Map();
    this.tick = 0; this.time = 0; this.won = false; this.coyote = PHYSICS.coyote; this.jumpBuffer = 0;
    this.recording = [snapshot(this.player)]; this.recordingStarted = false; this.recordingFull = false; this.lastPressed = new Set();
  }
  echoPosition(echo) {
    const elapsed=Math.max(0,this.tick-(echo.startTick||0)),frame=echo.frames[Math.min(elapsed,echo.frames.length-1)];
    return elapsed>=echo.frames.length-1?{...frame,vx:0,vy:0,landing:0}:frame;
  }
  echoActive(echo) { return this.tick-(echo.startTick||0) < (echo.lifetime || ECHO_TICKS); }
  echoRemaining(echo) { return Math.max(0, ((echo.lifetime || ECHO_TICKS) - (this.tick-(echo.startTick||0))) * STEP); }
  get actors() { return [this.player, ...this.echoes.filter(e => this.echoActive(e)).map(e => this.echoPosition(e))]; }
  onPlate(actor, plate) { return actor.grounded && Math.abs(actor.x - plate.x) < 32 && Math.abs(actor.y - plate.y) < 5; }
  pressed(id) { const plate = this.level.plates.find(p => p.id === id); return Boolean(plate && this.actors.some(a => this.onPlate(a, plate))); }
  pileCleared(pile) { return !this.logStacks.get(pile.x).solid; }
  commit() {
    if (this.won||this.dead) return {ok:false,reason:this.dead?'dead':'won'};
    if (!this.player.grounded) return {ok:false,reason:'air'};
    if (this.recording.length < 12) return {ok:false,reason:'empty'};
    this.echoes = this.echoes.filter(e => this.echoActive(e));
    if (this.echoes.length >= this.level.limit) return {ok:false,reason:'limit'};
    this.echoes.push({ id:++this.echoSerial,startTick:this.tick,frames:this.recording.map(frame => ({...frame})), lifetime:this.recording.length-1+ECHO_HOLD_TICKS });
    this.stats.echoes=(this.stats.echoes||0)+1;
    return {ok:true};
  }
  removeEcho() { if (!this.echoes.length) return false; this.echoes.pop(); return true; }
  reset() { this.echoes = []; this.seeds.clear(); this.attempts = 1; this.route = null;this.stats={jumps:0,falls:0,echoes:0};this.pressCounts.clear();this.playerPressCounts.clear(); this.restartTake(); }
  kill(reason){
    if(this.dead)return [];
    if(!this.hasWitnessedDeath){
      this.hasWitnessedDeath=true;this.skyMessages.push({x:this.player.x,y:Math.min(210,(terrainY(this.level,this.player.x)??510)-240),section:this.activeIndex,text:'Baviloya is Watching You'});
    }
    if(this.skyMessages.length&&!this.memory.firstDeath){this.memory.firstDeath={...this.skyMessages[0]};this.memory.hasWitnessedDeath=true;}
    this.dead=true;this.deathTimer=1.9;this.deathReason=reason;this.attempts++;this.stats.falls++;
    if(reason==='logs')this.memory.logDeaths=(this.memory.logDeaths||0)+1;
    this.player.vx=0;this.player.vy=0;return ['death'];
  }
  updateAttacks(dt){
    if(this.activeIndex===0){this.attacks=[];this.projectiles=[];return false;}
    for(const attack of this.attacks){
      attack.remaining-=dt;if(attack.remaining>0)continue;
      const origin={x:attack.pile.x+attack.pile.w/2,y:(terrainY(this.level,attack.pile.x+attack.pile.w/2)??510)-38};
      const p=this.player,target={x:p.x+p.vx*.09,y:p.y-31+p.vy*.04},flight=Math.max(.12,Math.hypot(target.x-origin.x,target.y-origin.y)/attack.trap.speed);
      for(let i=0;i<attack.trap.shots;i++)this.projectiles.push({x:origin.x,y:origin.y-i*7,vx:(target.x-origin.x)/flight,vy:(target.y-origin.y-850*flight*flight)/flight+(i-(attack.trap.shots-1)/2)*35,angle:0,spin:(i%2?-1:1)*12,len:60,r:12,age:0,opacity:1,hostile:true});
    }
    this.attacks=this.attacks.filter(attack=>attack.remaining>0);
    let hit=false;
    this.projectiles=this.projectiles.filter(log=>{
      const from={x:log.x,y:log.y,angle:log.angle};log.age+=dt;log.vy+=1700*dt;log.x+=log.vx*dt;log.y+=log.vy*dt;log.angle+=log.spin*dt;
      const p=this.player,body={x:p.x-26-log.r,y:p.y-70-log.r,w:52+log.r*2,h:70+log.r*2},half=Math.max(0,log.len/2-log.r);
      let actor=null,blocked=null;
      for(const offset of [-half,0,half]){
        const old={x:from.x+Math.cos(from.angle)*offset,y:from.y+Math.sin(from.angle)*offset},next={x:log.x+Math.cos(log.angle)*offset,y:log.y+Math.sin(log.angle)*offset};
        const contact=segmentBox(old,next,body);if(contact!==null)actor=actor===null?contact:Math.min(actor,contact);
        const steps=Math.max(1,Math.ceil(Math.hypot(next.x-old.x,next.y-old.y)/4));
        for(let i=0;i<=steps;i++){
          const t=i/steps,x=old.x+(next.x-old.x)*t,y=old.y+(next.y-old.y)*t,floor=terrainY(this.level,x);
          if(floor!==null&&y+log.r>=floor){blocked=blocked===null?t:Math.min(blocked,t);break;}
        }
      }
      if(log.hostile===true&&actor!==null&&(blocked===null||actor<blocked)){hit=true;return false;}
      return blocked===null&&log.age<3&&log.y<1000;
    });return hit;
  }
  update(input = {}, dt = STEP) {
    if (this.won) return [];
    dt = Math.max(0, Math.min(dt, 1 / 30));
    if(this.dead){this.deathTimer-=dt;if(this.deathTimer<=0){this.restartTake();return ['respawn'];}return [];}
    const p = this.player, events = [], previousY = p.y, previousX=p.x;
    if(input.left||input.right||input.jumpPressed)this.recordingStarted=true;
    p.landing = Math.max(0, p.landing - dt);
    this.time += dt;
    this.coyote = p.grounded ? PHYSICS.coyote : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.jumpPressed ? PHYSICS.buffer : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      p.vy = -PHYSICS.jump; p.grounded = false; this.coyote = 0; this.jumpBuffer = 0; events.push('jump');this.stats.jumps++;
    }
    const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
    if(this.echoes.length)this.recordingStarted=true;
    if (direction) p.facing = direction;
    p.vx = approach(p.vx, direction * (input.walk ? PHYSICS.walkSpeed : PHYSICS.speed), (direction ? (p.grounded ? 2300 : 1700) : (p.grounded ? 2800 : 550)) * dt);
    p.gait = Math.abs(p.vx)<18?'idle':input.walk?'walk':'run';
    const solids = this.level.logPiles.filter(g => !this.pileCleared(g));
    const followedGround=p.grounded;
    p.x += p.vx * dt;
    for (const solid of solids) if (overlaps(p, solid)) {
      if (p.vx > 0) p.x = solid.x - PHYSICS.width / 2;
      else if (p.vx < 0) p.x = solid.x + solid.w + PHYSICS.width / 2;
      p.vx = 0;
    }
    // Bank edges are real cliffs; a low jump cannot pass through their sides.
    for(const bank of this.level.ground){
      if(p.vx>0&&previousX+PHYSICS.width/2<=bank.x&&p.x+PHYSICS.width/2>bank.x&&p.y>terrainY(this.level,bank.x)+1){p.x=bank.x-PHYSICS.width/2;p.vx=0;}
      if(p.vx<0&&previousX-PHYSICS.width/2>=bank.x+bank.w&&p.x-PHYSICS.width/2<bank.x+bank.w&&p.y>terrainY(this.level,bank.x+bank.w)+1){p.x=bank.x+bank.w+PHYSICS.width/2;p.vx=0;}
    }
    p.x = Math.max(this.cameraFloor+48, Math.min(this.level.width-20,p.x));
    if(p.grounded)p.stride += Math.abs(p.vx) * dt / 145;
    const surfaceY=terrainY(this.level,p.x),wasGrounded=p.grounded;
    if(followedGround&&surfaceY!==null&&Math.abs(surfaceY-previousY)<12){p.y=surfaceY;p.vy=0;p.grounded=true;}
    else{
      p.vy = Math.min(1000, p.vy + PHYSICS.gravity * (p.vy < 0 && !input.jumpHeld ? 2.2 : 1) * dt);
      p.y += p.vy * dt;p.grounded=false;
      if(surfaceY!==null&&p.y>=surfaceY&&previousY<=surfaceY+12){
        if(!wasGrounded&&p.vy>160){p.landing=.16;events.push('land');}
        p.y=surfaceY;p.vy=0;p.grounded=true;
      }
    }
    const surfaces = solids.sort((a,b) => a.y - b.y);
    for (const surface of surfaces) {
      if (p.x + PHYSICS.width / 2 <= surface.x || p.x - PHYSICS.width / 2 >= surface.x + surface.w) continue;
      if (p.vy >= 0 && previousY <= surface.y + .5 && p.y >= surface.y) {
        if (!wasGrounded && p.vy > 160) { p.landing = .16; events.push('land'); }
        p.y = surface.y; p.vy = 0; p.grounded = true; break;
      }
      if (solids.includes(surface) && p.vy < 0 && previousY - PHYSICS.height >= surface.y + surface.h && p.y - PHYSICS.height <= surface.y + surface.h) {
        p.y = surface.y + surface.h + PHYSICS.height; p.vy = 0;
      }
    }
    if (p.y > 950 || this.level.thorns.some(t => overlaps(p, t))) {
      return this.kill(p.y>950?'fall':'brambles');
    }
    this.tick++;
    if(this.recordingStarted){
      this.recording.push(snapshot(p));
      if(this.recording.length>ECHO_TICKS+1)this.recording.shift();
    }
    this.level.seeds.forEach((seed,i) => {
      if (!this.seeds.has(seed.id) && Math.hypot(seed.x-p.x, seed.y-(p.y-23)) < 30) { this.seeds.add(seed.id); events.push('seed'); }
    });
    for(const plate of this.level.plates){
      const contacts=new Set();if(this.onPlate(p,plate))contacts.add('player');
      for(const echo of this.echoes)if(this.echoActive(echo)&&this.onPlate(this.echoPosition(echo),plate))contacts.add('echo:'+echo.id);
      const before=this.lastPlateActors.get(plate.id)||new Set();
      for(const actor of contacts)if(!before.has(actor)){
        const count=(this.pressCounts.get(plate.id)||0)+1;this.pressCounts.set(plate.id,count);
        if(actor==='player')this.playerPressCounts.set(plate.id,(this.playerPressCounts.get(plate.id)||0)+1);
        const learned=plate.section>0&&count>1;
        if(learned){
          const pile=this.level.logPiles.find(pile=>pile.requires.includes(plate.id)),section=this.sections[plate.section];
          if(pile&&!this.attacks.some(attack=>attack.pile.x===pile.x)&&(section.index===0||this.random()<section.trap.chance)){
            for(let wave=0;wave<section.trap.waves;wave++)this.attacks.push({pile,remaining:section.trap.windup+wave*.24,trap:section.trap});
            events.push('warning');
          }
        }
      }
      this.lastPlateActors.set(plate.id,contacts);
      if(contacts.size){if(!this.lastPressed.has(plate.id))events.push('plate');this.lastPressed.add(plate.id);}else this.lastPressed.delete(plate.id);
    }
    if(p.x>this.section.start+1380&&p.x<this.section.start+1540&&this.route!=='high')this.route=p.y<(terrainY(this.level,p.x)??510)-30?'high':'low';
    for(const pile of this.level.logPiles){
      const stack=this.logStacks.get(pile.x),held=pile.requires.every(id=>this.pressed(id));
      if(stack.update(held,dt,overlaps(p,pile)))events.push('logs');
    }
    const hit=this.updateAttacks(dt);if(hit)return this.kill('logs');
    if(p.x>=this.section.end&&p.y<560)this.finishSection(events);
    return events;
  }
}
