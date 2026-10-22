import { describe,expect,it } from "vitest";
import { advanceTimer,controlTimer,formatTimer,setKey,startTimer,timerBlock,timerSeconds,validTimerProgram,validTimerRun,standaloneTimerKey } from "../src/timer";
import { createWorkoutDraft,parseWorkoutDraft,startWorkoutTimer,updateWorkoutTimer,workoutTimerProgram } from "../src/workoutDraft";
import { initialState } from "../src/model";
const at=100000;
const program=(autoNext=false)=>({prepareSeconds:5,sound:false,blocks:[{...timerBlock("Hangs"),sets:3,mode:"duration" as const,workSeconds:10,restSeconds:20,autoNext}]});
describe("work / rest timer engine",()=>{
 it("prepares, counts work, then waits for Ready after rest by default",()=>{
   let r=startTimer(program(),at);expect(r.phase).toBe("prepare");expect(timerSeconds(r,at+1000)).toBe(4);
   r=advanceTimer(r,at+5000);expect(r.phase).toBe("work");expect(r.endsAt).toBe(at+15000);
   r=advanceTimer(r,at+15000);expect(r.phase).toBe("rest");expect(r.finished).toEqual([setKey(r.program.blocks[0],0)]);expect(r.set).toBe(1);
   r=advanceTimer(r,at+120000);expect(r.phase).toBe("ready");expect(r.set).toBe(1);expect(r.finished).toHaveLength(1);
   r=controlTimer(r,"ready",at+120000);expect(r.phase).toBe("work");expect(r.endsAt).toBe(at+130000);
 });
 it("automatically catches up work and rest using their original deadlines",()=>{
   let r=startTimer(program(true),at);r=advanceTimer(r,at+40000);expect(r.phase).toBe("work");expect(r.set).toBe(1);expect(timerSeconds(r,at+40000)).toBe(5);
   r=advanceTimer(r,at+75000);expect(r.phase).toBe("done");expect(r.finished).toHaveLength(3);expect(r.phaseStartedAt).toBe(at+75000);
 });
 it("always waits before a new exercise, including after returning from a long suspension",()=>{
   const p=program(true);p.blocks.push({...p.blocks[0],id:"second",name:"Stretch"});
   const r=advanceTimer(startTimer(p,at),at+3600000);expect(r.phase).toBe("ready");expect(r.block).toBe(1);expect(r.set).toBe(0);expect(r.finished).toHaveLength(3);
 });
 it("pauses and resumes without spending paused time or losing extended rest",()=>{
   let r=advanceTimer(startTimer(program(true),at),at+15000);r=controlTimer(r,"pause",at+20000);expect(timerSeconds(r,at+999999)).toBe(15);
   r=controlTimer(r,"extend",at+40000);expect(timerSeconds(r,at+999999)).toBe(45);
   r=controlTimer(r,"pause",at+50000);expect(r.pausedAt).toBeNull();expect(timerSeconds(r,at+50000)).toBe(45);expect(r.pausedMs).toBe(30000);
 });
 it("supports timed reps, manual reps, zero rests, skipping and restarting",()=>{
   const p=program(true);p.prepareSeconds=0;Object.assign(p.blocks[0],{mode:"reps",reps:6,secondsPerRep:4,restSeconds:0});
   let r=startTimer(p,at);expect(timerSeconds(r,at)).toBe(24);r=controlTimer(r,"restart",at+5000);expect(r.endsAt).toBe(at+29000);
   r=controlTimer(r,"skip",at+6000);expect(r.phase).toBe("ready");expect(r.set).toBe(1);expect(r.finished).toEqual([]);
   r=controlTimer(r,"ready",at+7000);r=advanceTimer(r,at+31000);expect(r.phase).toBe("work");expect(r.set).toBe(2);
   const manual=program(true);manual.prepareSeconds=0;manual.blocks[0].mode="manual" as any;
   let m=startTimer(manual,at);expect(advanceTimer(m,at+999999)).toBe(m);expect(timerSeconds(m,at+21000)).toBe(21);
   m=controlTimer(m,"finish",at+30000);expect(m.phase).toBe("rest");expect(m.finished).toHaveLength(1);
 });
 it("never auto-starts after rest when Ready is selected, even with zero rest",()=>{
   const p=program();p.prepareSeconds=0;p.blocks[0].restSeconds=0;
   const r=advanceTimer(startTimer(p,at),at+999999);expect(r.phase).toBe("ready");expect(r.finished).toHaveLength(1);
 });
 it("does not apply a late phase button to a different automatically started set",()=>{
   const p=program(true);p.prepareSeconds=0;const first=startTimer(p,at);
   const late=controlTimer(first,"finish",at+31000);expect(late.phase).toBe("work");expect(late.set).toBe(1);expect(late.finished).toHaveLength(1);
 });
 it("round-trips only valid bounded timer states and isolates account/profile keys",()=>{
   const r=startTimer(program(true),at);expect(validTimerRun(JSON.parse(JSON.stringify(r)))).toBe(true);
   for(const bad of [{...r,phase:"unknown"},{...r,set:50},{...r,finished:["missing:0"]},{...r,endsAt:null},{...r,pausedAt:NaN}])expect(validTimerRun(bad)).toBe(false);
   expect(validTimerProgram({...program(),blocks:[{...program().blocks[0],sets:0}]})).toBe(false);
   expect(standaloneTimerKey("a","p")).not.toBe(standaloneTimerKey("b","p"));expect(standaloneTimerKey("a","p")).not.toBe(standaloneTimerKey("a","q"));
   expect(formatTimer(3661)).toBe("1:01:01");expect(formatTimer(59)).toBe("0:59");
 });
});
describe("workout timer snapshots",()=>{
 it("preserves library and history while applying per-workout sets, reps, kg and actual completed sets",()=>{
   const state=initialState(),template=state.templates.find(t=>t.id==="strength")!,before=structuredClone(state);
   let d=createWorkoutDraft("p",template,[template.exercises.find(e=>e.id==="bench")!]);const p=workoutTimerProgram(d);p.prepareSeconds=0;p.sound=false;Object.assign(p.blocks[0],{sets:2,reps:5,mode:"duration",workSeconds:10,restSeconds:20,autoNext:false});
   d.exercises[0].weightKg=47.5;d=startWorkoutTimer(d,p,at);d=updateWorkoutTimer(d,advanceTimer(d.timer!,at+10000));
   expect(d.completed.bench).toEqual([0]);expect(d.exercises[0]).toMatchObject({sets:"2",reps:"10 seconds",rest:"20 s",weightKg:47.5});
   expect(parseWorkoutDraft(JSON.stringify(d),"p")).toEqual(d);expect(state).toEqual(before);
   // Reviewing a timed set as not performed must not be undone by later ticks.
   d.completed.bench=[];d=updateWorkoutTimer(d,advanceTimer(d.timer!,at+30000));expect(d.completed.bench).toEqual([]);
 });
 it("uses editable hang durations and existing rests, and supports empty climbing routines",()=>{
   const s=initialState(),t=s.templates.find(t=>t.id==="strength")!,d=createWorkoutDraft("p",t);const p=workoutTimerProgram(d),hang=p.blocks.find(b=>b.id==="slopers")??p.blocks.find(b=>b.name.includes("Beastmaker"));
   expect(hang).toMatchObject({mode:"duration",workSeconds:10,restSeconds:180,sets:5});
   const climbing=createWorkoutDraft("p",s.templates.find(t=>t.id==="kilter")!);const run=startWorkoutTimer(climbing,workoutTimerProgram(climbing),at);expect(run.exercises).toEqual([]);expect(parseWorkoutDraft(JSON.stringify(run),"p").timer).toBeTruthy();
 });
 it("starts at the first incomplete set and accepts legacy drafts without a guided timer",()=>{
   const s=initialState(),t=s.templates.find(t=>t.id==="strength")!,d=createWorkoutDraft("p",t,[t.exercises.find(e=>e.id==="bench")!]);d.completed.bench=[0,1];
   expect(parseWorkoutDraft(JSON.stringify(d),"p").timer).toBeUndefined();const next=startWorkoutTimer(d,workoutTimerProgram(d),at);expect(next.timer?.set).toBe(2);expect(next.completed.bench).toEqual([0,1]);
 });
});
