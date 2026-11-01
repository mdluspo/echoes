import { terrainY, groundBanks } from './engine.js';
const WHITE='#ffffff', INK='#111111';
const noise=(n,s=0)=>{const v=Math.sin(n*127.1+s*311.7)*43758.5453;return v-Math.floor(v);};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function ink(c,draw,{fill=null,color=INK,width=2.5}={}){
  c.save();c.beginPath();draw(c);if(fill){c.fillStyle=fill;c.fill();}
  if(color){c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();c.translate(.45,-.3);c.globalAlpha*=.4;c.lineWidth=.65;c.beginPath();draw(c);c.stroke();}c.restore();
}
function line(c,points,color=INK,width=2){ink(c,p=>{p.moveTo(...points[0]);for(const point of points.slice(1))p.lineTo(...point);},{color,width});}
function oval(c,x,y,rx,ry,fill=null,color=INK,width=2){ink(c,p=>p.ellipse(x,y,rx,ry,-.03,0,Math.PI*2),{fill,color,width});}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Could not load ${src}`));image.src=src;});}
export function mainSpriteBand(rows){
  let best={top:0,bottom:rows.length-1,pixels:0},band=null;
  rows.forEach((pixels,y)=>{
    if(pixels){band||={top:y,bottom:y,pixels:0};band.bottom=y;band.pixels+=pixels;}
    if(band&&(!pixels||y===rows.length-1)){if(band.pixels>best.pixels)best=band;band=null;}
  });return best;
}
function bounds(image,x=0,y=0,w=image.width,h=image.height){
  const scan=document.createElement('canvas');scan.width=w;scan.height=h;const c=scan.getContext('2d',{willReadFrequently:true});c.drawImage(image,x,y,w,h,0,0,w,h);const data=c.getImageData(0,0,w,h).data;
  // Row boundaries in the supplied sheet include a few pixels from the pose above.
  // Keep the complete main drawing and exclude detached scraps; never alter the source.
  const rows=Array.from({length:h},(_,yy)=>{let n=0;for(let xx=0;xx<w;xx++)if(data[(yy*w+xx)*4+3]>30)n++;return n;}),band=mainSpriteBand(rows);
  let left=w,top=h,right=0,bottom=0;
  for(let yy=band.top;yy<=band.bottom;yy++)for(let xx=0;xx<w;xx++)if(data[(yy*w+xx)*4+3]>30){left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);}
  return{sx:x+left,sy:y+top,cw:right-left+1,ch:bottom-top+1,left,top,right,bottom};
}
export async function loadArtwork(){
  const [idle,walk,jump,landscape]=await Promise.all(['hamster-idle.png','hamster-run.png','hamster-jump.png','meadow-sketch-v1.png'].map(name=>loadImage('/src/assets/'+name)));
  const frames=[];
  for(const atlas of [idle,walk,jump]){
    const row=Array.from({length:6},(_,column)=>{const cw=atlas.width/6,ch=atlas.height,b=bounds(atlas,column*cw,0,cw,ch);return{atlas,sx:b.sx,sy:b.sy,cw:b.cw,ch:b.ch,anchorX:cw*.5-b.left,anchorY:b.bottom+1-b.top,b};});
    const baseline=Math.max(...row.map(f=>f.b.bottom+1));
    if(atlas!==jump)for(const f of row)f.anchorY=baseline-f.b.top;
    frames.push(...row);
  }
  return{frames,landscape,scale:72/frames[0].b.ch};
}
export function hamsterFrame(p,time){
  if(p.landing>.04)return 17;
  if(!p.grounded)return p.vy < -440?13:p.vy < -100?14:p.vy < 120?15:16;
  if(Math.abs(p.vx)>18)return 6+Math.floor((p.stride||0)*6)%6;
  return Math.floor(time/210)%6;
}
export function groundProfilePoints(level,left,right){
  const points=new Set([left,right]);
  for(let x=Math.ceil(left/4)*4;x<right;x+=4)points.add(x);
  for(const mound of level.mounds){const ramp=mound.ramp??120;for(const x of [mound.x-(mound.rampLeft??ramp),mound.x,mound.x+mound.w,mound.x+mound.w+(mound.rampRight??ramp)])if(x>left&&x<right)points.add(x);}
  for(const terrace of level.terraces)for(const edge of [terrace.x,terrace.x+terrace.w])for(const x of [edge-.01,edge,edge+.01])if(x>left&&x<right)points.add(x);
  return [...points].sort((a,b)=>a-b).map(x=>[x,terrainY(level,x)]);
}
export function drawHamster(c,p,time,art,{opacity=1,celebrate=false,dead=false}={}){
  const f=art.frames[dead?0:hamsterFrame(p,time)],s=art.scale;
  c.save();if(dead){c.translate(p.x,p.y-36);c.rotate(p.angle||0);c.scale(p.facing,1);}else{c.translate(p.x,p.y);c.scale(p.facing,1);}c.globalAlpha*=opacity;
  const hop=celebrate?-Math.abs(Math.sin(time/170))*7:0;
  c.drawImage(f.atlas,f.sx,f.sy,f.cw,f.ch,-f.anchorX*s,-f.anchorY*s+(dead?36:hop),f.cw*s,f.ch*s);c.restore();
}
export class Illustrator{
  constructor(canvas,art){this.canvas=canvas;this.c=canvas.getContext('2d');this.art=art;this.camera=0;this.cameraReady=false;this.particles=[];this.logSprites=new Map();this.flash=0;this.resize();}
  resize(){const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*this.dpr);this.canvas.height=Math.round(r.height*this.dpr);this.scale=Math.min(r.height/570,Math.max(r.height/720,Math.min(r.width/1000,1.6)));this.viewWidth=r.width/this.scale;this.viewHeight=r.height/this.scale;this.cameraY=510-this.viewHeight*.78;}
  rewind(){this.cameraReady=false;this.returnPan=null;this.flash=.3;this.particles=[];}
  burst(p,kind='land'){for(let i=0;i<7;i++)this.particles.push({x:p.x,y:p.y-(kind==='seed'?25:2),vx:(noise(i,p.x)*2-1)*65,vy:-20-noise(i,p.y)*65,age:0,life:.35+noise(i)*.3});}
  draw(game,time,dt,{motion=true,paused=false}={}){
    const c=this.c,l=game.level,t=motion?time:0,returning=game.dead&&game.deathBody.age>=.9,focus=returning?l.spawn:game.player,target=focus.x-this.viewWidth*.36+(returning?1:game.player.facing)*22;
    const cameraTarget=clamp(target,game.cameraFloor,Math.max(game.cameraFloor,l.width-this.viewWidth));
    if(returning&&this.cameraReady){
      if(this.returnPan?.body!==game.deathBody)this.returnPan={body:game.deathBody,from:this.camera,start:game.deathBody.age};
      const progress=clamp((game.deathBody.age-this.returnPan.start)/.9,0,1),ease=progress*progress*(3-2*progress);
      this.camera=this.returnPan.from+(cameraTarget-this.returnPan.from)*ease;
    }else{
      this.returnPan=null;this.camera=this.cameraReady?this.camera+(cameraTarget-this.camera)*(1-Math.exp(-(paused?0:dt)*5)):cameraTarget;
    }
    this.cameraReady=true;game.updateSkyMessages(this.camera,this.viewWidth);game.retireBehind(this.camera);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle=WHITE;c.fillRect(0,0,this.width,this.height);c.save();c.scale(this.scale,this.scale);c.translate(-this.camera,-this.cameraY);
    this.background(c,t);this.pits(c,l,t);
    for(const message of game.skyMessages){
      if(message.x+220<this.camera||message.x-220>this.camera+this.viewWidth)continue;
      c.save();c.translate(message.x,message.y);c.rotate(-.025);c.font='700 28px "IM Fell English",Georgia,serif';c.textAlign='center';c.strokeStyle=WHITE;c.lineWidth=4;c.lineJoin='round';c.strokeText(message.text,0,0);c.fillStyle=INK;c.fillText(message.text,0,0);c.strokeStyle=INK;c.lineWidth=.55;c.strokeText(message.text,0,0);c.restore();
    }
    for(const g of groundBanks(l))this.ground(c,g,l,t);
    for(const thorn of l.thorns)for(let i=0;i<3;i++){const x=thorn.x+i*10;line(c,[[x,thorn.y+thorn.h],[x-4,thorn.y+15],[x+10,thorn.y+30]],INK,4);line(c,[[x-4,thorn.y+25],[x-12,thorn.y+18],[x-7,thorn.y+38]],INK,2.5);}
    for(const p of l.plates)this.plate(c,p,game.pressed(p.id));
    for(const pile of l.logPiles){
      const stack=game.logStacks.get(pile.x);
      for(const log of [...stack.logs].sort((a,b)=>b.y-a.y||b.x-a.x)){
        if(log.opacity<=0||log.x+log.len<this.camera||log.x-log.len>this.camera+this.viewWidth||log.y+log.len<this.cameraY||log.y-log.len>this.cameraY+this.viewHeight)continue;
        this.log(c,log);
      }
      if(stack.solid){const top=stack.logs.at(-1);this.rune(c,top.x+7,top.y,pile.requires[0],4);}
    }
    for(const log of game.projectiles){
      const speed=Math.hypot(log.vx,log.vy)||1;
      line(c,[[log.x-log.vx/speed*42,log.y-log.vy/speed*42],[log.x-log.vx/speed*65,log.y-log.vy/speed*65]],INK,2);
      this.log(c,log);
    }
    for(const attack of game.attacks){const x=attack.pile.x+attack.pile.w/2,y=attack.pile.y-18;line(c,[[x-12,y-5],[x-20,y-17]],INK,2);line(c,[[x,y-9],[x,y-24]],INK,2);line(c,[[x+12,y-5],[x+20,y-17]],INK,2);}
    for(const section of l.sections)if(!section.retired)this.exit(c,section.exit,section.index<game.activeIndex,t);
    l.seeds.forEach((s,i)=>{if(!game.seeds.has(s.id)){const y=s.y+Math.sin(t/400+s.x)*2;ink(c,p=>{p.moveTo(s.x,y-6);p.bezierCurveTo(s.x-7,y,s.x-5,y+7,s.x,y+7);p.bezierCurveTo(s.x+7,y+5,s.x+7,y,s.x,y-6);},{fill:WHITE,width:1.5});line(c,[[s.x,y-2],[s.x,y+4]],INK,1);}});
    for(const echo of game.echoes){
      if(!game.echoActive(echo))continue;
      const actor=game.echoPosition(echo),remaining=game.echoRemaining(echo),fade=Math.min(1,remaining/.7);
      drawHamster(c,actor,motion||Math.abs(actor.vx)>18?time:0,this.art,{opacity:.38*fade});
      c.save();c.globalAlpha=fade*.7;c.beginPath();c.arc(actor.x,actor.y-86,6,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(remaining/(echo.lifetime/60),0,1));c.strokeStyle=INK;c.lineWidth=1.5;c.stroke();c.restore();
    }
    if(game.dead){if(game.deathBody.opacity>0)drawHamster(c,game.deathBody,time,this.art,{dead:true,opacity:game.deathBody.opacity});}
    else drawHamster(c,game.player,motion||Math.abs(game.player.vx)>18||!game.player.grounded?time:0,this.art,{celebrate:game.won});
    if(!paused)this.particles.forEach(p=>{p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=130*dt;});this.particles=this.particles.filter(p=>p.age<p.life);
    if(motion)for(const p of this.particles){c.save();c.globalAlpha=(1-p.age/p.life)*.4;line(c,[[p.x,p.y],[p.x+2,p.y-1]],INK,1.4);c.restore();}c.restore();
    this.flash=Math.max(0,this.flash-dt);
  }
  background(c,time){
    const w=1280,h=w*this.art.landscape.height/this.art.landscape.width,offset=this.camera*.7;
    for(let tile=Math.floor(this.camera*.3/w)-1;tile*w<this.camera*.3+this.viewWidth+w;tile++){
      c.save();c.globalAlpha*=.28;c.translate(tile*w+offset,65);if(Math.abs(tile)%2){c.translate(w,0);c.scale(-1,1);}const breeze=Math.sin(time/2100+tile)*.006;c.transform(1,0,breeze,1,-breeze*h*.84,0);c.drawImage(this.art.landscape,0,0,w,h);c.restore();
    }
  }
  pits(c,l,time){
    // Open white space is the drop; two small ink ripples indicate the water below.
    for(let i=0;i<l.ground.length-1;i++){
      const left=l.ground[i].x+l.ground[i].w,right=l.ground[i+1].x,y=l.ground[i].y;
      if(right<this.camera||left>this.camera+this.viewWidth)continue;
      const x=(left+right)/2+Math.sin(time/1200)*2;
      line(c,[[x-24,y+150],[x-10,y+149],[x+1,y+151]],INK,1.3);line(c,[[x+8,y+157],[x+22,y+156]],INK,1.1);
    }
  }
  ground(c,g,l,time){
    if(g.x+g.w<this.camera||g.x>this.camera+this.viewWidth)return;
    const left=Math.max(g.x,this.camera-30),right=Math.min(g.x+g.w,this.camera+this.viewWidth+30);
    // Sampling stays anchored in world space so camera motion cannot redraw the slope.
    const points=groundProfilePoints(l,left,right);
    ink(c,p=>{p.moveTo(...points[0]);for(const point of points)p.lineTo(...point);p.lineTo(right,g.y+g.h);p.lineTo(left,g.y+g.h);p.closePath();},{fill:WHITE,width:3.2});
    // Only a little grass and a few dirt flecks: no exposed roots or stone courses.
    for(let i=Math.floor(left/83);i*83<right;i++){
      const x=i*83+18+noise(i)*20;if(x>right-8||x<left+8)continue;
      const y=terrainY(l,x),lean=Math.sin(i)*1.2+Math.sin(time/650+i*.7)*1.8;
      line(c,[[x-5,y],[x-7+lean,y-6],[x-1,y],[x+1+lean,y-10],[x+3,y],[x+7,y-4]],INK,1.1);
      const yy=y+24+noise(i,8)*19;line(c,[[x+8,yy],[x+12,yy-1]],INK,1);if(i%2===0)line(c,[[x+31,yy+14],[x+33,yy+15]],INK,1);
    }
  }
  log(c,log){
    const key=log.len.toFixed(2)+':'+log.r;
    let sprite=this.logSprites.get(key);
    if(!sprite){
      const canvas=document.createElement('canvas'),w=Math.ceil(log.len+12),h=Math.ceil(log.r*2+12),ratio=this.dpr;
      canvas.width=w*ratio;canvas.height=h*ratio;const pen=canvas.getContext('2d');pen.scale(ratio,ratio);
      this.logOutline(pen,{...log,x:w/2,y:h/2,angle:0});sprite={canvas,w,h};this.logSprites.set(key,sprite);
    }
    c.save();c.translate(log.x,log.y);c.rotate(log.angle);c.scale(log.scale??1,log.scale??1);c.globalAlpha*=log.opacity??1;
    c.drawImage(sprite.canvas,-sprite.w/2,-sprite.h/2,sprite.w,sprite.h);c.restore();
  }
  logOutline(c,log){
    c.save();c.translate(log.x,log.y);c.rotate(log.angle);
    ink(c,p=>{p.moveTo(-log.len/2+5,-log.r);p.quadraticCurveTo(0,-log.r-1,log.len/2-4,-log.r);p.quadraticCurveTo(log.len/2+4,0,log.len/2-4,log.r);p.quadraticCurveTo(0,log.r+1,-log.len/2+5,log.r);p.quadraticCurveTo(-log.len/2-2,0,-log.len/2+5,-log.r);p.closePath();},{fill:WHITE,width:2.2});
    oval(c,log.len/2-7,0,10,log.r,WHITE,INK,1.8);oval(c,log.len/2-7,0,5,log.r*.56,null,INK,1);
    line(c,[[-log.len*.32,-5],[-log.len*.05,-4],[log.len*.12,-6]],INK,1);line(c,[[-log.len*.3,7],[log.len*.13,6]],INK,.8);c.restore();
  }
  plate(c,p,on){
    ink(c,q=>{q.moveTo(p.x-26,p.y-2);q.lineTo(p.x-21,p.y-8);q.lineTo(p.x+23,p.y-7);q.lineTo(p.x+27,p.y-2);q.closePath();},{fill:on?INK:WHITE,color:INK,width:2});
    for(let i=0;i<7;i++)line(c,[[p.x-18+i*6,p.y-6],[p.x-21+i*6,p.y-2]],on?WHITE:INK,1.2);
    this.rune(c,p.x,p.y-20,p.id,8,on?INK:INK);
  }
  rune(c,x,y,id,size=8,color=INK){
    c.save();c.translate(x,y);c.scale(size/8,size/8);
    if(/[23]$/.test(id)){const count=Number(id.at(-1));for(let i=0;i<count;i++)line(c,[[-6+i*6,-6],[-8+i*6,6]],color,1.6);}
    else if(id==='A'){line(c,[[0,8],[-1,-7]],color,1.6);line(c,[[-7,-3],[-1,3],[6,-5]],color,1.6);}
    else{line(c,[[0,-8],[-6,0],[0,8],[6,0],[0,-8]],color,1.5);line(c,[[-8,0],[8,-1]],color,1.5);}
    c.restore();
  }
  exit(c,p,open,time){
    const x=p.x,y=p.y;
    line(c,[[x-2,y],[x-3,y-116],[x+1,y-118],[x+2,y]],INK,2.4);
    const flutter=Math.sin(time/330+x)*3;
    ink(c,q=>{q.moveTo(x+1,y-114);q.bezierCurveTo(x+20,y-119+flutter,x+35,y-99-flutter,x+52,y-108+flutter);q.lineTo(x+45,y-72+flutter);q.bezierCurveTo(x+26,y-66-flutter,x+19,y-88+flutter,x+2,y-80);q.closePath();},{fill:WHITE,width:2});
    if(open)line(c,[[x+13,y-97],[x+21,y-88],[x+36,y-100]],INK,1.6);
  }
}
