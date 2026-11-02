const noise=(n,s=0)=>{const v=Math.sin(n*127.1+s*311.7)*43758.5453;return v-Math.floor(v);};
export const REBUILD_SECONDS=.72;

export function logHomes(pile,surface){
  const pieces=[],rows=[5,5,4,4,3,2,1],base=surface(pile.x+pile.w/2)??510;
  for(let row=0;row<rows.length;row++)for(let j=0;j<rows[row];j++){
    const index=pieces.length,x=pile.x+pile.w/2+(j-(rows[row]-1)/2)*43;
    pieces.push({x,y:base-18-row*31,len:72+noise(index,pile.x)*8,r:18,angle:(noise(index,4)-.5)*.025,index});
  }
  return pieces;
}

// Capsule contacts use the two rounded ends of each log, including angular inertia.
const ends=log=>{const h=log.len/2-log.r,dx=Math.cos(log.angle)*h,dy=Math.sin(log.angle)*h;return [{x:log.x-dx,y:log.y-dy},{x:log.x+dx,y:log.y+dy}];};
const inertia=log=>(log.len*log.len+4*log.r*log.r)/12;
function groundContact(log,surface,dt){
  let touching=false;
  for(const end of ends(log)){
    const floor=surface(end.x);if(floor===null||end.y+log.r<floor)continue;
    touching=true;const rx=end.x-log.x,ry=end.y-log.y+log.r,I=inertia(log);
    log.y-=Math.min(30,end.y+log.r-floor);
    const speed=log.vy+log.spin*rx;
    if(speed>0){
      const impulse=-(speed>120?1.38:1)*speed/(1+rx*rx/I);
      log.vy+=impulse;log.spin+=rx*impulse/I;
      const tangent=log.vx-log.spin*ry,friction=Math.max(-Math.abs(impulse)*.65,Math.min(Math.abs(impulse)*.65,-tangent/(1+ry*ry/I)));
      log.vx+=friction;log.spin-=ry*friction/I;
      if(speed>120)log.bounces++;
    }
  }
  if(touching){
    const flat=Math.round(log.angle/Math.PI)*Math.PI,error=flat-log.angle;
    // Contact friction lets the long body roll down onto its side, rather than freezing upright.
    log.spin+=Math.sin(error*2)*22*dt;
    if(Math.abs(error)<.05&&Math.abs(log.vx)<22&&Math.abs(log.vy)<30&&Math.abs(log.spin)<1.5){
      log.angle=flat;log.spin=0;log.vx*=.85;log.vy=0;
      const floor=surface(log.x);if(floor!==null)log.y=floor-log.r;
      if(Math.abs(log.vx)<2){log.vx=0;log.sleeping=true;}
    }
  }
}
export function stepDebris(log,dt,surface){
  if(log.sleeping)return;
  const steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps;
  for(let i=0;i<steps;i++){log.vy+=1700*step;log.x+=log.vx*step;log.y+=log.vy*step;log.angle+=log.spin*step;groundContact(log,surface,step);}
}
/** Ballistic debris stays separate from the pieces that rebuild locally at the pile. */
export class LogStack{
  constructor(pile,surface,random=Math.random){
    this.pile=pile;this.surface=surface;this.random=random;this.homes=logHomes(pile,surface);this.reset();
  }
  reset(){this.phase='stacked';this.age=0;this.newPieces=[];this.crushCandidate=false;this.logs=this.homes.map(home=>({...home,vx:0,vy:0,spin:0,built:true,opacity:1,scale:1,sleeping:false}));}
  beginAttack(){this.reset();this.phase='armed';}
  cancelAttack(held=true){if(this.phase==='armed'){if(held){this.phase='stacked';this.update(true,0);}else{this.launchAttack();this.update(false,0);}}}
  launchAttack(){this.phase='scattered';this.age=0;for(const log of this.logs)Object.assign(log,{built:false,spent:true,sleeping:true,opacity:0,vx:0,vy:0});}
  get solid(){return this.phase==='stacked'||this.phase==='building';}
  update(held,dt){
    this.newPieces=[];
    if(this.phase==='armed'){
      this.age+=dt;const lift=1-Math.pow(1-Math.min(1,this.age/.22),3),center=this.pile.x+this.pile.w/2;
      this.logs.forEach((log,i)=>{
        const home=this.homes[i];
        log.x=home.x+(home.x-center)*.1*lift;
        log.y=home.y-(32+i%4*5)*lift+Math.sin(this.age*7+i)*1.5*lift;
        log.angle=home.angle+Math.sin(this.age*4+i)*.07*lift;
      });return false;
    }
    let opened=false;
    if(held&&this.phase!=='scattered'){
      opened=true;this.phase='scattered';this.age=0;
      this.logs.forEach((log,i)=>{
        // Mix skyward rockets, downward throws and lower tumbling arcs.
        log.vx=(i%2?-1:1)*(450+this.random()*850);
        log.vy=i%4===0?-1450-this.random()*600:i%4===1?180+this.random()*420:-450-this.random()*700;
        log.spin=(this.random()<.5?-1:1)*(8+this.random()*17);log.bounces=0;log.spent=false;log.built=false;log.sleeping=false;log.opacity=1;log.scale=1;
      });
    }else if(!held&&this.phase==='scattered'){
      this.phase='building';this.age=0;
    }
    if((this.phase==='scattered'||this.phase==='building')&&dt>0){
      this.age+=dt;
      // Linear work per piece: ground contacts only, with resting logs put to sleep.
      const steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps;
      for(let tick=0;tick<steps;tick++)for(const log of this.logs){
        if(log.built||log.sleeping)continue;
        log.vy+=1700*step;log.x+=log.vx*step;log.y+=log.vy*step;log.angle+=log.spin*step;
        groundContact(log,this.surface,step);
      }
    }
    if(this.phase==='building'){
      const interval=(REBUILD_SECONDS-.09)/(this.logs.length-1);
      this.logs.forEach((log,i)=>{
        const elapsed=this.age-i*interval;
        if(elapsed<0)return;
        if(elapsed<.035&&!log.built){log.opacity=log.spent?0:1-elapsed/.035;return;}
        if(!log.built){Object.assign(log,this.homes[i],{built:true,spent:false,vx:0,vy:0,spin:0,opacity:1,sleeping:false});this.newPieces.push(log);}
        const pop=Math.max(0,Math.min(1,(elapsed-.035)/.055));
        log.y=this.homes[i].y-(1-pop)*8;log.scale=1+Math.sin(pop*Math.PI)*.06;
      });
      if(this.age>=REBUILD_SECONDS)this.reset();
    }
    return opened;
  }
}
