import { Adventure, CHAPTERS, STEP, SECTION_LENGTH } from './engine.js';
import { Illustrator, loadArtwork } from './art.js';
import { TRAIL_HINTS } from './hints.js';

const $=id=>document.getElementById(id),SAVE_KEY='echoes.hamster-adventure.v2';
const fresh=()=>({completed:[],lastRoom:0,memory:{},sound:false,motion:true,settingsVersion:2,sectionLength:SECTION_LENGTH});
function loadSave(){
  try{
    const raw=JSON.parse(localStorage.getItem(SAVE_KEY));if(!raw||typeof raw!=='object')return fresh();
    const completed=Array.isArray(raw.completed)?[...new Set(raw.completed.filter(n=>Number.isInteger(n)&&n>=0&&n<CHAPTERS.length))]:[];
    let unlocked=0;while(unlocked<CHAPTERS.length-1&&completed.includes(unlocked))unlocked++;
    return{completed,lastRoom:Number.isInteger(raw.lastRoom)&&raw.lastRoom>=0&&raw.lastRoom<=unlocked?raw.lastRoom:0,memory:{lastRoute:raw.memory?.lastRoute==='high'?'high':'low',jumps:Math.max(0,Number(raw.memory?.jumps)||0),falls:Math.max(0,Number(raw.memory?.falls)||0),completed:Math.max(0,Number(raw.memory?.completed)||0),echoes:Math.max(0,Number(raw.memory?.echoes)||0),logDeaths:Math.max(0,Number(raw.memory?.logDeaths)||0),retreats:Math.max(0,Number(raw.memory?.retreats)||0),hasWitnessedDeath:raw.memory?.hasWitnessedDeath===true,firstDeathDismissed:raw.memory?.firstDeathDismissed===true,firstDeath:Number.isFinite(raw.memory?.firstDeath?.x)&&Number.isFinite(raw.memory?.firstDeath?.y)&&Number.isInteger(raw.memory?.firstDeath?.section)&&raw.memory.firstDeath.section>=0&&raw.memory.firstDeath.section<CHAPTERS.length?{x:raw.memory.firstDeath.x+raw.memory.firstDeath.section*(SECTION_LENGTH-(raw.sectionLength||2400)),y:raw.memory.firstDeath.y,section:raw.memory.firstDeath.section,text:'Baviloya is Watching You'}:null},sound:raw.sound===true,motion:raw.settingsVersion===2?raw.motion!==false:true,settingsVersion:2,sectionLength:SECTION_LENGTH};
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
    const notes={jump:[330,440],land:[150],seed:[660,880],echo:[660,494,392],plate:[392,523],warning:[220,180],death:[120,80],logs:[140,95,190],honk:[196,147,196],win:[392,494,587,784]}[kind];
    if(!notes)return;
    notes.forEach((frequency,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain(),start=audioContext.currentTime+i*.07;osc.type='triangle';osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.025,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+.13);osc.connect(gain);gain.connect(audioContext.destination);osc.start(start);osc.stop(start+.15);});
  }catch{/* Sound is optional. */}
}
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function openDialog(id){clearInput();$(id).showModal();}
function restart(){
  clearTimeout(winTimer);closeDialogs();clearInput();game.restartTake();painter.rewind();temporaryCue='';startedAt=performance.now();renderUI();focusGame();
}
function restartAll(){
  clearTimeout(winTimer);game=new Adventure();save.completed=[];save.lastRoom=0;save.memory={};persist();closeDialogs();clearInput();painter.rewind();temporaryCue='';cueUntil=0;startedAt=performance.now();pickerSignature='';renderUI();focusGame();
}
function resetEcho(){if(game.dead||game.won)return;game.resetEcho();renderUI();focusGame();}
function loadRoom(index){
  let unlocked=0;while(unlocked<CHAPTERS.length-1&&save.completed.includes(unlocked))unlocked++;
  if(!Number.isInteger(index)||index<0||index>unlocked)return;
  clearTimeout(winTimer);closeDialogs();clearInput();game=new Adventure(index,save.memory);save.lastRoom=index;persist();painter.rewind();startedAt=performance.now();temporaryCue='';renderUI();focusGame();
  if(index===2)say('The grove remembers. Find a new way around.',5000);
}
function leaveEcho(){
  if(isPaused()||game.dead)return;
  const plate=game.level.plates.find(p=>game.onPlate(game.player,p));
  const result=game.commit();
  if(!result.ok){say({air:'Land on a ledge first.',empty:'Leave a few little footsteps first.',long:'Press R to start a fresh recording.',limit:'Both Echo slots are full. Q clears them.',won:'A little memory found.'}[result.reason]);return;}
  sound('echo');
  const threatened=plate&&game.attacks.some(attack=>attack.pile.requires.includes(plate.id));
  say(plate?(threatened?'Your Echo will replay this press. Find cover.':'Your Echo will replay those steps. Keep moving.'):'Your footsteps, replayed.',4000);renderUI();focusGame();
}
function finishRoom(){
  save.completed=[...new Set([...save.completed,...game.completed])];save.memory={...game.memory};save.lastRoom=game.activeIndex;persist();
  startedAt=performance.now();temporaryCue='';
  if(game.won){
    clearInput();$('win-title').textContent='Caught you.';$('win-copy').textContent='Six connected trails, two little memories, and one very tall tree.';
    $('next-button').innerHTML='Wander from the beginning <span>→</span>';
    winTimer=setTimeout(()=>{if(game.won&&!isPaused())openDialog('win-dialog');},1000);
  }
  renderUI();
}
function renderUI(){
  const level=game.level,onPlate=level.plates.some(p=>game.onPlate(game.player,p));
  $('room-name').textContent=level.region;
  const activeEchoes=game.echoes.filter(e=>game.echoActive(e)).length;
  const occupied=new Set(game.echoes.filter(e=>game.echoActive(e)).map((echo,i)=>echo.slot??i));
  [...$('echo-slots').children].forEach((slot,i)=>slot.classList.toggle('available',!occupied.has(i)));
  const slotLabel=`${level.limit-activeEchoes} of ${level.limit} Echo slots available`;
  $('echo-slots').setAttribute('aria-label',slotLabel);$('echo-slots').title=slotLabel;
  $('vanish-echo-button').disabled=game.won||game.dead||!activeEchoes;
  $('echo-button').disabled=game.won||game.dead||game.echoRecording.length<12||activeEchoes>=level.limit||!game.player.grounded;
  $('echo-button').classList.toggle('ready',activeEchoes<level.limit&&!game.dead&&!game.won);
  const seconds=(performance.now()-startedAt)/1000;
  const cue=performance.now()<cueUntil?temporaryCue:onPlate&&activeEchoes<level.limit?(touchLayout()?'Tap Echo here.':'E: leave an Echo here.'):game.won?'A path, discovered.':seconds<8?(game.section.inProgress?'Jump up the tree.':level.index===0?(touchLayout()?'Hold ← → to scurry · ↑ to jump':'← → to scurry · Space to jump'):'Find the striped plate. Leave an Echo.') : '';
  $('cue').textContent=cue;$('cue').classList.toggle('quiet',!cue);
  $('sound-button').setAttribute('aria-pressed',String(save.sound));$('sound-button').querySelector('span').textContent=save.sound?'on':'off';
  let unlocked=0;while(unlocked<CHAPTERS.length-1&&save.completed.includes(unlocked))unlocked++;
  const signature=`${level.index}:${unlocked}`;
  if(pickerSignature!==signature){
    $('room-picker').innerHTML=CHAPTERS.map((room,i)=>`<button data-room="${i}" title="${room.region}" aria-label="Trail ${i+1}: ${room.region}" ${i===level.index?'aria-current="step"':''} ${i>unlocked?'disabled':''}>${i+1}</button>`).join('');
    pickerSignature=signature;
  }
  $('game').setAttribute('aria-label',`${level.region}. Hamster at ${Math.round(game.player.x)}, ${Math.round(game.player.y)}. ${game.player.grounded?'On the ground':'Jumping'}. ${activeEchoes} active Echoes. ${game.dead?'Hit. Returning to the checkpoint. ':''}Left and Right to run, Space to jump, E replays your recent footsteps, Q resets the Echo.`);
}

$('menu-button').addEventListener('click',()=>openDialog('menu-dialog'));
$('help-button').addEventListener('click',()=>{
  $('level-hints').replaceChildren(...TRAIL_HINTS[game.activeIndex].map((hint,index)=>{
    const item=document.createElement('details'),label=document.createElement('summary'),copy=document.createElement('p');
    item.className='level-hint';label.textContent=`Hint ${index+1}`;copy.className='hint-text';copy.textContent=hint;
    item.append(label,copy);return item;
  }));
  openDialog('help-dialog');
});
$('echo-button').addEventListener('click',leaveEcho);
$('vanish-echo-button').addEventListener('click',resetEcho);
$('restart-all-button').addEventListener('click',restartAll);
$('sound-button').addEventListener('click',()=>{save.sound=!save.sound;persist();renderUI();if(save.sound)sound('seed');});
$('room-picker').addEventListener('click',event=>{const button=event.target.closest('[data-room]');if(button&&!button.disabled)loadRoom(Number(button.dataset.room));});
$('next-button').addEventListener('click',restartAll);
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
  if(k==='q'){event.preventDefault();resetEcho();}
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
          if(kind==='respawn'){focusGame();renderUI();}
          if(kind==='honk')say('Honk.',1000);
          if(kind==='warning')say('Something moved.',1100);
          if(kind==='collapse')painter.burst(game.player,'land');
          if(kind==='flag-run')say('Come back here.',1800);
          if(kind==='flag-caught'){say('Got you.',1500);painter.burst(game.section.exit,'land');}
          if(kind==='plate'&&!game.echoes.some(e=>game.echoActive(e)))say(touchLayout()?'Tap Echo on this plate.':'E: leave an Echo on this plate.',4000);
          if(kind==='logs'&&game.echoes.some(e=>game.echoActive(e)))say('Logs away! Keep going!',2000);
          if(kind==='section'||kind==='win')finishRoom();
        }
      }
    }
    painter.draw(game,visualTime,dt,{motion:true,paused});
    if(save.memory.firstDeathDismissed!==game.memory.firstDeathDismissed){save.memory={...game.memory};persist();}
    if(time-lastUI>200){renderUI();lastUI=time;}
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
if(['localhost','127.0.0.1','0.0.0.0'].includes(location.hostname)){
  const events=new EventSource('/__events');events.onmessage=event=>{if(event.data==='reload')location.reload();};
}


