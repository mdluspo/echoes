export function startRunawayPlatform(level,plateId){
  for(const platform of level.platforms||[])if(platform.requires===plateId&&!platform.triggered)Object.assign(platform,{triggered:true,running:true,elapsed:0});
}

export function slidingMoundY(platform,x){
  const left=platform.x-platform.rampLeft,right=platform.x+platform.w+platform.rampRight;
  if(x<left||x>right)return null;
  const t=x<platform.x?(x-left)/platform.rampLeft:x>platform.x+platform.w?(right-x)/platform.rampRight:1;
  return platform.groundY-(platform.groundY-platform.y)*(1-Math.cos(Math.PI*t))/2;
}

export function stepRunawayPlatforms(level,dt,riders=[]){
  for(const platform of level.platforms||[]){
    if(!platform.running)continue;
    const previous=platform.x;platform.elapsed=Math.min(platform.duration,platform.elapsed+dt);
    platform.x=platform.homeX+platform.direction*platform.speed*platform.elapsed;platform.stride+=Math.abs(platform.x-previous)/35;
    for(const rider of riders){const oldSurface=platform.profile?slidingMoundY({...platform,x:previous},rider.x):rider.x+17>previous&&rider.x-17<previous+platform.w?platform.y:null;if(rider.grounded&&oldSurface!==null&&Math.abs(rider.y-oldSurface)<1)rider.x+=platform.x-previous;}
    if(platform.elapsed>=platform.duration)platform.running=false;
  }
}
