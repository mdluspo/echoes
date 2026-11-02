/** Bells capture a target once; charging geese never steer after that warning. */
export function ringBell(geese,plate,actor){
  if(!plate.bell)return false;
  plate.ring=1;
  const goose=geese.find(goose=>goose.bellId===plate.id&&goose.phase==='idle');
  if(!goose)return false;
  Object.assign(goose,{phase:'warning',timer:goose.windup,targetX:actor.x,direction:Math.sign(actor.x-goose.x)||-1});
  return true;
}

function ellipseHits(x,y,rx,ry,body){
  const dx=Math.max(body.x,Math.min(x,body.x+body.w))-x,dy=Math.max(body.y,Math.min(y,body.y+body.h))-y;
  return (dx/rx)**2+(dy/ry)**2<1;
}
function touches(goose,x,body){
  const d=goose.direction,y=goose.y;
  return ellipseHits(x,y-29,34,22,body)||ellipseHits(x+d*24,y-89,13,14,body)||ellipseHits(x+d*43,y-88,16,6,body)||
    body.x<x+d*18+8&&body.x+body.w>x+d*18-8&&body.y<y-32&&body.y+body.h>y-86;
}
function breakFence(fence,direction){
  fence.broken=true;fence.debris=Array.from({length:6},(_,i)=>({x:fence.x+i*12,y:fence.y-30-i%3*45,vx:direction*(170+i*42),vy:-250-i%3*80,angle:(i-2)*.15,spin:direction*(3+i),age:0}));
}
export function stepGeese(level,dt,surface,player=null){
  for(const plate of level.plates)if(plate.bell)plate.ring=Math.max(0,(plate.ring||0)-dt*2);
  for(const fence of level.fences||[])for(const chip of fence.debris||[]){
    chip.age+=dt;chip.vy+=1100*dt;chip.x+=chip.vx*dt;chip.y+=chip.vy*dt;chip.angle+=chip.spin*dt;
    const floor=surface(chip.x);if(floor!==null&&chip.y>floor-5){chip.y=floor-5;chip.vy*=-.25;chip.vx*=.8;chip.spin*=.6;}
  }
  let hit=false;
  for(const goose of level.geese||[]){
    goose.stride+=dt*(goose.phase==='charge'?22:goose.phase==='return'?8:2);
    if(goose.phase==='warning'){
      goose.timer-=dt;if(goose.timer<=0){goose.phase='charge';goose.chargeY=goose.y;}
    }else if(goose.phase==='charge'){
      const from=goose.x,to=from+goose.direction*goose.speed*dt,steps=Math.max(1,Math.ceil(Math.abs(to-from)/4));
      for(let i=1;i<=steps;i++){
        const x=from+(to-from)*i/steps,floor=surface(x+goose.direction*30);
        if(floor===null||floor<goose.chargeY-22||goose.direction*(x-goose.targetX)>160){goose.phase='stunned';goose.timer=1.15;break;}
        goose.x=x;
        for(const fence of level.fences||[])if(!fence.broken&&goose.x+42>fence.x&&goose.x-42<fence.x+fence.w)breakFence(fence,goose.direction);
        if(player&&touches(goose,goose.x,{x:player.x-17,y:player.y-61,w:34,h:61}))hit=true;
      }
    }else if(goose.phase==='stunned'){
      goose.timer-=dt;if(goose.timer<=0)goose.phase='return';
    }else if(goose.phase==='return'){
      goose.direction=Math.sign(goose.homeX-goose.x)||goose.direction;
      const move=Math.min(Math.abs(goose.homeX-goose.x),160*dt);goose.x+=goose.direction*move;
      if(Math.abs(goose.homeX-goose.x)<1){goose.x=goose.homeX;goose.phase='idle';goose.direction=-1;}
    }
    goose.y=surface(goose.x)??goose.y;
  }return hit;
}
