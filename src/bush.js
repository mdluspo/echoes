export function decorateBushes(level){
  const positions=[[75,1460,2910],[75,1450,2890],[75,1450,2890],[200,1420,4230,5620],[980,2900,4470,6320]][level.index];
  level.bushes=positions.map((x,i)=>({x:level.start+x,homeX:level.start+x,section:level.index,berries:true,variant:i,phase:'idle',age:0,open:0,reveal:0}));
  if(level.index===4)level.bushes.push({x:level.start+3300,homeX:level.start+3300,section:4,berries:false,variant:1,phase:'dormant',age:0,open:0,reveal:0,speed:315,minX:level.start+2800,maxX:level.start+4000});
  return level;
}

export function bushWatched(bush,actors){
  return actors.some(actor=>Math.abs(actor.x-bush.x)<=720&&Math.abs(actor.y-bush.y)<170&&(actor.facing||1)*(bush.x-actor.x)>=0);
}
const nearMouth=(bush,player)=>player&&Math.abs(player.x-bush.x)<78&&player.y>bush.y-105&&player.y-61<bush.y+8;

/** A watched bush freezes, but walking into its mouth is still dangerous. */
export function stepBushes(bushes,actors,player,dt,surface,blocked=()=>false){
  let eaten=null;
  for(const bush of bushes){
    bush.y=surface(bush.x)??bush.y??510;
    if(bush.berries)continue;
    bush.age+=dt;
    if(bush.phase==='chewing'){
      bush.open=Math.max(0,1-bush.age/1.1)*(.25+.75*Math.abs(Math.cos(bush.age*12)));
      bush.reveal=Math.max(0,1-Math.max(0,bush.age-.65)/.65);
      if(bush.age>1.3)Object.assign(bush,{phase:'dormant',age:0,open:0,reveal:0});
      continue;
    }
    if(bush.phase==='opening'){
      bush.open=Math.min(1,bush.age/.22);bush.reveal=bush.open;
      if(!nearMouth(bush,player)){bush.phase='closing';bush.age=0;}
      else if(bush.age>=.22){Object.assign(bush,{phase:'chewing',age:0,open:1,reveal:1});eaten=bush;}
      continue;
    }
    if(bush.phase==='closing'){
      bush.open=Math.max(0,bush.open-dt*5);bush.reveal=bush.open;
      if(bush.open===0)bush.phase='dormant';continue;
    }
    if(!player||Math.abs(player.x-bush.x)>650)continue;
    if(nearMouth(bush,player)){Object.assign(bush,{phase:'opening',age:0,facing:Math.sign(player.x-bush.x)||bush.facing||1});continue;}
    if(bushWatched(bush,actors)){bush.phase='frozen';continue;}
    bush.phase='stalking';
    const direction=Math.sign(player.x-bush.x),distance=Math.min(Math.abs(player.x-bush.x),bush.speed*dt),steps=Math.max(1,Math.ceil(distance/3));
    for(let i=0;i<steps;i++){
      const next=Math.max(bush.minX,Math.min(bush.maxX,bush.x+direction*distance/steps)),floor=surface(next),front=surface(next+direction*40);
      if(floor===null||front===null||Math.abs(floor-bush.y)>12||Math.abs(front-floor)>40||blocked(next,bush,direction))break;
      bush.stride=(bush.stride||0)+Math.abs(next-bush.x);bush.facing=direction;bush.x=next;bush.y=floor;
      if(nearMouth(bush,player)){Object.assign(bush,{phase:'opening',age:0});break;}
    }
  }return eaten;
}
