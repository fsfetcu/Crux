import { describe, expect, it } from "vitest";
import { firstProfile, createProfile, parseProfileBackup } from "../src/profiles";
import { initialState, dayKey, weekStart, trainingTags } from "../src/model";
import type { Workout } from "../src/model";
import { addCatalogueToPlan, templateInPlan, removeTemplateFromPlan } from "../src/catalogue";
import { gradeTotals, normalizeGradeCounts } from "../src/grades";
import { recommend } from "../src/engine";
import { parseBackup } from "../src/storage";
const logged = (grades?: Workout["gradeCounts"]): Workout => ({id:"log",timestamp:new Date().toISOString(),templateId:"kilter",category:"hard",name:"Kilter",location:"",duration:null,rpe:7,fingers:"fresh",fingerLoad:true,notes:"",projects:[{name:"Example",grade:"6A",attempts:1,outcome:"sent"}],exercises:[],gradeCounts:grades});
describe("reusable personal catalogue",()=>{
  it("migrates previous profiles and custom sessions without rewriting their plans or history",()=>{
    const original=firstProfile(initialState()); delete original.catalogue;
    original.profiles[0].state.templates.push({...original.profiles[0].state.templates[0],id:"custom",name:"My custom session"});
    original.profiles[0].state.logs=[logged()];
    const upgraded=parseProfileBackup(JSON.stringify(original));
    expect(upgraded.profiles).toEqual(original.profiles);
    expect(upgraded.catalogue!.some((i)=>i.name==="My custom session")).toBe(true);
    expect(upgraded.catalogue!.map((i)=>i.name)).toEqual(expect.arrayContaining(["Bouldering 4×4","20-boulder endurance","Top-rope endurance","Board max power"]));
    expect(parseProfileBackup(JSON.stringify(upgraded))).toEqual(upgraded);
    expect(parseProfileBackup(JSON.stringify({...upgraded,catalogue:[]})).catalogue).toEqual([]);
  });
  it("copies selected exercises independently into the chosen profile and rejects duplicates",()=>{
    const original=createProfile(firstProfile(initialState()),"New plan");
    const item=original.catalogue!.find((i)=>i.name==="Strength")!;
    item.exercises[0].weightKg=22.5;
    const added=addCatalogueToPlan(original,item,original.activeProfileId,"",{name:"Gym work",target:1},[item.exercises[0].id]);
    const profile=added.profiles[1],copy=templateInPlan(item,profile)!;
    expect(added.profiles[0]).toEqual(original.profiles[0]);
    expect(copy.exercises).toHaveLength(1); expect(copy.exercises[0].weightKg).toBe(22.5);
    copy.exercises[0].weightKg=30; expect(item.exercises[0].weightKg).toBe(22.5);
    expect(original.profiles[1].state.templates).toHaveLength(1);
    expect(()=>addCatalogueToPlan(added,item,profile.id,copy.category)).toThrow(/already/);
    expect(parseProfileBackup(JSON.stringify(added))).toEqual(added);
  });
  it("preserves weekly overrides, archives and history while adding/removing plan membership",()=>{
    const data=firstProfile(initialState()),profile=data.profiles[0],start=weekStart(dayKey(),profile.state.settings.weekStart);
    profile.state.weeks[start].goals.hard=1;
    profile.state.logs=[logged([{system:"font",grade:"6A",count:5}])];
    const item=data.catalogue!.find((i)=>i.name==="Bouldering 4×4")!;
    const next=addCatalogueToPlan(data,item,profile.id,"",{name:"Power endurance",target:1});
    const state=next.profiles[0].state,copy=templateInPlan(item,next.profiles[0])!;
    expect(state.weeks[start].goals.hard).toBe(1);
    state.plans=[{id:"scheduled",templateId:copy.id,date:dayKey()}];
    const removed=removeTemplateFromPlan(state,copy.id);
    expect(removed.plans).toEqual([]); expect(removed.logs).toEqual(profile.state.logs);
    expect(data.catalogue!.some((i)=>i.id===item.id)).toBe(true);
    expect(()=>removeTemplateFromPlan(removed,"rest")).toThrow(/recovery/);
  });
  it("keeps catalogue-only sessions out of recommendations and carries copied loading tags into recovery",()=>{
    const data=createProfile(firstProfile(initialState()),"Empty plan"),item=data.catalogue!.find((i)=>i.name==="Board max power")!;
    const checkin={recovery:"recovered",fingers:"fresh",skin:"good",energy:"high"} as const;
    expect(recommend(data.profiles[1].state,checkin).primary.category).toBe("rest");
    const next=addCatalogueToPlan(data,item,data.activeProfileId,"",{name:"Power",target:1});
    const state=next.profiles[1].state,copy=templateInPlan(item,next.profiles[1])!;
    expect(recommend(state,checkin).primary.templateId).toBe(copy.id);
    state.logs=[{...logged(),timestamp:new Date(Date.now()-12*3600000).toISOString()}];
    expect(recommend(state,checkin).primary.intensity).not.toBe("hard");
  });
  it("preserves original exercise loading defaults when a routine gets a new ID, and can remove the last legacy workout of a type",()=>{
    const data=createProfile(firstProfile(initialState()),"Strength plan");
    const item=data.catalogue!.find((i)=>i.name==="Strength")!;
    const bench=item.exercises.find((e)=>e.id==="bench")!;
    const next=addCatalogueToPlan(data,item,data.activeProfileId,"",{name:"Gym",target:1},[bench.id]);
    const added=templateInPlan(item,next.profiles[1])!;
    expect(trainingTags(added).loading).toEqual(["upper"]);
    const original=data.profiles[0].state;
    const removed=removeTemplateFromPlan(original,"volume");
    expect(parseBackup(JSON.stringify(removed)).templates.some((t)=>t.id==="volume")).toBe(false);
  });
});
describe("grades and optional kilogram data",()=>{
  it("combines normalized duplicate rows, separates grading systems and avoids counting projects twice",()=>{
    const rows=normalizeGradeCounts([{system:"font",grade:" 6a ",count:3},{system:"font",grade:"6A",count:2},{system:"v",grade:"v3",count:4}]);
    expect(rows).toEqual([{system:"font",grade:"6A",count:5},{system:"v",grade:"V3",count:4}]);
    expect(gradeTotals([logged(rows),{...logged(),id:"without-counts"}])).toEqual(rows);
    expect(()=>normalizeGradeCounts([{system:"font",grade:"",count:1}])).toThrow();
    expect(()=>normalizeGradeCounts([{system:"font",grade:"6A",count:1.5}])).toThrow();
  });
  it("round-trips catalogue, plan, log weights and grade counts, rejecting invalid imported values",()=>{
    const data=firstProfile(initialState()),state=data.profiles[0].state;
    const strength=state.templates.find((t)=>t.id==="strength")!;
    strength.exercises[0].weightKg=0; strength.exercises[1].weightKg=27.5;
    state.plans=[{id:"day",date:dayKey(),templateId:strength.id,exercises:[{...strength.exercises[1],weightKg:30}]}];
    state.logs=[{...logged([{system:"font",grade:"6A",count:5}]),exercises:[{...strength.exercises[1],weightKg:32.5}]}];
    expect(parseProfileBackup(JSON.stringify(data))).toEqual(data);
    for(const value of [-1,2001,null]) {
      const invalid=structuredClone(state); invalid.templates.find((t)=>t.id==="strength")!.exercises[0].weightKg=value as number;
      expect(()=>parseBackup(JSON.stringify(invalid))).toThrow();
    }
    const invalid=structuredClone(state); invalid.logs[0].gradeCounts![0].count=-1;
    expect(()=>parseBackup(JSON.stringify(invalid))).toThrow();
    data.catalogue![0].exercises=[{...strength.exercises[0],weightKg:-1}];
    expect(()=>parseProfileBackup(JSON.stringify(data))).toThrow(/catalogue/);
  });
});
