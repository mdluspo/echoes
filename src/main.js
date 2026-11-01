import { Adventure, CHAPTERS, STEP, ECHO_SECONDS } from './engine.js';
import { Illustrator, loadArtwork } from './art.js';

const $=id=>document.getElementById(id),SAVE_KEY='echoes.hamster-adventure.v2';
const fresh=()=>({completed:[],lastRoom:0,memory:{},sound:false,motion:true,trails:false});
function loadSave(){
  try{
    const raw=JSON.parse(localStorage.getItem(SAVE_KEY));if(!raw||typeof raw!=='object')return fresh();
    const completed=Array.isArray(raw.completed)?[...new Set(raw.completed.filter(n=>Number.isInteger(n)&&n>=0&&n<CHAPTERS.length))]:[];
    let unlocked=0;while(unlocked<CHAPTERS.length-1&&completed.includes(unlocked))unlocked++;
    return{completed,lastRoom:Number.isInteger(raw.lastRoom)&&raw.lastRoom>=0&&raw.lastRoom<=unlocked?raw.lastRoom:0,memory:{lastRoute:raw.memory?.lastRoute==='high'?'high':'low',jumps:Math.max(0,Number(raw.memory?.jumps)||0),falls:Math.max(0,Number(raw.memory?.falls)||0),completed:Math.max(0,Number(raw.memory?.completed)||0),echoes:Math.max(0,Number(raw.memory?.echoes)||0),logDeaths:Math.max(0,Number(raw.memory?.logDeaths)||0),hasWitnessedDeath:raw.memory?.hasWitnessedDeath===true,firstDeath:Number.isFinite(raw.memory?.firstDeath?.x)&&Number.isFinite(raw.memory?.firstDeath?.y)&&Number.isInteger(raw.memory?.firstDeath?.section)&&raw.memory.firstDeath.section>=0&&raw.memory.firstDeath.section<CHAPTERS.length?{x:raw.memory.firstDeath.x,y:raw.memory.firstDeath.y,section:raw.memory.firstDeath.section,text:'Baviloya is Watching You'}:null},sound:raw.sound===true,motion:raw.motion!==false,trails:raw.trails===true};
  }catch{return fresh();}
}
let save=loadSave(),game=new Adventure(save.lastRoom,save.memory);
$('cue').textContent='Opening the meadow...';
const artwork=await loadArtwork();
const painter=new Illustrator($('game'),artwork),keys=new Set(),touch=new Set();
let jumpPressed=false,accumulator=0,previousTime=0,visualTime=0,winTimer,startedAt=0,cueUntil=0,temporaryCue='',lastUI=0,audioContext,pickerSignature='';
const isPaused=()=>Boolean(document.querySelector('dialog[open]'));
const touchLayout=()=>matchMedia('(pointer:coarse), (max-width:600px)').matches;
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{/* The adventure also works without storage. */}}
function clearInput(){keys.clear();touch.clear();jumpPressed=false;accumulator=0;document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));}
function focusGame(){$('game').focus({preventScroll:true});}
function say(text,duration=3500){temporaryCue=text;cueUntil=performance.now()+duration;renderUI();}
function sound(kind){
  if(!save.sound)return;
  try{
    audioContext||=new(window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
    const notes={jump:[330,440],land:[150],seed:[660,880],echo:[660,494,392],plate:[392,523],warning:[220,180],death:[120,80],logs:[140,95,190],win:[392,494,587,784]}[kind];
    if(!notes)return;
    notes.forEach((frequency,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain(),start=audioContext.currentTime+i*.07;osc.type='triangle';osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.025,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+.13);osc.connect(gain);gain.connect(audioContext.destination);osc.start(start);osc.stop(start+.15);});
  }catch{/* Sound is optional. */}
}
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function openDialog(id){clearInput();$(id).showModal();}
function restart(full=false){
  clearTimeout(winTimer);closeDialogs();clearInput();if(full)game.reset();else game.restartTake();painter.rewind();temporaryCue='';startedAt=performance.now();renderUI();focusGame();
}
function loadRoom(index){
  let unlocked=0;while(unlocked<CHAPTERS.length-1&&save.completed.includes(unlocked))unlocked++;
  if(!Number.isInteger(index)||index<0||index>unlocked)return;
  clearTimeout(winTimer);closeDialogs();clearInput();game=new Adventure(index,save.memory);save.lastRoom=index;persist();painter.rewind();startedAt=performance.now();temporaryCue='';$('hint-text').hidden=true;renderUI();focusGame();
  if(index===2)say('The grove remembers. Find a new way around.',5000);
}
function leaveEcho(){
  if(isPaused()||game.dead)return;
  const plate=game.level.plates.find(p=>game.onPlate(game.player,p));
  const result=game.commit();
  if(!result.ok){say({air:'Land on a ledge first.',empty:'Leave a few little footsteps first.',long:'Press R to start a fresh recording.',limit:'Remove an Echo in the pause menu to try again.',won:'A little memory found.'}[result.reason]);return;}
  sound('echo');
  say(plate?(game.activeIndex===0?'Your Echo will replay those steps. Keep moving.':'Your Echo will replay this press. Find cover.'):'Eight seconds of footsteps. A brief chance to act.',4000);renderUI();focusGame();
}
function finishRoom(){
  save.completed=[...new Set([...save.completed,...game.completed])];save.memory={...game.memory};save.lastRoom=game.activeIndex;persist();
  startedAt=performance.now();temporaryCue='';
  if(game.won){
    clearInput();$('win-title').textContent='A little further, together.';$('win-copy').textContent='Three connected trails, and a path that remembered your footsteps.';
    $('next-button').innerHTML='Wander from the beginning <span>?</span>';
    winTimer=setTimeout(()=>{if(game.won&&!isPaused())openDialog('win-dialog');},1000);
  }
  renderUI();
}
function renderUI(){
  const level=game.level,onPlate=level.plates.some(p=>game.onPlate(game.player,p));
  $('room-name').textContent=level.region;
  const activeEchoes=game.echoes.filter(e=>game.echoActive(e)).length;
  $('echo-button').disabled=game.won||game.dead||game.recording.length<12||activeEchoes>=level.limit||!game.player.grounded;
  $('echo-button').classList.toggle('ready',onPlate&&!$('echo-button').disabled);
  const seconds=(performance.now()-startedAt)/1000;
  const cue=performance.now()<cueUntil?temporaryCue:onPlate&&activeEchoes<level.limit?(touchLayout()?'Tap Echo last 8s here.':'E: copy the last 8 seconds here.'):game.won?'A path, discovered.':seconds<8?(level.index===0?(touchLayout()?'Hold ← → to scurry · ↑ to jump':'← → to scurry · Space to jump'):'Find the striped plate. Leave an Echo.') : '';
  $('cue').textContent=cue;$('cue').classList.toggle('quiet',!cue);
  const recorded=Math.min(ECHO_SECONDS,(game.recording.length-1)*STEP);
  $('memory-label').textContent=`${recorded.toFixed(1)} / ${ECHO_SECONDS}s`;
  $('memory-fill').style.width=`${recorded/ECHO_SECONDS*100}%`;
  $('remove-echo-button').hidden=!game.echoes.length;
  for(const id of ['retry-button','reset-button','remove-echo-button'])$(id).disabled=game.won;
  for(const [id,value]of [['sound',save.sound],['motion',save.motion],['trail',save.trails]]){const button=$(id+'-button');button.setAttribute('aria-pressed',String(value));button.querySelector('span').textContent=value?'on':'off';}
  let unlocked=0;while(unlocked<CHAPTERS.length-1&&save.completed.includes(unlocked))unlocked++;
  const signature=`${level.index}:${unlocked}`;
  if(pickerSignature!==signature){
    $('room-picker').innerHTML=CHAPTERS.map((room,i)=>`<button data-room="${i}" title="${room.region}" aria-label="Trail ${i+1}: ${room.region}" ${i===level.index?'aria-current="step"':''} ${i>unlocked?'disabled':''}>${i+1}</button>`).join('');
    pickerSignature=signature;
  }
  $('game').setAttribute('aria-label',`${level.region}. Hamster at ${Math.round(game.player.x)}, ${Math.round(game.player.y)}. ${game.player.grounded?'On the ground':'Jumping'}. ${activeEchoes} active Echoes. ${game.dead?'Hit. Returning to the checkpoint. ':''}Left and Right to run, Space to jump, E copies the last 8 seconds.`);
}

$('menu-button').addEventListener('click',()=>openDialog('menu-dialog'));
$('help-button').addEventListener('click',()=>openDialog('help-dialog'));
$('echo-button').addEventListener('click',leaveEcho);
$('retry-button').addEventListener('click',()=>restart());
$('reset-button').addEventListener('click',()=>restart(true));
$('remove-echo-button').addEventListener('click',()=>{closeDialogs();game.removeEcho();painter.rewind();renderUI();focusGame();});
$('sound-button').addEventListener('click',()=>{save.sound=!save.sound;persist();renderUI();if(save.sound)sound('seed');});
$('motion-button').addEventListener('click',()=>{save.motion=!save.motion;persist();renderUI();});
$('trail-button').addEventListener('click',()=>{save.trails=!save.trails;persist();renderUI();});
$('room-picker').addEventListener('click',event=>{const button=event.target.closest('[data-room]');if(button&&!button.disabled)loadRoom(Number(button.dataset.room));});
$('hint-button').addEventListener('click',()=>{$('hint-text').hidden=false;$('hint-text').textContent=game.level.index===0?'The first meadow has no log attacks. Step on the striped plate, press E, then jump across the creek while your Echo replays the press.':game.level.index===2?'The grove remembers your route and sends two volleys. Echo the plate, hide on the sheltered side of the raised bank, then move after the logs hit the bank.':'Echo leaves you where you stand. Repeat presses wake the logs. Step toward the raised bank, keep its crest between you and the pile, then cross after the volley hits cover.';});
$('next-button').addEventListener('click',()=>loadRoom(0));
$('replay-button').addEventListener('click',()=>loadRoom(game.level.index));
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{clearInput();focusGame();if(game.won&&dialog.id!=='win-dialog'&&!isPaused())$('win-dialog').showModal();});

const jumpKeys=new Set([' ','arrowup','w']);
document.addEventListener('keydown',event=>{
  if(event.metaKey||event.ctrlKey||event.altKey||event.target.matches('input,textarea,select,[contenteditable]'))return;
  const k=event.key.toLowerCase();
  if(isPaused())return;
  if((k===' '||k==='enter')&&event.target.closest('button'))return;
  if(['arrowleft','arrowright','a','d','shift',...jumpKeys].includes(k)){
    event.preventDefault();if(jumpKeys.has(k)&&!keys.has(k)&&!event.repeat)jumpPressed=true;keys.add(k);return;
  }
  if(event.repeat)return;
  if(k==='e'||k==='enter'){event.preventDefault();leaveEcho();}
  if(k==='r'){event.preventDefault();restart();}
  if(k==='escape'){event.preventDefault();openDialog('menu-dialog');}
});
document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
for(const button of document.querySelectorAll('[data-hold],#jump-button')){
  const action=button.dataset.hold||'jump';
  button.addEventListener('pointerdown',event=>{event.preventDefault();if(isPaused())return;button.setPointerCapture(event.pointerId);touch.add(action);button.classList.add('held');if(action==='jump')jumpPressed=true;});
  const release=event=>{touch.delete(action);button.classList.remove('held');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  button.addEventListener('contextmenu',event=>event.preventDefault());
}
$('game').addEventListener('pointerdown',()=>{if(game.won&&!isPaused())openDialog('win-dialog');else focusGame();});
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',clearInput);
window.addEventListener('resize',()=>{painter.resize();accumulator=0;});

startedAt=performance.now();renderUI();
function animate(time){
  const dt=Math.min(.05,previousTime?(time-previousTime)/1000:STEP);previousTime=time;
  if(!document.hidden){
    const paused=isPaused();
    if(!paused){
      visualTime+=dt*1000;accumulator+=dt;
      while(accumulator>=STEP){
        const input={left:keys.has('a')||keys.has('arrowleft')||touch.has('left'),right:keys.has('d')||keys.has('arrowright')||touch.has('right'),walk:keys.has('shift'),jumpHeld:[...jumpKeys].some(k=>keys.has(k))||touch.has('jump'),jumpPressed};
        jumpPressed=false;
        const events=game.update(input);accumulator-=STEP;
        for(const kind of events){
          sound(kind);
          if(kind==='land'||kind==='seed')painter.burst(game.player,kind);
          if(kind==='death'){painter.burst(game.player,'death');clearInput();temporaryCue='';cueUntil=0;save.memory={...game.memory};persist();renderUI();}
          if(kind==='respawn'){painter.rewind();focusGame();renderUI();}
          if(kind==='warning')say('It remembers that press.',1700);
          if(kind==='plate'&&!game.echoes.some(e=>game.echoActive(e)))say(touchLayout()?'Tap Echo last 8s on this plate.':'E: copy the last 8 seconds on this plate.',4000);
          if(kind==='logs'&&game.echoes.some(e=>game.echoActive(e)))say('Logs away! Keep going!',2000);
          if(kind==='section'||kind==='win')finishRoom();
        }
      }
    }
    painter.draw(game,visualTime,dt,{motion:save.motion,trails:save.trails,paused});
    if(time-lastUI>200){renderUI();lastUI=time;}
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
if(['localhost','127.0.0.1','0.0.0.0'].includes(location.hostname)){
  const events=new EventSource('/__events');events.onmessage=event=>{if(event.data==='reload')location.reload();};
}


