import { uid } from "./model";
export type WorkMode="manual"|"duration"|"reps";
export interface TimerBlock { id:string;name:string;sets:number;reps:number;mode:WorkMode;workSeconds:number;secondsPerRep:number;restSeconds:number;autoNext:boolean; }
export interface TimerProgram { blocks:TimerBlock[];prepareSeconds:number;sound:boolean; }
export type TimerPhase="prepare"|"work"|"rest"|"ready"|"done";
export interface TimerRun { version:1;program:TimerProgram;block:number;set:number;phase:TimerPhase;phaseStartedAt:number;endsAt:number|null;startedAt:number;pausedAt:number|null;pausedMs:number;finished:string[]; }
export const setKey=(block:TimerBlock,index:number)=>`${block.id}:${index}`;
export const workSeconds=(block:TimerBlock)=>block.mode==="manual"?null:block.mode==="reps"?block.reps*block.secondsPerRep:block.workSeconds;
export const timerBlock=(name="Exercise"):TimerBlock=>({id:uid(),name,sets:3,reps:6,mode:"duration",workSeconds:30,secondsPerRep:4,restSeconds:60,autoNext:false});
const number=(n:unknown,min:number,max:number,integer=false)=>typeof n==="number"&&Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n));
export function validTimerProgram(value:unknown):value is TimerProgram {
  const p=value as TimerProgram;
  return !!p&&number(p.prepareSeconds,0,60,true)&&typeof p.sound==="boolean"&&Array.isArray(p.blocks)&&p.blocks.length>0&&p.blocks.length<=200&&new Set(p.blocks.map(b=>b?.id)).size===p.blocks.length&&p.blocks.every(b=>b&&typeof b.id==="string"&&b.id.length>0&&b.id.length<=200&&typeof b.name==="string"&&b.name.trim().length>0&&b.name.length<=120&&number(b.sets,1,50,true)&&number(b.reps,1,1000,true)&&["manual","duration","reps"].includes(b.mode)&&number(b.workSeconds,1,86400)&&number(b.secondsPerRep,.1,120)&&b.reps*b.secondsPerRep<=86400&&number(b.restSeconds,0,86400)&&typeof b.autoNext==="boolean");
}
export function validTimerRun(value:unknown):value is TimerRun {
  const r=value as TimerRun;
  if(!r||r.version!==1||!validTimerProgram(r.program)||!number(r.block,0,r.program.blocks.length-1,true)||!number(r.set,0,r.program.blocks[r.block].sets-1,true)||!["prepare","work","rest","ready","done"].includes(r.phase)||![r.startedAt,r.phaseStartedAt,r.pausedMs].every(n=>number(n,0,1e15))||(r.pausedAt!==null&&!number(r.pausedAt,r.phaseStartedAt,1e15))||(r.endsAt!==null&&!number(r.endsAt,r.phaseStartedAt,1e15))||!Array.isArray(r.finished)||r.finished.length>10000||new Set(r.finished).size!==r.finished.length)return false;
  const keys=new Set(r.program.blocks.flatMap(b=>Array.from({length:b.sets},(_,i)=>setKey(b,i))));
  if(!r.finished.every(k=>typeof k==="string"&&keys.has(k)))return false;
  const timed=r.phase==="prepare"||r.phase==="rest"||(r.phase==="work"&&workSeconds(r.program.blocks[r.block])!==null);
  return timed?(r.endsAt!==null):r.endsAt===null;
}
function enter(r:TimerRun,phase:TimerPhase,at:number):TimerRun {
  const seconds=phase==="prepare"?r.program.prepareSeconds:phase==="rest"?r.program.blocks[r.block].restSeconds:phase==="work"?workSeconds(r.program.blocks[r.block]):null;
  return {...r,phase,phaseStartedAt:at,endsAt:seconds===null?null:at+seconds*1000,pausedAt:null};
}
function nextPosition(r:TimerRun):{block:number;set:number}|null {
  for(let b=r.block;b<r.program.blocks.length;b++)for(let s=b===r.block?r.set+1:0;s<r.program.blocks[b].sets;s++)if(!r.finished.includes(setKey(r.program.blocks[b],s)))return {block:b,set:s};
  return null;
}
function finishWork(r:TimerRun,at:number,record=true):TimerRun {
  const key=setKey(r.program.blocks[r.block],r.set);
  const finished=record&&!r.finished.includes(key)?[...r.finished,key]:r.finished;
  const next=nextPosition({...r,finished});
  if(!next)return enter({...r,finished},"done",at);
  const same=next.block===r.block;
  const advanced={...r,...next,finished};
  if(!record||!same)return enter(advanced,"ready",at);
  // Rest belongs to the exercise just performed. Between exercises always wait.
  return enter(advanced,"rest",at);
}
export function startTimer(program:TimerProgram,now=Date.now(),finished:string[]=[]):TimerRun {
  if(!validTimerProgram(program))throw Error("Check the exercise names, sets, reps and timer durations.");
  const p=structuredClone(program),keys=new Set(p.blocks.flatMap(b=>Array.from({length:b.sets},(_,i)=>setKey(b,i))));
  const done=[...new Set(finished.filter(key=>keys.has(key)))];
  let r:TimerRun={version:1,program:p,block:0,set:0,phase:"ready",phaseStartedAt:now,endsAt:null,startedAt:now,pausedAt:null,pausedMs:0,finished:done};
  if(done.includes(setKey(p.blocks[0],0))){const next=nextPosition(r);if(!next)return enter(r,"done",now);r={...r,...next};}
  return advanceTimer(enter(r,p.prepareSeconds?"prepare":"work",now),now);
}
export function advanceTimer(run:TimerRun,now=Date.now()):TimerRun {
  let r=run;
  // Absolute deadlines catch up after suspension without accumulating tick drift.
  for(let steps=0;steps<1000&&r.pausedAt===null&&r.endsAt!==null&&now>=r.endsAt;steps++){
    const at=r.endsAt;
    if(r.phase==="prepare")r=enter(r,"work",at);
    else if(r.phase==="work")r=finishWork(r,at);
    else if(r.phase==="rest")r=enter(r,r.program.blocks[r.block].autoNext?"work":"ready",at);
    else break;
  }
  return r;
}
export type TimerAction="ready"|"finish"|"skip"|"pause"|"extend"|"restart";
export function controlTimer(run:TimerRun,action:TimerAction,now=Date.now()):TimerRun {
  let r=advanceTimer(run,now);
  if(action==="pause"){
    if(r.phase==="done")return r;
    if(r.pausedAt===null)return {...r,pausedAt:now};
    const delta=Math.max(0,now-r.pausedAt);
    return {...r,pausedAt:null,pausedMs:r.pausedMs+delta,phaseStartedAt:r.phaseStartedAt+delta,endsAt:r.endsAt===null?null:r.endsAt+delta};
  }
  // A late tap on an expired phase must not finish or skip the next set.
  if(r.phase!==run.phase||r.block!==run.block||r.set!==run.set)return r;
  if(action==="extend"&&r.phase==="rest")return {...r,endsAt:r.endsAt!+30000};
  if(r.pausedAt!==null||r.phase==="done")return r;
  if(action==="ready"&&(r.phase==="ready"||r.phase==="prepare"))return enter(r,"work",now);
  if(action==="finish"&&r.phase==="work")return advanceTimer(finishWork(r,now),now);
  if(action==="restart"&&r.phase==="work")return enter(r,"work",now);
  if(action==="skip"){
    if(r.phase==="rest")return enter(r,"ready",now);
    if(r.phase==="work"||r.phase==="ready"||r.phase==="prepare")return finishWork(r,now,false);
  }
  return r;
}
export function timerSeconds(run:TimerRun,now=Date.now()) {
  const at=Math.max(run.phaseStartedAt,run.pausedAt??now);
  return run.endsAt===null?Math.max(0,Math.floor((at-run.phaseStartedAt)/1000)):Math.max(0,Math.ceil((run.endsAt-at)/1000));
}
export function formatTimer(seconds:number){const s=Math.max(0,Math.floor(seconds)),h=Math.floor(s/3600);return `${h?`${h}:`:""}${h?String(Math.floor(s/60)%60).padStart(2,"0"):Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}
export const standaloneTimerKey=(owner:string|null,profile:string)=>`crux-timer:${encodeURIComponent(owner??"device")}:${encodeURIComponent(profile)}`;
