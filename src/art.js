import { terrainY, groundBanks } from './engine.js';
import { BUSH_ATLAS, BUSH_MOUTHS, bushSpriteFrame } from './bush-sprites.js';
const WHITE='#ffffff', INK='#111111';
const noise=(n,s=0)=>{const v=Math.sin(n*127.1+s*311.7)*43758.5453;return v-Math.floor(v);};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function ink(c,draw,{fill=null,color=INK,width=2.5}={}){
  c.save();c.beginPath();draw(c);if(fill){c.fillStyle=fill;c.fill();}
  if(color){c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();c.translate(.45,-.3);c.globalAlpha*=.4;c.lineWidth=.65;c.beginPath();draw(c);c.stroke();}c.restore();
}
function line(c,points,color=INK,width=2){ink(c,p=>{p.moveTo(...points[0]);for(const point of points.slice(1))p.lineTo(...point);},{color,width});}
function oval(c,x,y,rx,ry,fill=null,color=INK,width=2){ink(c,p=>p.ellipse(x,y,rx,ry,-.03,0,Math.PI*2),{fill,color,width});}
function bushShape(b){
  const seed=(b.homeX??b.x)+(b.variant||0)*271,random=i=>noise(i,seed);
  const berries=[];
  for(let i=0;i<50&&berries.length<3+Math.floor(random(180)*2);i++){
    const berry={x:-42+random(200+i*3)*84,y:-27-random(201+i*3)*30,r:4.5+random(202+i*3)*.7};
    if(berries.every(other=>Math.hypot(other.x-berry.x,other.y-berry.y)>20))berries.push(berry);
  }
  return {width:.92+random(1)*.2,height:.91+random(2)*.16,flip:random(3)<.5?-1:1,berries};
}
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
  const [idle,walk,jump,landscape,bushSheet]=await Promise.all(['hamster-idle.png','hamster-run.png','hamster-jump.png','meadow-sketch-v1.png','bush-killer-sheet.png'].map(name=>loadImage('/src/assets/'+name)));
  const frames=[];
  for(const atlas of [idle,walk,jump]){
    const row=Array.from({length:6},(_,column)=>{const cw=atlas.width/6,ch=atlas.height,b=bounds(atlas,column*cw,0,cw,ch);return{atlas,sx:b.sx,sy:b.sy,cw:b.cw,ch:b.ch,anchorX:cw*.5-b.left,anchorY:b.bottom+1-b.top,b};});
    const baseline=Math.max(...row.map(f=>f.b.bottom+1));
    if(atlas!==jump)for(const f of row)f.anchorY=baseline-f.b.top;
    frames.push(...row);
  }
  return{frames,landscape,bushSheet,scale:72/frames[0].b.ch};
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
  for(const mound of [...level.mounds,...(level.platforms||[]).filter(p=>p.profile)]){const ramp=mound.ramp??120;for(const x of [mound.x-(mound.rampLeft??ramp),mound.x,mound.x+mound.w,mound.x+mound.w+(mound.rampRight??ramp)])if(x>left&&x<right)points.add(x);}
  for(const terrace of level.terraces)for(const edge of [terrace.x,terrace.x+terrace.w])for(const x of [edge-.01,edge,edge+.01])if(x>left&&x<right)points.add(x);
  return [...points].sort((a,b)=>a-b).map(x=>[x,terrainY(level,x)]);
}
export function drawHamster(c,p,time,art,{opacity=1,celebrate=false,dead=false}={}){
  const f=art.frames[dead?0:hamsterFrame(p,time)],s=art.scale;
  c.save();if(dead){c.translate(p.x,p.y-36);c.rotate(p.angle||0);c.scale(p.facing*(p.scale??1),p.scale??1);}else{c.translate(p.x,p.y);c.scale(p.facing,1);}c.globalAlpha*=opacity;
  const hop=celebrate?-Math.abs(Math.sin(time/170))*7:0;
  c.drawImage(f.atlas,f.sx,f.sy,f.cw,f.ch,-f.anchorX*s,-f.anchorY*s+(dead?36:hop),f.cw*s,f.ch*s);c.restore();
}
export class Illustrator{
  constructor(canvas,art){this.canvas=canvas;this.c=canvas.getContext('2d');this.art=art;this.camera=0;this.cameraReady=false;this.particles=[];this.logSprites=new Map();this.bushShapes=new Map();this.flash=0;this.resize();}
  resize(){const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*this.dpr);this.canvas.height=Math.round(r.height*this.dpr);this.scale=Math.min(r.height/570,Math.max(r.height/720,Math.min(r.width/1000,1.6)));this.viewWidth=r.width/this.scale;this.viewHeight=r.height/this.scale;this.cameraY=510-this.viewHeight*.78;}
  rewind(){this.cameraReady=false;this.returnPan=null;this.flash=.3;this.particles=[];}
  burst(p,kind='land'){for(let i=0;i<7;i++)this.particles.push({x:p.x,y:p.y-(kind==='seed'?25:2),vx:(noise(i,p.x)*2-1)*65,vy:-20-noise(i,p.y)*65,age:0,life:.35+noise(i)*.3});}
  draw(game,time,dt,{motion=true,paused=false}={}){
    const c=this.c,l=game.level,t=motion?time:0,returning=game.dead&&game.deathBody.age>=.9,focus=returning?l.spawn:game.player,target=focus.x-this.viewWidth*.36+(returning?1:game.player.facing)*22;
    const cameraTarget=clamp(target,game.cameraFloor,Math.max(game.cameraFloor,l.width-this.viewWidth));
    if(l.vertical){const verticalTarget=clamp(focus.y-this.viewHeight*.62,l.cameraTop??-260,510-this.viewHeight*.78);this.cameraY=this.cameraReady?this.cameraY+(verticalTarget-this.cameraY)*(1-Math.exp(-(paused?0:dt)*5)):verticalTarget;}
    else this.cameraY=510-this.viewHeight*.78;
    if(returning&&this.cameraReady){
      if(this.returnPan?.body!==game.deathBody)this.returnPan={body:game.deathBody,from:this.camera,start:game.deathBody.age};
      const progress=clamp((game.deathBody.age-this.returnPan.start)/.9,0,1),ease=progress*progress*(3-2*progress);
      this.camera=this.returnPan.from+(cameraTarget-this.returnPan.from)*ease;
    }else{
      this.returnPan=null;this.camera=this.cameraReady?this.camera+(cameraTarget-this.camera)*(1-Math.exp(-(paused?0:dt)*5)):cameraTarget;
    }
    this.cameraReady=true;game.view={left:this.camera,top:this.cameraY,right:this.camera+this.viewWidth,bottom:this.cameraY+this.viewHeight};game.updateSkyMessages(this.camera,this.viewWidth);game.retireBehind(this.camera);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle=WHITE;c.fillRect(0,0,this.width,this.height);c.save();c.scale(this.scale,this.scale);c.translate(-this.camera,-this.cameraY);
    this.background(c,t);if(l.tree)for(const tree of l.tree)this.tree(c,tree,t);this.pits(c,l,t);
    for(const g of groundBanks(l))this.ground(c,g,l,t);
    if(l.index===0)this.instruction(c,"Echoes copy your last 3 seconds of actions.",1700,300);
    for(const bush of l.bushes)if(bush.x+150>this.camera&&bush.x-150<this.camera+this.viewWidth)this.bush(c,bush,t);
    for(const bridge of l.bridges)this.bridge(c,bridge);
    for(const platform of l.woodPlatforms||[])this.woodPlatform(c,platform);
    for(const shed of l.sheds)this.shed(c,shed,l);
    for(const fence of l.fences)this.fence(c,fence);
    for(const plate of l.plates)if(plate.bell)this.bell(c,plate,t);
    for(const thorn of l.thorns)for(let i=0;i<3;i++){const x=thorn.x+i*10;line(c,[[x,thorn.y+thorn.h],[x-4,thorn.y+15],[x+10,thorn.y+30]],INK,4);line(c,[[x-4,thorn.y+25],[x-12,thorn.y+18],[x-7,thorn.y+38]],INK,2.5);}
    for(const pile of l.logPiles){
      const stack=game.logStacks.get(pile.x);
      for(const log of [...stack.logs].sort((a,b)=>a.y-b.y||b.x-a.x)){
        if(log.opacity<=0||log.x+log.len<this.camera||log.x-log.len>this.camera+this.viewWidth||log.y+log.len<this.cameraY||log.y-log.len>this.cameraY+this.viewHeight)continue;
        this.log(c,log);
      }
      if(stack.phase==='stacked'){const top=stack.logs.at(-1);pile.requires.forEach((id,i)=>this.rune(c,top.x+7+(i-(pile.requires.length-1)/2)*26,top.y,id,4));}
    }
    for(const log of game.projectiles)this.log(c,log);
    for(const attack of game.attacks){const x=attack.pile.x+attack.pile.w/2,y=attack.pile.y-18;line(c,[[x-12,y-5],[x-20,y-17]],INK,2);line(c,[[x,y-9],[x,y-24]],INK,2);line(c,[[x+12,y-5],[x+20,y-17]],INK,2);}
    for(const section of l.sections)if(!section.retired&&!section.inProgress){if(section.exit.runaway)this.snare(c,section.exit,game.pressed(section.exit.requires));this.exit(c,section.exit,section.index<game.activeIndex||game.won,t);}
    for(const p of l.plates)this.plate(c,p,game.pressed(p.id),l.index===0&&p.id==='A');
    for(const goose of l.geese)if(goose.x+90>this.camera&&goose.x-90<this.camera+this.viewWidth)this.goose(c,goose,t);
    for(const echo of game.echoes){
      if(!game.echoActive(echo))continue;
      const actor=game.echoPosition(echo),remaining=game.echoRemaining(echo),fade=Math.min(1,remaining/.7);
      const others=[game.player,...game.echoes.filter(other=>other.id!==echo.id&&game.echoActive(other)).map(other=>game.echoPosition(other))];
      const overlap=others.some(other=>Math.abs(other.x-actor.x)<18&&Math.abs(other.y-actor.y)<18),offset=overlap?(echo.slot===1?12:-12):0;
      drawHamster(c,{...actor,x:actor.x+offset},motion||Math.abs(actor.vx)>18?time:0,this.art,{opacity:.46*fade});
      const offscreen=actor.x<this.camera||actor.x>this.camera+this.viewWidth,markerX=clamp(actor.x+offset,this.camera+20,this.camera+this.viewWidth-20),markerY=clamp(actor.y-86,this.cameraY+90,this.cameraY+this.viewHeight-50)+(offscreen?(echo.slot??0)*24:0);
      c.save();c.globalAlpha=fade*.8;c.beginPath();c.arc(markerX,markerY,6,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(remaining/(echo.lifetime/60),0,1));c.strokeStyle=INK;c.lineWidth=1.5;c.stroke();
      for(let i=0;i<(echo.slot??0)+1;i++)line(c,[[markerX-1+i*3,markerY-2],[markerX-1+i*3,markerY+2]],INK,1);
      if(offscreen){const sign=actor.x<this.camera?-1:1;line(c,[[markerX-sign*2,markerY+13],[markerX+sign*5,markerY+17],[markerX-sign*2,markerY+21]],INK,1.4);}c.restore();
    }
    if(game.dead){if(game.deathBody.opacity>0)drawHamster(c,game.deathBody,time,this.art,{dead:true,opacity:game.deathBody.opacity});}
    else drawHamster(c,game.player,motion||Math.abs(game.player.vx)>18||!game.player.grounded?time:0,this.art,{celebrate:game.won});
    for(const bush of l.bushes)if(bush.reveal>.03&&bush.x+150>this.camera&&bush.x-150<this.camera+this.viewWidth)this.bush(c,bush,t,{teethOnly:true});
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
  plate(c,p,on,showHint=false){
    if(showHint){
      this.instruction(c,"Press 'E' to place an Echo",p.x,p.y-54,16);
    }
    ink(c,q=>{q.moveTo(p.x-26,p.y-2);q.lineTo(p.x-21,p.y-8);q.lineTo(p.x+23,p.y-7);q.lineTo(p.x+27,p.y-2);q.closePath();},{fill:on?INK:WHITE,color:INK,width:2});
    for(let i=0;i<7;i++)line(c,[[p.x-18+i*6,p.y-6],[p.x-21+i*6,p.y-2]],on?WHITE:INK,1.2);
    this.rune(c,p.x,p.y-20,p.id,8,on?INK:INK);
  }
  instruction(c,text,x,y,size=15){
    c.save();c.font=`${size}px "IM Fell English",Georgia,serif`;c.textAlign='center';c.textBaseline='middle';c.strokeStyle=WHITE;c.lineWidth=4;c.lineJoin='round';c.strokeText(text,x,y);c.fillStyle=INK;c.fillText(text,x,y);c.restore();
  }
  rune(c,x,y,id,size=8,color=INK){
    c.save();c.translate(x,y);c.scale(size/8,size/8);
    if(/[2-9]$/.test(id)){const count=Number(id.at(-1));for(let i=0;i<count;i++)line(c,[[-(count-1)*3+i*6,-6],[-(count-1)*3-2+i*6,6]],color,1.6);}
    else if(id==='A'){line(c,[[0,8],[-1,-7]],color,1.6);line(c,[[-7,-3],[-1,3],[6,-5]],color,1.6);}
    else{line(c,[[0,-8],[-6,0],[0,8],[6,0],[0,-8]],color,1.5);line(c,[[-8,0],[8,-1]],color,1.5);}
    c.restore();
  }
  bridge(c,b){
    const angle=(1-b.progress)*Math.PI*.47;
    for(const side of [0,1]){
      const hinge=b.x+side*b.w,sign=side?-1:1;
      line(c,[[hinge-sign*15,b.y+3],[hinge-sign*15,b.y-70]],INK,3);
      line(c,[[hinge-sign*15,b.y-70],[hinge+sign*Math.sin(angle)*60,b.y-Math.cos(angle)*60]],INK,1.6);
      oval(c,hinge,b.y+2,4,4,WHITE,INK,1.6);
      this.rune(c,hinge-sign*15,b.y-88,b.requires[side],7);
      c.save();c.translate(hinge,b.y);c.scale(sign,1);c.rotate(angle);
      const half=b.w/2;
      for(let x=0;x<half;x+=19){const end=Math.min(half,x+18);ink(c,p=>{p.moveTo(x,0);p.lineTo(end,-1);p.lineTo(end,8);p.lineTo(x+1,9);p.closePath();},{fill:WHITE,width:1.8});if(x%38===0)line(c,[[x+4,4],[end-3,3]],INK,.7);}
      line(c,[[0,-60],[half*.5,-40],[half,-33]],INK,1.8);
      for(let x=26;x<half;x+=60)line(c,[[x,0],[x,-60+x/half*27]],INK,1.2);
      c.restore();
    }
  }
  woodPlatform(c,p){
    if(p.x+p.w<this.camera||p.x>this.camera+this.viewWidth)return;
    if(p.kind==='tree'){
      ink(c,q=>{q.moveTo(p.x,p.y);q.lineTo(p.x+p.w*.38,p.y);q.lineTo(p.x+p.w*.75,p.y+1);q.lineTo(p.x+p.w,p.y);q.lineTo(p.x+p.w-1,p.y+p.h);q.lineTo(p.x+p.w*.64,p.y+p.h-1);q.lineTo(p.x+2,p.y+p.h);q.closePath();},{fill:WHITE,width:2.2});
      return;
    }
    ink(c,q=>{q.rect(p.x,p.y,p.w,p.h);},{fill:WHITE,color:INK,width:2.2});
    line(c,[[p.x+8,p.y+4],[p.x+p.w-8,p.y+4]],INK,1);
    for(const x of [p.x+12,p.x+p.w-12])line(c,[[x,p.y+p.h],[x,p.y+p.h+12]],INK,1.5);
  }
  tree(c,t,time){
    if(t.x+t.w<this.camera||t.x>this.camera+this.viewWidth)return;
    c.save();c.translate(t.x,t.y);c.scale(t.w/850,t.h/1360);
    // Two open trunk edges and one sweeping branch, following the supplied sketch.
    // The white interior is left clear for the alternating climbing ledges.
    ink(c,p=>{
      p.moveTo(40,1360);p.lineTo(52,1215);p.lineTo(57,1100);p.quadraticCurveTo(66,990,88,905);
      p.lineTo(102,800);p.quadraticCurveTo(108,715,99,650);p.lineTo(88,540);
      p.quadraticCurveTo(74,425,83,315);p.lineTo(87,192);p.lineTo(100,75);p.lineTo(99,12);
    },{width:2.8});
    ink(c,p=>{
      p.moveTo(500,1360);p.lineTo(486,1255);p.lineTo(465,1148);p.quadraticCurveTo(458,1070,450,1000);
      p.lineTo(433,890);p.lineTo(424,780);p.quadraticCurveTo(412,690,419,592);
      p.lineTo(427,470);p.lineTo(423,355);p.quadraticCurveTo(418,220,431,100);p.lineTo(438,0);
    },{width:2.8});
    ink(c,p=>{
      p.moveTo(420,675);p.quadraticCurveTo(452,587,504,562);p.quadraticCurveTo(557,550,595,490);
      p.moveTo(439,685);p.quadraticCurveTo(450,620,508,609);p.quadraticCurveTo(575,594,635,513);
      p.quadraticCurveTo(689,493,712,458);
    },{width:2.6});
    ink(c,p=>{
      p.moveTo(501,500);p.quadraticCurveTo(490,449,495,408);p.lineTo(514,390);p.lineTo(540,390);
      p.quadraticCurveTo(578,360,606,338);p.quadraticCurveTo(613,292,654,265);
      p.quadraticCurveTo(680,235,713,236);p.lineTo(749,237);p.quadraticCurveTo(797,250,835,283);
      p.lineTo(889,328);p.quadraticCurveTo(899,337,902,320);p.quadraticCurveTo(910,268,920,276);
      p.quadraticCurveTo(933,333,905,359);p.quadraticCurveTo(886,376,859,360);
      p.quadraticCurveTo(874,392,867,441);p.quadraticCurveTo(864,463,837,464);
      p.quadraticCurveTo(772,465,721,452);p.quadraticCurveTo(675,439,633,439);p.lineTo(599,439);
      p.moveTo(646,444);p.quadraticCurveTo(591,504,514,532);
    },{width:2.6});
    c.restore();
    this.instruction(c,'Work in progress',t.x+285,t.y-48,25);
  }
  shed(c,s,l){
    for(const x of [s.x+10,s.x+s.w-10]){
      const floor=terrainY(l,x);
      ink(c,p=>{p.moveTo(x-6,s.roofY-3);p.lineTo(x+6,s.roofY-3);p.lineTo(x+5,floor);p.lineTo(x-6,floor);p.closePath();},{fill:WHITE,width:2.5});
      line(c,[[x-2,s.roofY+28],[x-1,floor-18]],INK,.8);
    }
    ink(c,p=>{p.moveTo(s.x-16,s.roofY);p.lineTo(s.x+s.w/2,s.roofY-20);p.lineTo(s.x+s.w+16,s.roofY);p.lineTo(s.x+s.w+13,s.roofY+10);p.lineTo(s.x+s.w/2,s.roofY-9);p.lineTo(s.x-14,s.roofY+10);p.closePath();},{fill:WHITE,width:3});
    for(let i=1;i<6;i++){const x=s.x-10+i*(s.w+20)/6,y=s.roofY-20*(1-Math.abs(x-(s.x+s.w/2))/(s.w/2+16));line(c,[[x,y],[x-2,y+10]],INK,1);}
  }
  snare(c,flag,on){
    const x=flag.trapX,y=flag.y;
    oval(c,x,y+1,36,5,WHITE,INK,1.4);
    for(const side of [-1,1]){line(c,[[x+side*39,y+3],[x+side*38,y-22],[x+side*33,y-23],[x+side*34,y+3]],INK,1.7);if(flag.caught)line(c,[[x+side*37,y-14],[x,y-22]],INK,1.4);}
    this.rune(c,x,y+23,flag.requires,6);
    if(on&&!flag.caught){line(c,[[x-46,y-30],[x-52,y-36]],INK,1.2);line(c,[[x+46,y-30],[x+52,y-36]],INK,1.2);}
  }
  bell(c,b,time){
    line(c,[[b.x-39,b.y],[b.x-40,b.y-155],[b.x+4,b.y-155]],INK,3);
    line(c,[[b.x-40,b.y-128],[b.x-15,b.y-155]],INK,1.8);
    c.save();c.translate(b.x,b.y-150);c.rotate(Math.sin(time/65)*(b.ring||0)*.32);
    line(c,[[0,0],[0,14]],INK,1.7);
    ink(c,p=>{p.moveTo(-3,15);p.quadraticCurveTo(-14,17,-13,33);p.lineTo(-19,40);p.quadraticCurveTo(0,44,19,40);p.lineTo(13,33);p.quadraticCurveTo(13,17,3,15);p.closePath();},{fill:WHITE,width:2.5});
    oval(c,0,45,3,4,INK,INK,1);c.restore();
    if(b.ring>0)for(const side of [-1,1])line(c,[[b.x+side*26,b.y-127],[b.x+side*34,b.y-132]],INK,1.5);
  }
  bush(c,b,time,{teethOnly=false}={}){
    if(!this.art.bushSheet)return;
    const {row,column}=bushSpriteFrame(b,time),a=BUSH_ATLAS,mouth=BUSH_MOUTHS[row*a.columns+column];
    if(teethOnly&&!mouth)return;
    const key=(b.homeX??b.x)+':'+(b.variant||0);let shape=this.bushShapes.get(key);if(!shape){shape=bushShape(b);this.bushShapes.set(key,shape);}
    c.save();c.translate(b.x,b.y);c.scale(a.scale*(b.berries?shape.width*shape.flip:b.facing||1),a.scale*(b.berries?shape.height:1));
    if(teethOnly){c.beginPath();c.rect(mouth.x,mouth.y,mouth.w,mouth.h);c.clip();}
    c.drawImage(this.art.bushSheet,column*a.cellWidth,row*a.cellHeight,a.cellWidth,a.cellHeight,-a.anchorX,-a.anchorY,a.cellWidth,a.cellHeight);
    if(!teethOnly&&b.berries)for(const berry of shape.berries){oval(c,berry.x,berry.y,berry.r,berry.r*1.06,INK,INK,.9);oval(c,berry.x-1.2,berry.y-1.3,1,1,WHITE,null,0);}
    c.restore();
  }
  fence(c,f){
    if(!f.broken){
      for(let i=0;i<5;i++){const x=f.x+6+i*15,top=f.y-f.h+(i%2?7:0);ink(c,p=>{p.moveTo(x-6,f.y);p.lineTo(x-5,top+8);p.lineTo(x,top);p.lineTo(x+6,top+9);p.lineTo(x+5,f.y);p.closePath();},{fill:WHITE,width:2.6});line(c,[[x,top+27],[x-1,f.y-20]],INK,.8);}
      for(const y of [f.y-48,f.y-132])ink(c,p=>{p.moveTo(f.x-4,y);p.lineTo(f.x+f.w+4,y-2);p.lineTo(f.x+f.w+5,y+8);p.lineTo(f.x-4,y+10);p.closePath();},{fill:WHITE,width:2});
    }else for(const chip of f.debris||[]){
      if(chip.age>1.5)continue;c.save();c.globalAlpha=Math.min(1,(1.5-chip.age)*2);c.translate(chip.x,chip.y);c.rotate(chip.angle);
      ink(c,p=>{p.moveTo(-5,-27);p.lineTo(4,-31);p.lineTo(6,28);p.lineTo(-4,32);p.closePath();},{fill:WHITE,width:2});c.restore();
    }
  }
  goose(c,g,time){
    const running=g.phase==='charge'||g.phase==='return',step=running?Math.sin(g.stride):Math.sin(time/650)*.1,bob=running?Math.abs(step)*3:Math.sin(time/440)*1.2;
    c.save();c.translate(g.x,g.y-bob);c.scale(g.direction,1);
    for(const side of [-1,1]){const swing=step*side*14;line(c,[[side*12,-13],[side*12+swing,-4],[side*12+swing+9,0],[side*12+swing-3,0]],INK,2.6);}
    ink(c,p=>{p.moveTo(-28,-22);p.lineTo(-43,-41);p.lineTo(-24,-38);p.bezierCurveTo(-12,-56,9,-54,16,-38);p.bezierCurveTo(15,-55,9,-80,14,-95);p.bezierCurveTo(20,-112,40,-107,38,-92);p.lineTo(32,-87);p.bezierCurveTo(30,-72,37,-43,28,-23);p.bezierCurveTo(17,-6,-14,-6,-28,-22);p.closePath();},{fill:WHITE,width:3});
    ink(c,p=>{p.moveTo(37,-96);p.lineTo(57,-90);p.lineTo(37,-84);p.closePath();},{fill:WHITE,width:2.2});
    oval(c,29,-98,1.6,2.2,INK,INK,1);
    const flap=g.phase==='charge'?Math.sin(g.stride)*9:0;
    ink(c,p=>{p.moveTo(10,-38);p.quadraticCurveTo(-5,-46-flap,-20,-34-flap);p.quadraticCurveTo(-9,-16,10,-30);},{width:1.7});
    if(g.phase==='warning'){line(c,[[20,-105],[32,-102]],INK,2);for(let i=0;i<3;i++)line(c,[[49+i*5,-115-i*3],[53+i*6,-123-i*4]],INK,1.6);}
    if(g.phase==='stunned'){oval(c,-3,-115,3,2,null,INK,1);oval(c,14,-120,2,2,null,INK,1);}
    c.restore();
  }
  exit(c,p,open,time){
    const x=p.x,y=p.y-(p.runaway?15+(p.running?Math.abs(Math.sin(p.stride))*4:0):0);
    if(p.runaway){
      const step=p.running?Math.sin(p.stride)*14:6;
      for(const side of [-1,1])line(c,[[x+side*3,y-2],[x+side*8,y+7],[x+side*step,p.y],[x+side*step+side*7,p.y]],INK,2.3);
      if(p.running)for(let i=0;i<2;i++)line(c,[[x-p.direction*(30+i*9),y+5-i*7],[x-p.direction*(43+i*9),y+5-i*7]],INK,1);
    }
    line(c,[[x-2,y],[x-3,y-116],[x+1,y-118],[x+2,y]],INK,2.4);
    const flutter=Math.sin(time/330+x)*3;
    ink(c,q=>{q.moveTo(x+1,y-114);q.bezierCurveTo(x+20,y-119+flutter,x+35,y-99-flutter,x+52,y-108+flutter);q.lineTo(x+45,y-72+flutter);q.bezierCurveTo(x+26,y-66-flutter,x+19,y-88+flutter,x+2,y-80);q.closePath();},{fill:WHITE,width:2});
    if(open)line(c,[[x+13,y-97],[x+21,y-88],[x+36,y-100]],INK,1.6);
  }
}
