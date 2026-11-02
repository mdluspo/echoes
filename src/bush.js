export function decorateBushes(level){
  const positions=[[75,1460,2910],[75,1450,2890],[75,1450,2890],[200,1420,4230,5620],[980,3570,4750,7660]][level.index];
  level.bushes=positions.map((x,i)=>({x:level.start+x,homeX:level.start+x,section:level.index,berries:true,variant:i,phase:'idle',age:0,open:0,reveal:0}));
  if(level.index===4){
    const homeX=level.plates.filter(plate=>plate.bell).at(-1).x-1250;
    level.bushes.push({x:homeX,homeX,section:4,berries:false,variant:1,phase:'dormant',age:0,open:0,reveal:0,speed:190,minX:level.start+2050,maxX:level.end-80,activated:false,chaseDelay:0,grounded:true,vy:0,jumpCooldown:0});
  }
  return level;
}

export function bushWatched(bush,actors){
  return actors.some(actor=>Math.abs(actor.x-bush.x)<=720&&Math.abs(actor.y-bush.y)<170&&(actor.facing||1)*(bush.x-actor.x)>=0);
}
const nearMouth=(bush,player)=>player&&Math.abs(player.x-bush.x)<78&&player.y>bush.y-105&&player.y-61<bush.y+8;

function moveBush(bush,direction,player,dt,surface){
  bush.jumpCooldown=Math.max(0,(bush.jumpCooldown||0)-dt);bush.vy??=0;bush.grounded??=true;
  const floor=surface(bush.x);
  if(bush.grounded){if(floor===null||floor-bush.y>15)bush.grounded=false;else if(Math.abs(floor-bush.y)<15)bush.y=floor;}
  if(direction&&bush.grounded&&bush.jumpCooldown===0){
    const ahead=surface(bush.x+direction*60),rise=ahead===null?0:bush.y-ahead;
    const landing=ahead===null&&[100,140,180,220,260,300].some(distance=>{const y=surface(bush.x+direction*distance);return y!==null&&bush.y-y<145;});
    if(landing||rise>20&&rise<145||player&&player.y<bush.y-50&&Math.abs(player.x-bush.x)<300&&rise<145){bush.vy=-720;bush.grounded=false;bush.jumpCooldown=.9;bush.jumps=(bush.jumps||0)+1;}
  }
  const previousY=bush.y;
  if(!bush.grounded)bush.vy=Math.min(1000,bush.vy+1600*dt);
  let y=bush.grounded?bush.y:bush.y+bush.vy*dt,x=Math.max(bush.minX,Math.min(bush.maxX,bush.x+direction*bush.speed*dt)),next=surface(x);
  if(next!==null&&y>next+1&&previousY>next+1){x=bush.x;next=surface(x);}
  if(bush.grounded){if(next!==null&&Math.abs(next-bush.y)<15)y=next;else{bush.grounded=false;bush.vy=0;}}
  if(!bush.grounded&&bush.vy>=0&&next!==null&&previousY<=next+1&&y>=next){y=next;bush.vy=0;bush.grounded=true;}
  bush.stride=(bush.stride||0)+Math.abs(x-bush.x);bush.x=x;bush.y=y;
  if(direction)bush.facing=direction;
  if(bush.y>950)Object.assign(bush,{x:bush.homeX,y:surface(bush.homeX)??510,vy:0,grounded:true,activated:false,chaseDelay:0,phase:'dormant'});
}

/** Passing the plant wakes it; watchers stop pursuit while gravity still applies. */
export function stepBushes(bushes,actors,player,dt,surface){
  let eaten=null;
  for(const bush of bushes){
    if(bush.berries){bush.y=surface(bush.x)??bush.y??510;continue;}
    bush.y??=surface(bush.x)??510;
    bush.age+=dt;
    if(bush.phase==='chewing'){
      bush.open=Math.max(0,1-bush.age/1.1)*(.25+.75*Math.abs(Math.cos(bush.age*12)));
      bush.reveal=Math.max(0,1-Math.max(0,bush.age-.65)/.65);
      if(bush.age>1.3)Object.assign(bush,{phase:'dormant',age:0,open:0,reveal:0});
      moveBush(bush,0,null,dt,surface);
      continue;
    }
    if(bush.phase==='opening'){
      moveBush(bush,0,null,dt,surface);
      bush.open=Math.min(1,bush.age/.22);bush.reveal=bush.open;
      if(!nearMouth(bush,player)){bush.phase='closing';bush.age=0;}
      else if(bush.age>=.22){Object.assign(bush,{phase:'chewing',age:0,open:1,reveal:1});eaten=bush;}
      continue;
    }
    if(bush.phase==='closing'){
      moveBush(bush,0,null,dt,surface);
      bush.open=Math.max(0,bush.open-dt*5);bush.reveal=bush.open;
      if(bush.open===0)bush.phase='dormant';continue;
    }
    if(!bush.activated){if(player&&player.x>bush.x+60){bush.activated=true;bush.chaseDelay=3;}else{moveBush(bush,0,null,dt,surface);continue;}}
    if(!player){moveBush(bush,0,null,dt,surface);continue;}
    if(nearMouth(bush,player)){Object.assign(bush,{phase:'opening',age:0,facing:Math.sign(player.x-bush.x)||bush.facing||1});continue;}
    if(bushWatched(bush,actors)){bush.phase='frozen';moveBush(bush,0,null,dt,surface);continue;}
    if((bush.chaseDelay||0)>0){bush.chaseDelay=Math.max(0,bush.chaseDelay-dt);bush.phase='frozen';moveBush(bush,0,null,dt,surface);continue;}
    bush.phase='stalking';
    moveBush(bush,Math.sign(player.x-bush.x),player,dt,surface);
    if(nearMouth(bush,player))Object.assign(bush,{phase:'opening',age:0});
  }return eaten;
}
