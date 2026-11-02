import { LogStack, stepDebris } from './log-motion.js';
import { ringBell, stepGeese } from './goose.js';
import { decorateBushes, stepBushes } from './bush.js';
import { startRunawayPlatform, stepRunawayPlatforms } from './runaway-platform.js';
/** Deterministic side-view physics and recordings. Rendering and input live elsewhere. */
export const STEP = 1 / 60;
export const ECHO_SECONDS = 3;
export const ECHO_TICKS = Math.round(ECHO_SECONDS / STEP);
export const ECHO_REPLAY_TICKS = ECHO_TICKS;
export const ECHO_HOLD_TICKS = Math.round(7 / STEP);
export const PHYSICS = { speed: 285, walkSpeed: 125, jump: 650, gravity: 1600, width: 34, height: 61, coyote: .10, buffer: .13 };
export const SECTION_LENGTH=4000;
export const CHAPTERS = [
  { name:'A friend from before', region:'The Meadow Path', limit:2 },
  { name:'Over the creek', region:'Willow Creek', limit:2 },
  { name:'The path remembers', region:'The Remembering Grove', limit:2 },
  { name:'Not so fast', region:'The Contrary Crossing', limit:2, length:6000, holdSeconds:16 },
  { name:'Mind the goose', region:'The Honking Meadow', limit:2, length:7940, holdSeconds:22 },
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

function pointSegmentDistance(point,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
  return (point.x-a.x-t*dx)**2+(point.y-a.y-t*dy)**2;
}
function segmentDistance(a,b,c,d){
  const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,cross=ux*vy-uy*vx;
  if(Math.abs(cross)>1e-9){const dx=c.x-a.x,dy=c.y-a.y,t=(dx*vy-dy*vx)/cross,s=(dx*uy-dy*ux)/cross;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
  return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
function capsuleHitsBox(a,b,r,box){
  if(segmentBox(a,b,box)!==null)return true;
  const corners=[{x:box.x,y:box.y},{x:box.x+box.w,y:box.y},{x:box.x+box.w,y:box.y+box.h},{x:box.x,y:box.y+box.h}];
  return corners.some((corner,i)=>segmentDistance(a,b,corner,corners[(i+1)%4])<=r*r);
}
export function logTouchesActor(log,actor){
  const scale=log.scale??1,r=log.r*scale,half=Math.max(0,log.len/2-log.r)*scale,dx=Math.cos(log.angle)*half,dy=Math.sin(log.angle)*half;
  const box={x:actor.x-PHYSICS.width/2,y:actor.y-PHYSICS.height,w:PHYSICS.width,h:PHYSICS.height};
  if(log.x+Math.abs(dx)+r<=box.x||log.x-Math.abs(dx)-r>=box.x+box.w||log.y+Math.abs(dy)+r<=box.y||log.y-Math.abs(dy)-r>=box.y+box.h)return false;
  return capsuleHitsBox({x:log.x-dx,y:log.y-dy},{x:log.x+dx,y:log.y+dy},Math.max(0,r-.02),box);
}
function moveAgainstLogs(actor,axis,previous,logs){
  if(!logs.some(log=>logTouchesActor(log,actor)))return false;
  const target=actor[axis];actor[axis]=previous;
  if(logs.some(log=>logTouchesActor(log,actor))){actor[axis]=target;return false;}
  let safe=previous,blocked=target;
  for(let i=0;i<12;i++){actor[axis]=(safe+blocked)/2;if(logs.some(log=>logTouchesActor(log,actor)))blocked=actor[axis];else safe=actor[axis];}
  actor[axis]=safe;return true;
}
function pushOutOfLogs(actor,logs){
  if(!logs.some(log=>logTouchesActor(log,actor)))return;
  const choices=[];
  for(const [axis,sign] of [['x',-1],['x',1],['y',-1]]){
    const origin=actor[axis];let distance=1;
    while(distance<=512){actor[axis]=origin+sign*distance;if(!logs.some(log=>logTouchesActor(log,actor)))break;distance*=2;}
    if(distance<=512){let lo=0,hi=distance;for(let i=0;i<12;i++){const mid=(lo+hi)/2;actor[axis]=origin+sign*mid;if(logs.some(log=>logTouchesActor(log,actor)))lo=mid;else hi=mid;}choices.push({axis,value:origin+sign*hi,distance:hi});}
    actor[axis]=origin;
  }
  choices.sort((a,b)=>a.distance-b.distance);if(choices[0]){actor[choices[0].axis]=choices[0].value;actor.vx=0;actor.vy=0;}
}
function projectileTerrain(level,left,right){
  const xs=new Set([left,right]);for(let x=Math.ceil(left/2)*2;x<right;x+=2)xs.add(x);
  // Keep exact cliff and ledge faces; floor-only samples miss horizontal radius contacts.
  for(const bank of [...groundBanks(level),...level.terraces])for(const edge of [bank.x,bank.x+bank.w])for(const x of [edge-.001,edge,edge+.001])if(x>left&&x<right)xs.add(x);
  const points=[...xs].sort((a,b)=>a-b).map(x=>({x,y:terrainY(level,x)})),segments=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(a.y!==null&&b.y!==null)segments.push([a,b]);
    else if((a.y===null)!==(b.y===null)){const edge=a.y===null?b:a;segments.push([edge,{x:edge.x,y:2000}]);}
  }
  return segments;
}
function sweepLog(level,log,from,to,body,damage=true){
  const half=Math.max(0,log.len/2-log.r),reach=half+log.r;
  const segments=projectileTerrain(level,Math.min(from.x,to.x)-reach,Math.max(from.x,to.x)+reach);
  const travel=Math.hypot(to.x-from.x,to.y-from.y)+Math.abs(to.angle-from.angle)*half,steps=Math.max(1,Math.ceil(travel/2));
  for(let i=0;i<=steps;i++){
    const t=i/steps,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t,angle=from.angle+(to.angle-from.angle)*t;
    const dx=Math.cos(angle)*half,dy=Math.sin(angle)*half,a={x:x-dx,y:y-dy},b={x:x+dx,y:y+dy};
    const left=Math.min(a.x,b.x)-log.r-.25,right=Math.max(a.x,b.x)+log.r+.25,top=Math.min(a.y,b.y)-log.r-.25,bottom=Math.max(a.y,b.y)+log.r+.25;
    const radius=log.r+.25;
    for(const shed of level.sheds||[]){
      const peak={x:shed.x+shed.w/2,y:shed.roofY-20},edges=[[{x:shed.x-14,y:shed.roofY},peak],[peak,{x:shed.x+shed.w+14,y:shed.roofY}]];
      if(edges.some(([c,d])=>segmentDistance(a,b,c,d)<=(log.r+6)**2))return {kind:'roof',pose:{x,y,angle}};
    }
    // Test the whole rounded body against earth first at the same point in time.
    if(segments.some(([c,d])=>Math.max(c.x,d.x)>=left&&Math.min(c.x,d.x)<=right&&Math.max(c.y,d.y)>=top&&Math.min(c.y,d.y)<=bottom&&segmentDistance(a,b,c,d)<=radius*radius))return {kind:'blocked',pose:{x,y,angle}};
    for(const end of [a,b]){const floor=terrainY(level,end.x);if(floor!==null&&end.y>=floor)return {kind:'blocked',pose:{x,y,angle}};}
    if(damage&&log.hostile===true&&right>=body.x&&left<=body.x+body.w&&bottom>=body.y&&top<=body.y+body.h&&capsuleHitsBox(a,b,log.r,body))return {kind:'hit',pose:{x,y,angle}};
  }
  return null;
}

export function createLevel(index,memory={}){
  if(!CHAPTERS[index])throw new Error('Unknown trail section');
  const start=CHAPTERS.slice(0,index).reduce((sum,chapter)=>sum+(chapter.length??SECTION_LENGTH),0),end=start+(CHAPTERS[index].length??SECTION_LENGTH),id=String.fromCharCode(65+index);
  if(index===3){
    const shift=items=>items.map(item=>({...item,x:item.x+start,section:index}));
    const bridges=[{x:900,y:510,w:460,requires:['D','D2']},{x:2300,y:510,w:460,requires:['D3','D4']}].map(bridge=>({...bridge,x:bridge.x+start,section:index,progress:0}));
    return decorateBushes({...CHAPTERS[index],index,start,end,width:end,spawn:{x:start+100,y:510},
      ground:shift([{x:0,y:510,w:900,h:700},{x:1360,y:510,w:940,h:700},{x:2760,y:510,w:1210,h:700},{x:4140,y:510,w:2160,h:700}]),
      mounds:shift([{x:2920,y:430,w:60,rampRight:90}]),terraces:shift([{x:3075,y:350,w:65,h:160}]),holes:[],thorns:[],seeds:[],bridges,sheds:shift([{x:1680,y:510,w:150,roofY:300}]),
      logPiles:shift([{x:1900,y:288,w:260,h:222,requires:['D3']},{x:3450,y:288,w:260,h:222,requires:['D6']},{x:4650,y:288,w:260,h:222,requires:['D7']}]),
      plates:shift([{id:'D',x:480,y:510},{id:'D2',x:740,y:510},{id:'D3',x:1550,y:510,homing:true,attackChance:1},{id:'D4',x:2210,y:510},{id:'D6',x:3100,y:350,cover:{x:start+3055,w:34}},{id:'D7',x:4370,y:510},{id:'D5',x:5980,y:510}]),
      exit:{x:start+5500,y:510,homeX:start+5500,trapX:start+5900,minX:start+5450,maxX:start+6000,direction:1,running:false,caught:false,stride:0,requires:'D5',runaway:true},
      trap:{enabled:true,chance:.6,speed:1800,windup:.5,shots:24,waves:1},retired:false});
  }
  if(index===4){
    const shift=items=>items.map(item=>({...item,x:item.x+start,section:index})),bases=[0,2720,5610];
    return decorateBushes({...CHAPTERS[index],index,start,end,width:end,spawn:{x:start+100,y:510},
      ground:shift([{x:0,y:510,w:1880,h:700},{x:2050,y:510,w:3390,h:700},{x:5610,y:510,w:2630,h:700}]),
      mounds:shift(bases.filter((_,i)=>i!==1).map(x=>({x:x+380,y:410,w:100,rampRight:70}))),terraces:[],holes:[],thorns:[],seeds:[],bridges:[],sheds:[],
      platforms:shift([{x:3100,homeX:start+3100,y:410,w:100,h:100,groundY:510,rampLeft:120,rampRight:70,profile:true,requires:'E2',speed:PHYSICS.speed,direction:-1,duration:3,elapsed:0,running:false,triggered:false,stride:0}]),
      plates:shift([{id:'E',x:650,y:510,bell:true},{id:'E2',x:3370,y:510,bell:true},{id:'E3',x:6260,y:510,bell:true}]),
      logPiles:shift(bases.map((x,i)=>({x:x+1520,y:288,w:260,h:222,requires:[['E','E2','E3'][i]]}))),
      fences:shift(bases.map(x=>({x:x+1130,y:510,w:72,h:190,broken:false,debris:[]}))),
      geese:bases.map((x,i)=>({x:start+x+1400,homeX:start+x+1400,y:510,bellId:['E','E2','E3'][i],section:index,phase:'idle',direction:-1,stride:0,timer:0,windup:i===1?.35:.75-i*.1,speed:i===1?PHYSICS.speed:740+i*90,approachSpeed:i===1?PHYSICS.speed*2.4:null,chase:i===1})),
      exit:{x:end,y:510},trap:{enabled:false,chance:0,speed:1800,windup:.5,shots:0,waves:0},retired:false});
  }
  const gaps=index===0?[740,900,1530,1680]:[780,920,1600,1740];
  const extraGaps=index===0?[2620,2770,3330,3490]:[2580,2760,3300,3500];
  const ground=[{x:index===0?-300:0,y:510,w:gaps[0]+(index===0?300:0),h:700},{x:gaps[1],y:510,w:gaps[2]-gaps[1],h:700},{x:gaps[3],y:510,w:extraGaps[0]-gaps[3],h:700},{x:extraGaps[1],y:510,w:extraGaps[2]-extraGaps[1],h:700},{x:extraGaps[3],y:510,w:SECTION_LENGTH-extraGaps[3],h:700}];
  const mounds=index===0?[
    {x:235,y:455,w:125},{x:390,y:390,w:220},{x:1360,y:445,w:90},{x:1420,y:380,w:110},{x:1830,y:450,w:135},{x:2040,y:395,w:160},{x:660,y:355,w:100,ramp:140,cover:true}
  ]:[{x:240,y:430,w:280,rampRight:90},{x:1380,y:430,w:220}];
  // Keep the approach to each log barrier below jump-over height.
  if(index===0)mounds.splice(4,2);
  mounds.push(...(index===0?[
    {x:2460,y:455,w:100},{x:2540,y:415,w:80,ramp:95},{x:2860,y:460,w:110},{x:3080,y:395,w:250}
  ]:[
    {x:2470,y:450,w:60},{x:2500,y:395,w:80,ramp:100},{x:2840,y:455,w:100},{x:3060,y:370,w:240}
  ]));
  const terraces=index===0?[]:[{x:665,y:350,w:65,h:160}];
  const holes=index===2?[{x:515,y:430,w:150,open:false,armed:false,triggerX:700,plateId:id}]:[];
  const plates=[{id,x:index===0?500:690,y:index===0?390:350,retreatX:700,attackChance:index>0?1:0,cover:index===1?{x:630,w:34}:null,jumpEscape:index===2?{x:480,w:34}:null},{id:id+'2',x:1860,y:510,retreatX:1800,cover:null},{id:id+'3',x:3150,y:index===0?395:370,retreatX:3000,cover:index>0?{x:2970,w:34}:null}];
  const logPiles=[{x:980,y:288,w:260,h:222,requires:[id]},{x:2150,y:288,w:260,h:222,requires:[id+'2']},{x:3650,y:288,w:260,h:222,requires:[id+'3']}];
  const blockedRoute=index===2?'retreat':null;
  const thorns=[];
  const seeds=[];
  const shift=items=>items.map(item=>({...item,x:item.x+start,section:index}));
  return decorateBushes({...CHAPTERS[index],index,start,end,width:end,spawn:{x:start+100,y:510},exit:{x:end,y:510},ground:shift(ground),mounds:shift(mounds),terraces:shift(terraces),bridges:[],sheds:[],holes:shift(holes).map(h=>({...h,triggerX:h.triggerX+start})),plates:shift(plates).map(p=>({...p,retreatX:p.retreatX+start,cover:p.cover?{...p.cover,x:p.cover.x+start}:null,jumpEscape:p.jumpEscape?{...p.jumpEscape,x:p.jumpEscape.x+start}:null})),logPiles:shift(logPiles),thorns:shift(thorns),seeds,blockedRoute,trap:{enabled:index>0,speed:1500+index*100+Math.min(80,(memory.logDeaths||0)*10),windup:.46,shots:index===0?0:24,waves:index===0?0:1,chance:index===0?0:index===1?.5:.7},retired:false});
}

/** The renderer and collisions share this continuous grass-bank profile. */
export function terrainY(level,x){
  if((level.holes||[]).some(h=>h.open&&x>h.x&&x<h.x+h.w))return null;
  const bridge=(level.bridges||[]).find(b=>b.progress>=1&&x>=b.x&&x<=b.x+b.w);if(bridge)return bridge.y;
  const bank=level.ground.find(g=>x>=g.x&&x<=g.x+g.w);
  if(!bank)return null;
  let y=bank.y;
  for(const mound of [...level.mounds,...(level.platforms||[]).filter(p=>p.profile)]){
    if(mound.x<bank.x||mound.x>=bank.x+bank.w)continue;
    const ramp=mound.ramp??120,leftRamp=mound.rampLeft??ramp,rightRamp=mound.rampRight??ramp,start=mound.x-leftRamp,end=mound.x+mound.w+rightRamp;
    if(x<start||x>end)continue;
    const t=x<mound.x?(x-start)/leftRamp:x>mound.x+mound.w?(end-x)/rightRamp:1;
    y=Math.min(y,bank.y-(bank.y-mound.y)*(1-Math.cos(Math.PI*t))/2);
  }
  for(const terrace of level.terraces||[])if(x>=terrace.x&&x<=terrace.x+terrace.w)y=Math.min(y,terrace.y);
  return y;
}

export function groundBanks(level){
  let banks=level.ground.map(bank=>({...bank}));
  for(const hole of level.holes||[])if(hole.open)banks=banks.flatMap(bank=>{
    const end=bank.x+bank.w;if(hole.x>=end||hole.x+hole.w<=bank.x)return[bank];
    const parts=[];if(hole.x>bank.x)parts.push({...bank,w:hole.x-bank.x});if(hole.x+hole.w<end)parts.push({...bank,x:hole.x+hole.w,w:end-hole.x-hole.w});return parts;
  });return banks;
}

/** Attacks are allowed only at authored shelters backed by real, reachable terrain. */
export function logAttackCover(level,plate,pile,trap){
  if(!plate.cover||!pile||!trap.enabled||plate.section===0)return null;
  const {x,w}=plate.cover,y=terrainY(level,x),left=terrainY(level,x-w/2),right=terrainY(level,x+w/2);
  if(y===null||left===null||right===null||Math.max(Math.abs(left-y),Math.abs(right-y))>18||y-plate.y<PHYSICS.height+12)return null;
  const distance=Math.abs(x-plate.x),reaction=trap.windup+Math.abs(pile.x+pile.w/2-plate.x)/trap.speed;
  if(distance>PHYSICS.speed*reaction)return null;
  const from=Math.min(x,plate.x),to=Math.max(x,plate.x);let shield=false;
  // Collapsing soil cannot count as a shelter or a safe route to it, even before it opens.
  if((level.holes||[]).some(h=>h.x<to&&h.x+h.w>from))return null;
  for(let xx=from;xx<=to;xx+=4){const floor=terrainY(level,xx);if(floor===null)return null;if(floor<=y-PHYSICS.height-12)shield=true;}
  return shield?{x,y,w}:null;
}

/** The opening grove trap is escaped by jumping the collapsing retreat path. */
export function logAttackEscape(level,plate,pile,trap){
  if(plate.homing&&pile&&trap.enabled){const shed=level.sheds?.find(s=>Math.abs(s.x+s.w/2-plate.x)<500);if(shed)return {x:shed.x+shed.w/2,y:terrainY(level,shed.x+shed.w/2),w:shed.w-40,kind:'shed'};}
  const cover=logAttackCover(level,plate,pile,trap);if(cover)return {...cover,kind:'cover'};
  if(plate.section!==2||!plate.jumpEscape||!pile||!trap.enabled)return null;
  const {x,w}=plate.jumpEscape,y=terrainY(level,x),left=terrainY(level,x-w/2),right=terrainY(level,x+w/2);
  if(y===null||left===null||right===null||Math.max(Math.abs(left-y),Math.abs(right-y))>12)return null;
  const hole=level.holes.find(h=>h.plateId===plate.id);if(!hole||x+w/2>=hole.x||plate.x<=hole.x+hole.w)return null;
  const discriminant=PHYSICS.jump**2+2*PHYSICS.gravity*(y-plate.y);
  if(discriminant<=0)return null;
  const airborne=(PHYSICS.jump+Math.sqrt(discriminant))/PHYSICS.gravity;
  if(Math.abs(x-plate.x)>PHYSICS.speed*airborne*.85)return null;
  return {x,y,w,kind:'jump'};
}

export class Adventure {
  constructor(index=0,memory={},random=Math.random){
    if(!CHAPTERS[index])throw new Error('Unknown trail section');
    this.random=random;this.memory={...memory};this.activeIndex=index;this.cameraFloor=index*SECTION_LENGTH;this.completed=Array.from({length:index},(_,i)=>i);
    this.sections=CHAPTERS.map((_,i)=>({...createLevel(i,this.memory),retired:i<index}));this.cameraFloor=this.sections[index].start;this.level={sections:this.sections,width:this.sections.at(-1).end+300};
    this.echoes=[];this.seeds=new Set();this.logStacks=new Map();this.route=null;this.attempts=1;this.stats={jumps:0,falls:0,echoes:0};this.pressCounts=new Map();this.playerPressCounts=new Map();this.skyMessages=memory.firstDeath&&!memory.firstDeathDismissed&&memory.firstDeath.section>=index?[{...memory.firstDeath,text:'Baviloya is Watching You'}]:[];this.hasWitnessedDeath=memory.hasWitnessedDeath===true||Boolean(memory.firstDeath);this.echoSerial=0;this.projectiles=[];this.attacks=[];this.dead=false;this.deathTimer=0;this.syncWorld();this.restartTake();
  }
  get section(){return this.sections[this.activeIndex];}
  updateSkyMessages(cameraLeft,viewWidth){
    const visible=this.skyMessages.filter(message=>message.x+220>=cameraLeft&&message.x-220<=cameraLeft+viewWidth);
    if(visible.length!==this.skyMessages.length){this.skyMessages=visible;this.memory.firstDeathDismissed=true;}
  }
  syncWorld(){
    for(const key of ['ground','mounds','plates','logPiles','thorns','seeds','terraces','holes','bridges','sheds','geese','fences','bushes','platforms'])this.level[key]=this.sections.filter(s=>!s.retired).flatMap(s=>s[key]||[]);
    this.level.ground=this.level.ground.reduce((banks,bank)=>{const last=banks.at(-1);if(last&&last.x+last.w===bank.x&&last.y===bank.y)last.w+=bank.w;else banks.push({...bank});return banks;},[]);
    for(const bush of this.level.bushes)if(!Number.isFinite(bush.y))bush.y=terrainY(this.level,bush.x)??510;
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
    this.syncWorld();this.recording=[snapshot(this.player)];this.echoFallback=null;this.recordingStarted=false;this.lastPressed=new Set();this.lastPlateActors=new Map();events.push('section');
  }
  restartTake({preserveWorld=false}={}) {
    for(const bush of this.level.bushes){bush.activated=false;if(!preserveWorld||!bush.berries)Object.assign(bush,{x:bush.homeX,y:terrainY(this.level,bush.homeX),phase:bush.berries?'idle':'dormant',age:0,open:0,reveal:0,stride:0,facing:1,vy:0,grounded:true,jumpCooldown:0});}
    if(!preserveWorld)for(const platform of this.level.platforms)Object.assign(platform,{x:platform.homeX,elapsed:0,running:false,triggered:false,stride:0});
    if(!preserveWorld){for(const goose of this.level.geese)Object.assign(goose,{x:goose.homeX,y:terrainY(this.level,goose.homeX),phase:'idle',direction:-1,stride:0,timer:0});for(const fence of this.level.fences)Object.assign(fence,{broken:false,debris:[]});for(const plate of this.level.plates)if(plate.bell)plate.ring=0;}
    if(!preserveWorld){for(const stack of this.logStacks.values())stack.reset();for(const section of this.sections){for(const bridge of section.bridges)bridge.progress=0;if(section.exit.runaway)Object.assign(section.exit,{x:section.exit.homeX,direction:1,running:false,caught:false,stride:0});}}
    this.player = { ...this.level.spawn, vx:0, vy:0, grounded:true, facing:1, landing:0, stride:0, gait:'idle' };
    this.dead=false;this.deathTimer=0;this.deathBody=null;for(const section of this.sections){section.trapFired=false;section.trapResolved=false;section.retreated=false;for(const plate of section.plates){plate.trapResolved=false;plate.retreated=false;}for(const hole of section.holes){hole.open=false;hole.armed=false;}}if(!preserveWorld){this.projectiles=[];this.attacks=[];}for(const echo of this.echoes)echo.startTick=0;
    this.lastPlateActors=new Map();
    this.tick = 0; this.time = 0; this.won = false; this.coyote = PHYSICS.coyote; this.jumpBuffer = 0;
    this.recording = [snapshot(this.player)]; this.echoFallback=null;this.recordingStarted = false; this.recordingFull = false; this.lastPressed = new Set();
  }
  echoPosition(echo) {
    const elapsed=Math.max(0,this.tick-(echo.startTick||0)),frame=echo.frames[Math.min(elapsed,echo.frames.length-1)];
    return elapsed>=echo.frames.length-1?{...frame,vx:0,vy:0,landing:0}:frame;
  }
  echoActive(echo) { return this.tick-(echo.startTick||0) < (echo.lifetime || ECHO_TICKS); }
  echoRemaining(echo) { return Math.max(0, ((echo.lifetime || ECHO_TICKS) - (this.tick-(echo.startTick||0))) * STEP); }
  get actors() { return [...(this.dead?[]:[this.player]), ...this.echoes.filter(e => this.echoActive(e)).map(e => this.echoPosition(e))]; }
  get viewport(){return this.view||{left:Math.max(this.cameraFloor,this.player.x-360),top:65,right:Math.max(this.cameraFloor,this.player.x-360)+1000,bottom:635};}
  updateLogStacks(dt,events=[],damage=!this.dead){
    for(const pile of this.level.logPiles){
      const stack=this.logStacks.get(pile.x),held=pile.requires.every(id=>this.pressed(id)),phase=stack.phase;
      if(stack.update(held,dt))events.push('logs');
      if(phase==='scattered'&&stack.phase==='building')stack.crushCandidate=damage&&stack.homes.some(log=>logTouchesActor(log,this.player));
      if(stack.crushCandidate&&!stack.homes.some(log=>logTouchesActor(log,this.player)))stack.crushCandidate=false;
      if(damage&&stack.crushCandidate&&stack.newPieces.some(log=>logTouchesActor(log,this.player)))return true;
      if(damage&&stack.solid)pushOutOfLogs(this.player,stack.logs.filter(log=>log.built&&log.opacity>0));
    }return false;
  }
  onPlate(actor, plate) { return actor.grounded && Math.abs(actor.x - plate.x) < 32 && Math.abs(actor.y - plate.y) < 5; }
  pressed(id) { const plate = this.level.plates.find(p => p.id === id); return Boolean(plate && this.actors.some(a => this.onPlate(a, plate))); }
  pileCleared(pile) { return !this.logStacks.get(pile.x).solid; }
  get echoRecording(){return this.recording.length>=12?this.recording:(this.echoFallback||this.recording);}
  echoClip(recording=this.echoRecording){
    return recording.slice(-ECHO_REPLAY_TICKS-1);
  }
  commit() {
    if (this.won||this.dead) return {ok:false,reason:this.dead?'dead':'won'};
    if (!this.player.grounded) return {ok:false,reason:'air'};
    if (this.echoRecording.length < 12) return {ok:false,reason:'empty'};
    const clip=this.echoClip();
    this.echoes = this.echoes.filter(e => this.echoActive(e));
    if (this.echoes.length >= this.level.limit) return {ok:false,reason:'limit'};
    const occupied=new Set(this.echoes.map((echo,i)=>echo.slot??i)),slot=Array.from({length:this.level.limit},(_,i)=>i).find(i=>!occupied.has(i));
    this.echoes.push({ id:++this.echoSerial,slot,startTick:this.tick,frames:clip.map(frame => ({...frame})), lifetime:clip.length-1+(this.section.holdSeconds?Math.round(this.section.holdSeconds/STEP):ECHO_HOLD_TICKS) });
    this.stats.echoes=(this.stats.echoes||0)+1;
    return {ok:true};
  }
  removeEcho() { if (!this.echoes.length) return false; this.echoes.pop(); return true; }
  resetEcho({clearRecording=false}={}){
    const clip=this.echoRecording;this.echoFallback=!clearRecording&&clip.length>=12?clip.map(frame=>({...frame})):null;
    this.echoes=[];this.recording=[snapshot(this.player)];this.recordingStarted=false;this.recordingFull=false;
  }
  reset() { this.echoes = []; this.seeds.clear(); this.attempts = 1; this.route = null;this.stats={jumps:0,falls:0,echoes:0};this.pressCounts.clear();this.playerPressCounts.clear(); this.restartTake(); }
  kill(reason){
    if(this.dead)return [];
    if(!this.hasWitnessedDeath){
      this.hasWitnessedDeath=true;this.skyMessages.push({x:this.player.x,y:Math.min(210,(terrainY(this.level,this.player.x)??510)-240),section:this.activeIndex,text:'Baviloya is Watching You'});
    }
    if(this.skyMessages.length&&!this.memory.firstDeath){this.memory.firstDeath={...this.skyMessages[0]};this.memory.hasWitnessedDeath=true;}
    this.dead=true;this.deathTimer=1.9;this.deathReason=reason;this.attempts++;this.stats.falls++;
    this.deathBody={...snapshot(this.player),age:0,vx:(reason==='logs'&&this.lastHitDirection?this.lastHitDirection:-this.player.facing)*195,vy:-235,angle:0,opacity:1};
    if(reason==='logs')this.memory.logDeaths=(this.memory.logDeaths||0)+1;
    this.player.vx=0;this.player.vy=0;this.resetEcho({clearRecording:true});return ['death'];
  }
  updateBushes(dt,damage=!this.dead){
    return stepBushes(this.level.bushes,this.actors,damage?this.player:null,dt,x=>{
      const ground=terrainY(this.level,x);let floor=ground;
      for(const solid of [...this.level.platforms.filter(p=>!p.profile),...this.level.fences.filter(f=>!f.broken).map(f=>({x:f.x,w:f.w,y:f.y-f.h}))])if(x>=solid.x&&x<=solid.x+solid.w)floor=Math.min(floor??Infinity,solid.y);
      for(const pile of this.level.logPiles){const stack=this.logStacks.get(pile.x);if(stack.solid)for(const log of stack.logs)if(log.built&&log.opacity>0&&Math.abs(x-log.x)<log.len/2)floor=Math.min(floor??Infinity,log.y-log.r);}
      return floor;
    });
  }
  updateAttacks(dt){
    if(this.activeIndex===0){this.attacks=[];this.projectiles=[];return false;}
    for(const attack of this.attacks){
      attack.remaining-=dt;if(attack.remaining>0)continue;
      const stack=this.logStacks.get(attack.pile.x),p=this.player,target=attack.target||{x:p.x,y:p.y-34};
      const plate=this.level.plates.find(plate=>attack.pile.requires.includes(plate.id));
      if(!plate||!logAttackEscape(this.level,plate,attack.pile,attack.trap)){stack.cancelAttack();continue;}
      for(const [i,pose] of stack.logs.entries()){
        const flight=Math.max(.10,Math.hypot(target.x-pose.x,target.y-pose.y)/(attack.trap.speed*(.94+(i%5)*.03)));
        this.projectiles.push({...pose,vx:(target.x-pose.x)/flight,vy:(target.y-pose.y)/flight,spin:(i%2?-1:1)*(16+i%7),age:0,opacity:1,hostile:true,pileX:attack.pile.x});
      }
      stack.launchAttack();
    }
    this.attacks=this.attacks.filter(attack=>attack.remaining>0);
    // A triggered volley finishes even after the player or Echo releases its switch.
    let hit=false;
    this.projectiles=this.projectiles.filter(log=>{
      const view=this.viewport;
      if(log.stage==='waiting'){
        log.wait-=dt;if(log.wait>0)return true;
        if(log.volley)log.volley.committed=true;
        const target=this.player;log.stage='returning';log.hostile=true;log.opacity=1;log.wasVisible=false;log.x=target.x+(this.random()-.5)*240;log.y=view.top-log.len-100;log.vx=0;log.vy=1400;
      }
      if(log.stage==='returning'&&Math.abs(this.player.x-log.sourceX)<1200){
        const dx=this.player.x-log.x,dy=this.player.y-34-log.y,length=Math.hypot(dx,dy)||1;
        const blend=Math.min(1,dt*10);log.vx+=(dx/length*1450-log.vx)*blend;log.vy+=(dy/length*1450-log.vy)*blend;
      }
      const from={x:log.x,y:log.y,angle:log.angle};log.age+=dt;
      if(log.deflected)stepDebris(log,dt,x=>terrainY(this.level,x));else{log.x+=log.vx*dt;log.y+=log.vy*dt;log.angle+=log.spin*dt;}
      const p=this.player,body={x:p.x-PHYSICS.width/2,y:p.y-PHYSICS.height,w:PHYSICS.width,h:PHYSICS.height};
      const collision=log.deflected||log.stage==='outbound'?null:sweepLog(this.level,log,from,log,body,!this.dead);
      if(collision?.kind==='hit'){hit=true;this.lastHitDirection=Math.sign(log.vx);}
      if(collision?.kind==='blocked'||collision?.kind==='roof')Object.assign(log,collision.pose,{hostile:false,deflected:true,deflectedBy:collision.kind,stage:'debris',vx:(this.random()<.5?-1:1)*(500+this.random()*500),vy:-400-this.random()*400,spin:(this.random()-.5)*20,bounces:0,sleeping:false});
      const visible=log.x+log.len>=view.left&&log.x-log.len<=view.right&&log.y+log.len>=view.top&&log.y-log.len<=view.bottom;
      if(visible)log.wasVisible=true;
      if(log.stage==='outbound'&&!visible&&log.age>.05){log.stage='waiting';log.wait=3;log.opacity=0;return true;}
      return visible||!log.wasVisible&&log.age<10;
    });return hit;
  }
  update(input = {}, dt = STEP) {
    if (this.won) return [];
    dt = Math.max(0, Math.min(dt, 1 / 30));
    if(this.dead){
      stepRunawayPlatforms(this.level,dt,this.level.bushes);
      this.updateBushes(dt,false);
      stepGeese(this.level,dt,x=>terrainY(this.level,x));
      this.updateLogStacks(dt,[],false);this.updateAttacks(dt);for(const bridge of this.level.bridges)bridge.progress=approach(bridge.progress,0,dt/.4);
      const flag=this.section.exit;if(flag.running&&!flag.caught){flag.x+=flag.direction*390*dt;flag.stride+=dt*15;if(flag.x>=flag.maxX){flag.x=flag.maxX;flag.direction=-1;}else if(flag.x<=flag.minX){flag.x=flag.minX;flag.direction=1;}}
      this.deathTimer-=dt;const body=this.deathBody;body.age+=dt;
      if(body.eater){const t=Math.min(1,body.age/.38),ease=t*t*(3-2*t);body.x=body.fromX+(body.eater.x-body.fromX)*ease;body.y=body.fromY+(body.eater.y-25-body.fromY)*ease;body.scale=1-t;body.angle=t*.8;body.opacity=1-t;}
      else{if(body.age<.5){body.vy+=1000*dt;body.x+=body.vx*dt;body.y+=body.vy*dt;body.angle+=Math.sign(body.vx)*5*dt;const floor=terrainY(this.level,body.x);if(floor!==null&&body.y>floor){body.y=floor;body.vy=0;}}
      body.opacity=body.age>=.9?0:body.age>.38?(Math.floor((body.age-.38)/.065)%2?0:1):1;}
      if(this.deathTimer<=0){this.restartTake();return ['respawn'];}return [];
    }
    const p = this.player, events = [];
    stepRunawayPlatforms(this.level,dt,[p,...this.level.bushes]);
    const pileLogs=this.level.logPiles.filter(pile=>Math.abs(pile.x+pile.w/2-p.x)<pile.w/2+100).flatMap(pile=>{const stack=this.logStacks.get(pile.x);return stack.solid?stack.logs.filter(log=>log.built&&log.opacity>0):[];});
    pushOutOfLogs(p,pileLogs);const previousY=p.y,previousX=p.x;
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
    if(p.grounded&&direction&&p.vx*direction<0)p.vx=0;
    p.vx = approach(p.vx, direction * (input.walk ? PHYSICS.walkSpeed : PHYSICS.speed), (direction ? (p.grounded ? 2300 : 1700) : (p.grounded ? 2800 : 550)) * dt);
    p.gait = Math.abs(p.vx)<18?'idle':input.walk?'walk':'run';
    const solids = [...this.level.terraces,...this.level.platforms.filter(p=>!p.profile),...this.level.sheds.map(s=>({x:s.x-14,y:s.roofY-20,w:s.w+28,h:30})),...this.level.fences.filter(f=>!f.broken).map(f=>({x:f.x,y:f.y-f.h,w:f.w,h:f.h}))];
    const followedGround=p.grounded;
    p.x += p.vx * dt;
    for (const solid of solids) if (overlaps(p, solid)) {
      if (p.vx > 0) p.x = solid.x - PHYSICS.width / 2;
      else if (p.vx < 0) p.x = solid.x + solid.w + PHYSICS.width / 2;
      p.vx = 0;
    }
    if(moveAgainstLogs(p,'x',previousX,pileLogs))p.vx=0;
    // Bank edges are real cliffs; a low jump cannot pass through their sides.
    for(const bank of groundBanks(this.level)){
      if(p.vx>0&&previousX+PHYSICS.width/2<=bank.x&&p.x+PHYSICS.width/2>bank.x&&p.y>terrainY(this.level,bank.x)+1){p.x=bank.x-PHYSICS.width/2;p.vx=0;}
      if(p.vx<0&&previousX-PHYSICS.width/2>=bank.x+bank.w&&p.x-PHYSICS.width/2<bank.x+bank.w&&p.y>terrainY(this.level,bank.x+bank.w)+1){p.x=bank.x+bank.w+PHYSICS.width/2;p.vx=0;}
    }
    p.x = Math.max(this.cameraFloor+48, Math.min(this.level.width-20,p.x));
    if(p.grounded)p.stride += Math.abs(p.vx) * dt / 145;
    const surfaceY=terrainY(this.level,p.x),previousSurface=terrainY(this.level,previousX),wasGrounded=p.grounded;
    const dx=Math.abs(p.x-previousX),drop=surfaceY===null?Infinity:surfaceY-previousY;
    // Walk gentle grades; leave steep downslopes under gravity instead of snapping down.
    const walkingSlope=followedGround&&surfaceY!==null&&previousSurface!==null&&Math.abs(previousSurface-previousY)<1&&drop<=dx*1.4+.05;
    if(walkingSlope){p.y=surfaceY;p.vy=0;p.grounded=true;}
    else{
      p.vy = Math.min(1000, p.vy + PHYSICS.gravity * (p.vy < 0 && !input.jumpHeld ? 2.2 : 1) * dt);
      p.y += p.vy * dt;p.grounded=false;
      // Soil is solid regardless of how far a horizontal step penetrated its profile.
      if(surfaceY!==null&&p.y>=surfaceY){
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
    const falling=p.y>=previousY;
    if(moveAgainstLogs(p,'y',previousY,pileLogs)){
      if(falling){if(!wasGrounded&&p.vy>160){p.landing=.16;events.push('land');}p.grounded=true;}p.vy=0;
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
        // Joining an already-held plate is not another physical press.
        const entrant=contacts.has('player')?'player':contacts.values().next().value;
        if(actor===entrant&&before.size===0&&plate.bell){const pressing=actor==='player'?p:this.echoPosition(this.echoes.find(e=>'echo:'+e.id===actor));if(ringBell(this.level.geese,plate,pressing)){events.push('honk');startRunawayPlatform(this.level,plate.id);}}
        const section=this.sections[plate.section],learned=plate.section>0&&actor===entrant&&before.size===0;
        if(learned){plate.trapResolved=true;if(plate===section.plates[0])section.trapResolved=true;for(const hole of section.holes)if(hole.plateId===plate.id)hole.armed=true;}
        if(learned){
          const pile=this.level.logPiles.find(pile=>pile.requires.includes(plate.id));
          const volleyActive=pile&&this.projectiles.some(log=>log.pileX===pile.x&&(log.hostile||log.volley&&!log.volley.cancelled&&['outbound','waiting'].includes(log.stage)));
          if(pile&&logAttackEscape(this.level,plate,pile,section.trap)&&!volleyActive&&!this.attacks.some(attack=>attack.pile.x===pile.x)&&this.random()<(plate.attackChance??section.trap.chance)){
            section.trapFired=true;section.trapSeen=true;plate.trapSeen=true;
            if(plate.homing){
              const stack=this.logStacks.get(pile.x),volley={plateId:plate.id,committed:false,cancelled:false};
              for(const [i,home]of stack.homes.entries())this.projectiles.push({...home,vx:(i%2?-1:1)*(900+this.random()*700),vy:-750-this.random()*1000,spin:(i%2?-1:1)*(12+i%7),age:0,opacity:1,hostile:false,stage:'outbound',sourceX:pile.x,pileX:pile.x,volley});
              stack.launchAttack();events.push('logs');continue;
            }
            this.logStacks.get(pile.x).beginAttack();
            const pressing=actor==='player'?p:this.echoPosition(this.echoes.find(e=>'echo:'+e.id===actor));
            for(let wave=0;wave<section.trap.waves;wave++)this.attacks.push({pile,remaining:section.trap.windup+wave*.24,trap:section.trap,target:{x:pressing.x,y:pressing.y-34},actor});
            events.push('warning');
          }
        }
      }
      this.lastPlateActors.set(plate.id,contacts);
      if(contacts.size){if(!this.lastPressed.has(plate.id))events.push('plate');this.lastPressed.add(plate.id);}else this.lastPressed.delete(plate.id);
    }
    if(p.x>this.section.start+1380&&p.x<this.section.start+1540&&this.route!=='high')this.route=p.y<(terrainY(this.level,p.x)??510)-30?'high':'low';
    if(this.updateLogStacks(dt,events))return this.kill('crushed');
    if(this.recordingStarted)this.recording[this.recording.length-1]=snapshot(p);
    for(const plate of this.section.plates)if(this.activeIndex>0&&plate.trapResolved&&p.vx< -30&&p.x<plate.retreatX){
      if(!plate.retreated){plate.retreated=true;this.section.retreated=true;this.memory.retreats=(this.memory.retreats||0)+1;}
      for(const hole of this.section.holes)if(hole.plateId===plate.id&&hole.armed&&!hole.open){hole.open=true;events.push('collapse');}
    }
    const hit=this.updateAttacks(dt);if(hit)return this.kill('logs');
    if(stepGeese(this.level,dt,x=>terrainY(this.level,x),p))return this.kill('goose');
    const eater=this.updateBushes(dt);if(eater){const events=this.kill('bush');Object.assign(this.deathBody,{eater,fromX:p.x,fromY:p.y,scale:1});return events;}
    for(const bridge of this.level.bridges){const held=bridge.requires.every(id=>this.pressed(id));bridge.progress=approach(bridge.progress,held?1:0,dt/(held?.6:.4));}
    const flag=this.section.exit;
    if(flag.runaway){
      if(!flag.running&&!flag.caught&&Math.abs(p.x-flag.x)<220){flag.running=true;events.push('flag-run');}
      if(flag.running&&!flag.caught){
        const previous=flag.x;flag.x+=flag.direction*390*dt;flag.stride+=dt*15;
        if(this.pressed(flag.requires)&&Math.min(previous,flag.x)<=flag.trapX&&Math.max(previous,flag.x)>=flag.trapX){flag.x=flag.trapX;flag.caught=true;flag.running=false;events.push('flag-caught');}
        else if(flag.x>=flag.maxX){flag.x=flag.maxX;flag.direction=-1;}else if(flag.x<=flag.minX){flag.x=flag.minX;flag.direction=1;}
      }
      if(flag.caught&&Math.abs(p.x-flag.x)<50&&Math.abs(p.y-flag.y)<65)this.finishSection(events);
    }else if(p.x>=this.section.end&&p.y<560)this.finishSection(events);
    return events;
  }
}
