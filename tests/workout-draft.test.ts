import { describe,it,expect } from "vitest";
import { createWorkoutDraft,parseWorkoutDraft,completedExercises,restSeconds,targetSets,workoutDraftKey } from "../src/workoutDraft";
import { initialState } from "../src/model";
describe("resumable workout drafts",()=>{
  it("keeps checked sets and weights independent of the library and logs, with account/profile isolation",()=>{
    const state=initialState(),template=state.templates.find((t)=>t.id==="strength")!,bench=template.exercises.find((e)=>e.id==="bench")!;
    const d=createWorkoutDraft("plan",template,undefined,"scheduled",state);
    d.exercises.find((e)=>e.id==="bench")!.weightKg=52.5;d.completed[bench.id]=[0,2];d.restEndsAt=Date.now()+120000;
    const reopened=parseWorkoutDraft(JSON.stringify(d),"plan");
    expect(reopened).toEqual(d);expect(template.exercises.find((e)=>e.id==="bench")!.weightKg).toBeUndefined();expect(state.logs).toEqual([]);
    expect(completedExercises(reopened)).toEqual([{...d.exercises.find((e)=>e.id==="bench")!,sets:"2"}]);
    expect(workoutDraftKey("a","plan")).not.toBe(workoutDraftKey("b","plan"));expect(workoutDraftKey("a","plan")).not.toBe(workoutDraftKey("a","other"));
    expect(()=>parseWorkoutDraft(JSON.stringify(d),"another-plan")).toThrow();
    for(const invalid of [[0,0],[50],[-1],[0.5]])expect(()=>parseWorkoutDraft(JSON.stringify({...d,completed:{bench:invalid}}),"plan")).toThrow();
  });
  it("parses configured rest times and bounds set controls",()=>{
    expect(restSeconds("3 min")).toBe(180);expect(restSeconds("120 s")).toBe(120);expect(restSeconds("1.5 minutes")).toBe(90);expect(restSeconds("as needed")).toBe(90);expect(restSeconds("0 s")).toBe(0);
    const e=initialState().templates.find((t)=>t.id==="strength")!.exercises[0];expect(targetSets({...e,sets:"3–4"})).toBe(3);expect(targetSets({...e,sets:"1000"})).toBe(50);
  });
});
