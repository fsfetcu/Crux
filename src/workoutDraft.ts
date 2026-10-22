import { startTimer,timerBlock,validTimerProgram,validTimerRun,setKey } from "./timer";
import type { TimerProgram,TimerRun } from "./timer";
import { snapshotExercise,uid } from "./model";
import type { Exercise,SessionTemplate,State } from "./model";
import { validExercise,tagFields } from "./storage";

export interface WorkoutDraft { version:1;id:string;profileId:string;started:string;template:SessionTemplate;planId?:string;exercises:Exercise[];completed:Record<string,number[]>;restEndsAt:number|null;timer?:TimerRun;timerSetup?:TimerProgram; }
export const workoutDraftKey=(owner:string|null,profileId:string)=>`crux-workout-draft:${encodeURIComponent(owner??"device")}:${encodeURIComponent(profileId)}`;
export const targetSets=(e:Exercise)=>Math.max(1,Math.min(50,Math.floor(parseFloat(e.sets)||1)));
export function restSeconds(rest:string):number {
  const match=rest.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec(?:onds?)?|min(?:utes?)?|m)?$/i);
  return match?Math.max(0,Math.min(3600,Math.round(Number(match[1])*(match[2]?.toLowerCase().startsWith("m")?60:1)))):90;
}
export function createWorkoutDraft(profileId:string,template:SessionTemplate,exercises?:Exercise[],planId?:string,state?:State):WorkoutDraft {
  const selected=structuredClone(exercises??template.exercises).map((e)=>snapshotExercise(e,template));
  // A last logged load is a starting suggestion; explicit day/library values win.
  const logs=[...(state?.logs??[])].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
  for(const e of selected)if(e.weightKg===undefined){const previous=logs.flatMap((l)=>l.exercises).find((x)=>x.name===e.name&&x.weightKg!==undefined);if(previous)e.weightKg=previous.weightKg;}
  return {version:1,id:uid(),profileId,started:new Date().toISOString(),template:structuredClone(template),planId,exercises:selected,completed:{},restEndsAt:null};
}
export function parseWorkoutDraft(raw:string,profileId:string):WorkoutDraft {
  if(raw.length>1000000)throw Error("Workout draft is too large.");
  const d=JSON.parse(raw);
  if(d?.version!==1||d.profileId!==profileId||typeof d.id!=="string"||!d.id||!Number.isFinite(Date.parse(d.started))||!d.template||!["id","name","category","location","description"].every((key)=>typeof d.template[key]==="string")||!tagFields(d.template)||!Array.isArray(d.template.exercises)||!d.template.exercises.every(validExercise)||!Array.isArray(d.exercises)||d.exercises.length>200||!d.exercises.every(validExercise)||new Set(d.exercises.map((e:Exercise)=>e.id)).size!==d.exercises.length||!d.completed||typeof d.completed!=="object"||Array.isArray(d.completed)||(d.planId!==undefined&&typeof d.planId!=="string")||(d.restEndsAt!==null&&(!Number.isFinite(d.restEndsAt)||d.restEndsAt<0)))throw Error("Invalid workout draft.");
  if((d.timer!==undefined&&!validTimerRun(d.timer))||(d.timerSetup!==undefined&&!validTimerProgram(d.timerSetup)))throw Error("Invalid workout timer.");
  const allowed=new Set(d.exercises.length?d.exercises.map((e:Exercise)=>e.id):["activity"]);
  for(const p of [d.timer?.program,d.timerSetup])if(p&&!p.blocks.every((b:{id:string})=>allowed.has(b.id)))throw Error("Invalid workout timer exercises.");
  if(d.timer&&d.exercises.length&&!d.timer.program.blocks.every((b:{id:string;sets:number})=>b.sets===targetSets(d.exercises.find((e:Exercise)=>e.id===b.id))))throw Error("Invalid timer set targets.");
  for(const [id,sets] of Object.entries(d.completed)){const e=d.exercises.find((x:Exercise)=>x.id===id);if(!e||!Array.isArray(sets)||new Set(sets).size!==sets.length||!sets.every((n)=>Number.isInteger(n)&&n>=0&&n<targetSets(e)))throw Error("Invalid completed sets.");}
  return d;
}
export function completedExercises(d:WorkoutDraft):Exercise[]{return d.exercises.filter((e)=>d.completed[e.id]?.length).map((e)=>({...e,sets:String(d.completed[e.id].length)}));}

export function workoutTimerProgram(d:WorkoutDraft):TimerProgram {
  if(d.timerSetup)return structuredClone(d.timerSetup);
  const rows=d.exercises.length?d.exercises:[{id:"activity",name:d.template.name,sets:"1",reps:"1",rest:"180 s",fingerLoad:false}];
  return {prepareSeconds:5,sound:true,blocks:rows.map(e=>{
    const b=timerBlock(e.name.slice(0,120)),time=e.reps.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec(?:onds?)?|min(?:utes?)?|m)$/i);
    return {...b,id:e.id,sets:targetSets(e),reps:Math.max(1,Math.min(1000,Math.floor(parseFloat(e.reps)||1))),restSeconds:restSeconds(e.rest),mode:time?"duration":"manual",workSeconds:time?Math.max(1,Math.min(86400,Number(time[1])*(time[2].toLowerCase().startsWith("m")?60:1))):30};
  })};
}
export function startWorkoutTimer(d:WorkoutDraft,program:TimerProgram,now=Date.now()):WorkoutDraft {
  const exercises=d.exercises.map(e=>{const b=program.blocks.find(b=>b.id===e.id);return b?{...e,sets:String(b.sets),reps:b.mode==="duration"?`${b.workSeconds} seconds`:String(b.reps),rest:`${b.restSeconds} s`}:e;});
  const completed=Object.fromEntries(Object.entries(d.completed).map(([id,sets])=>[id,sets.filter(i=>i<(program.blocks.find(b=>b.id===id)?.sets??0))]));
  const finished=program.blocks.flatMap(b=>(completed[b.id]??[]).map(i=>setKey(b,i)));
  return {...d,exercises,completed,restEndsAt:null,timerSetup:structuredClone(program),timer:startTimer(program,now,finished)};
}
export function updateWorkoutTimer(d:WorkoutDraft,timer:TimerRun):WorkoutDraft {
  const previous=new Set(d.timer?.finished??[]),completed={...d.completed};
  for(const b of timer.program.blocks)if(d.exercises.some(e=>e.id===b.id))for(let i=0;i<b.sets;i++)if(timer.finished.includes(setKey(b,i))&&!previous.has(setKey(b,i)))completed[b.id]=[...new Set([...(completed[b.id]??[]),i])];
  return {...d,timer,completed};
}
