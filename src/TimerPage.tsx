import { useEffect,useState } from "react";
import { Clock3,Plus,Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { TimerControls,TimerSetup,unlockTimerSound,useTimerClock } from "./TimerControls";
import { formatTimer,standaloneTimerKey,startTimer,timerBlock,timerSeconds,validTimerProgram,validTimerRun } from "./timer";
import type { TimerProgram,TimerRun } from "./timer";
type Mode="countdown"|"stopwatch"|"intervals"|"sequence";
interface SavedTimer {version:1;mode:Mode;program:TimerProgram;run:TimerRun|null;}
const modes:Record<Mode,string>={countdown:"Countdown",stopwatch:"Stopwatch",intervals:"Intervals",sequence:"Custom sequence"};
function fresh(mode:Mode="intervals"):SavedTimer {
  const block=timerBlock(mode==="countdown"?"Countdown":mode==="stopwatch"?"Stopwatch":"Exercise 1");
  if(mode==="countdown")Object.assign(block,{sets:1,workSeconds:60,restSeconds:0});
  if(mode==="stopwatch")Object.assign(block,{sets:1,mode:"manual",restSeconds:0});
  return {version:1,mode,program:{blocks:[block],prepareSeconds:mode==="countdown"||mode==="stopwatch"?0:5,sound:true},run:null};
}
export function parseStandaloneTimer(raw:string):SavedTimer {
  if(raw.length>1000000)throw Error("Timer draft is too large.");
  const s=JSON.parse(raw);if(s?.version!==1||!Object.keys(modes).includes(s.mode)||!validTimerProgram(s.program)||(s.run!==null&&!validTimerRun(s.run)))throw Error("Invalid timer draft.");return s;
}
export function TimerPage({owner,profileId,visible,onOpen}:{owner:string|null;profileId:string;visible:boolean;onOpen:()=>void}) {
  const key=standaloneTimerKey(owner,profileId);
  const [initial]=useState(()=>{try{const raw=localStorage.getItem(key);return {value:raw?parseStandaloneTimer(raw):fresh(),error:""};}catch{return {value:fresh(),error:"Couldn’t restore this one-time timer. Reset it to start again; the stored copy and your training data are kept."};}});
  const [loadFailed,setLoadFailed]=useState(!!initial.error);
  const [value,setValue]=useState(initial.value),[error,setError]=useState(initial.error),[reset,setReset]=useState(false);
  const persist=(next:SavedTimer)=>{
    setValue(next);
    if(loadFailed)return;
    if(!validTimerProgram(next.program))return;
    try{localStorage.setItem(key,JSON.stringify(next));setError("");}catch{setError("Could not save this timer on your phone. Keep the app open until you finish. Your training history is unchanged.");}
  };
  const changeRun=(run:TimerRun)=>persist({...value,run});
  const now=useTimerClock(value.run,changeRun);
  const run=value.run,active=run&&run.phase!=="done";
  useEffect(()=>{if(visible&&value.run)window.scrollTo({top:0,behavior:"auto"});},[visible,!!value.run]);
  if(!visible)return active?<button className="floating-timer" data-update-block={run.pausedAt===null&&run.phase!=="ready"?"":undefined} onClick={onOpen}><Clock3 size={16}/><span>Timer · {run.pausedAt!==null?"Paused":run.phase==="ready"?"Ready":`${run.phase} ${formatTimer(timerSeconds(run,now))}`}</span></button>:null;
  const setProgram=(program:TimerProgram)=>persist({...value,program});
  const begin=()=>{if(loadFailed)return;unlockTimerSound(value.program.sound);persist({...value,run:startTimer(value.program)});};
  const quick=value.mode==="countdown"||value.mode==="stopwatch",block=value.program.blocks[0];
  return <div className="timer-page"><div className="page-heading"><div><div className="eyebrow">ONE SET AT A TIME</div><h1>Find your rhythm<span className="accent">.</span></h1><p>A one-time timer. Your catalogue, calendar and history stay as they are.</p></div></div>
    {error&&<p className="warning" role="alert">{error}</p>}
    {!run?<><div className="timer-mode-tabs" role="group" aria-label="Timer mode">{Object.entries(modes).map(([mode,label])=><button key={mode} className={value.mode===mode?"selected":""} aria-pressed={value.mode===mode} onClick={()=>persist(fresh(mode as Mode))}>{label}</button>)}</div><section className="panel timer-config-panel"><div className="section-header"><h2>{modes[value.mode]}</h2><Clock3 size={20}/></div>
      {quick?<form className="form-stack" onSubmit={event=>{event.preventDefault();if(validTimerProgram(value.program))begin();}}><div className="timer-fields">{value.mode==="countdown"&&<label>Duration (seconds)<input required aria-label="Countdown seconds" type="number" min="1" max="86400" step="any" value={Number.isNaN(block.workSeconds)?"":block.workSeconds} onChange={e=>setProgram({...value.program,blocks:[{...block,workSeconds:e.target.valueAsNumber}]})}/></label>}<label className="timer-checkbox"><input type="checkbox" checked={value.program.sound} onChange={e=>setProgram({...value.program,sound:e.target.checked})}/>Phase sounds</label></div><p className="muted">{value.mode==="stopwatch"?"Count up, pause and resume for as long as you need.":"Count down once, with pause, resume and an optional finish sound."}</p><button className="button" disabled={loadFailed}>Start timer</button></form>:<TimerSetup program={value.program} onChange={setProgram} onStart={begin} onMove={value.mode==="sequence"?(index,direction)=>{const blocks=[...value.program.blocks];[blocks[index],blocks[index+direction]]=[blocks[index+direction],blocks[index]];setProgram({...value.program,blocks});}:undefined} onRemove={index=>setProgram({...value.program,blocks:value.program.blocks.filter((_,i)=>i!==index)})}/>}
      {value.mode==="sequence"&&<div className="timer-sequence-actions"><button className="text-button" disabled={value.program.blocks.length>=50} onClick={()=>setProgram({...value.program,blocks:[...value.program.blocks,timerBlock(`Exercise ${value.program.blocks.length+1}`)]})}><Plus size={16}/>Add exercise</button>{value.program.blocks.length>1&&<button className="text-button" onClick={()=>setProgram({...value.program,blocks:value.program.blocks.slice(0,-1)})}><Trash2 size={15}/>Remove last exercise</button>}</div>}
    </section></>:<><TimerControls run={run} onChange={changeRun} now={now} simple={quick} stopwatch={value.mode==="stopwatch"}/><p className="timer-elapsed small muted">Total elapsed · {formatTimer(Math.max(0,Math.floor(((run.phase==="done"?run.phaseStartedAt:run.pausedAt??now)-run.startedAt-run.pausedMs)/1000)))}</p></>}
    <p className="timer-note small muted">Timer state stays on this device for this account and training profile. Keep Crux open for phase sounds; sound while locked or closed is not guaranteed. Use Pause to stop the clock before leaving.</p>
    <button className="text-button" onClick={()=>setReset(true)}>{loadFailed?"Reset timer":run?"New timer / edit setup":"Reset setup"}</button>
    {reset&&<Modal title="Reset this one-time timer?" onClose={()=>setReset(false)}><p>Replace this timer and its progress? Your saved workouts, plans and library stay unchanged.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setReset(false)}>Keep timer</button><button className="button" onClick={()=>{try{if(loadFailed){const raw=localStorage.getItem(key);if(raw)localStorage.setItem(`${key}:recovery`,raw);}const next=fresh(value.mode);localStorage.setItem(key,JSON.stringify(next));setValue(next);setError("");setLoadFailed(false);setReset(false);}catch{setError("Could not reset this timer. Try again when phone storage is available.");}}}>Reset timer</button></div></Modal>}
  </div>;
}
