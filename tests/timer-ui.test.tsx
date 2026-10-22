// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { act,cleanup,fireEvent,render,screen,within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import { TimerPage } from "../src/TimerPage";
import { PROFILE_KEY,firstProfile } from "../src/profiles";
import { initialState } from "../src/model";
import { standaloneTimerKey } from "../src/timer";
let now:number;
beforeEach(()=>{localStorage.clear();window.scrollTo=vi.fn();now=Date.now();vi.spyOn(Date,"now").mockImplementation(()=>now);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const tick=(seconds:number)=>act(()=>{now+=seconds*1000;fireEvent(document,new Event("visibilitychange"));});
const change=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});
for(const auto of [false,true])it(`runs standalone intervals with ${auto?"automatic starts":"Ready between sets"} and leaves training untouched`,async()=>{
 const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole("button",{name:"Go to Timer"}));
 const before=localStorage.getItem(PROFILE_KEY);change("Preparation (seconds)","0");change("Exercise 1 sets","2");change("Exercise 1 work seconds","1");change("Exercise 1 rest seconds","1");await user.selectOptions(screen.getByLabelText("Exercise 1 after rest"),auto?"auto":"ready");
 await user.click(screen.getByRole("button",{name:"Start timer"}));expect(screen.getByRole("timer").textContent).toBe("0:01");tick(1);expect(screen.getByText("REST")).toBeTruthy();tick(1);
 if(auto){expect(screen.getByText("WORK")).toBeTruthy();expect(screen.queryByRole("button",{name:"Ready"})).toBeNull();}else{expect(screen.getByRole("timer").textContent).toBe("Ready");tick(60);expect(screen.getByRole("timer").textContent).toBe("Ready");await user.click(screen.getByRole("button",{name:"Ready"}));}
 tick(1);expect(screen.getByRole("timer").textContent).toBe("Done");expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
});
it("keeps a paused countdown after reopening, runs across tabs, and exposes Timer after Progress",async()=>{
 const user=userEvent.setup();let view=render(<App/>);const nav=within(screen.getByRole("navigation",{name:"Phone navigation"})).getAllByRole("button");expect(nav.map(b=>b.textContent)).toEqual(["Today","Plan","Catalogue","Progress","Timer"]);
 await user.click(screen.getByRole("button",{name:"Go to Timer"}));await user.click(screen.getByRole("button",{name:"Countdown"}));change("Countdown seconds","30");await user.click(screen.getByRole("button",{name:"Start timer"}));tick(5);await user.click(screen.getByRole("button",{name:"Pause timer"}));view.unmount();tick(120);view=render(<App/>);
 await user.click(screen.getByRole("button",{name:"Go to Timer"}));expect(screen.getByRole("timer").textContent).toBe("0:25");await user.click(screen.getByRole("button",{name:"Resume timer"}));await user.click(screen.getByRole("button",{name:"Go to Progress"}));tick(10);
 const shortcut=screen.getByRole("button",{name:/Timer · work 0:15/});await user.click(shortcut);expect(screen.getByRole("timer").textContent).toBe("0:15");
});
it("builds and reorders a custom sequence, and waits before the next exercise",async()=>{
 const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole("button",{name:"Go to Timer"}));await user.click(screen.getByRole("button",{name:"Custom sequence"}));await user.click(screen.getByRole("button",{name:"Add exercise"}));change("Exercise 2 name","Shoulder stretch");
 await user.click(screen.getByRole("button",{name:"Move exercise 2 up"}));expect((screen.getByLabelText("Exercise 1 name") as HTMLInputElement).value).toBe("Shoulder stretch");
 change("Preparation (seconds)","0");change("Shoulder stretch sets","1");change("Shoulder stretch work seconds","1");await user.selectOptions(screen.getByLabelText("Shoulder stretch after rest"),"auto");await user.click(screen.getByRole("button",{name:"Start timer"}));tick(100);
 expect(screen.getByRole("timer").textContent).toBe("Ready");expect(screen.getByRole("heading",{name:"Exercise 1"})).toBeTruthy();expect(screen.getByRole("button",{name:"Ready"})).toBeTruthy();
});
it("configures a workout, resumes it, reviews timed sets and logs only actual work without changing its library",async()=>{
 const state=initialState(),template=state.templates.find(t=>t.id==="strength")!,bench=structuredClone(template.exercises.find(e=>e.id==="bench")!);template.exercises=[bench];const data=firstProfile(state);localStorage.setItem(PROFILE_KEY,JSON.stringify(data));
 const user=userEvent.setup();let view=render(<App/>);await user.click(screen.getByRole("button",{name:"Plan"}));await user.click(screen.getByRole("tab",{name:"Strength"}));await user.click(screen.getByRole("button",{name:"Start Full-body strength"}));
 change("Preparation (seconds)","0");change("Bench press sets","2");change("Bench press reps","5");await user.selectOptions(screen.getByLabelText("Bench press timing"),"reps");change("Bench press seconds per rep","0.2");change("Bench press rest seconds","1");change("Bench press kilograms","47.5");await user.click(screen.getByRole("button",{name:"Start timer"}));tick(1);tick(1);expect(screen.getByRole("timer").textContent).toBe("Ready");
 await user.click(screen.getByRole("button",{name:"Continue later"}));view.unmount();tick(120);view=render(<App/>);await user.click(screen.getByRole("button",{name:"Resume workout"}));expect(screen.getByText("PAUSED")).toBeTruthy();expect((screen.getByLabelText("Bench press kilograms") as HTMLInputElement).value).toBe("47.5");
 await user.click(screen.getByRole("button",{name:"Finish & log"}));await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Cancel"}));await user.click(screen.getByRole("button",{name:"Resume workout"}));expect(screen.getByText("PAUSED")).toBeTruthy();
 await user.click(screen.getByRole("button",{name:"Bench press set 1"}));await user.click(screen.getByRole("button",{name:"Resume timer"}));await user.click(screen.getByRole("button",{name:"Ready"}));tick(1);expect(screen.getByRole("timer").textContent).toBe("Done");expect(screen.getByRole("button",{name:"Bench press set 1"}).getAttribute("aria-pressed")).toBe("false");expect(screen.getByRole("button",{name:"Bench press set 2"}).getAttribute("aria-pressed")).toBe("true");
 await user.click(screen.getByRole("button",{name:"Finish & log"}));await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Save workout"}));const saved=JSON.parse(localStorage.getItem(PROFILE_KEY)!);expect(saved.profiles[0].state.templates.find((t:any)=>t.id==="strength").exercises[0]).toEqual(bench);expect(saved.profiles[0].state.logs[0].exercises[0]).toMatchObject({sets:"1",reps:"5",rest:"1 s",weightKg:47.5});
});
it("retains an unreadable one-time timer until an explicit reset, then saves new timers normally",async()=>{
 const key=standaloneTimerKey("a","p");localStorage.setItem(key,"unreadable original");const user=userEvent.setup();render(<TimerPage owner="a" profileId="p" visible onOpen={()=>{}}/>);expect(screen.getByRole("alert").textContent).toContain("Couldn’t restore");expect(localStorage.getItem(key)).toBe("unreadable original");
 await user.click(screen.getByRole("button",{name:"Reset timer"}));await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Reset timer"}));await user.click(screen.getByRole("button",{name:"Start timer"}));expect(JSON.parse(localStorage.getItem(key)!).run).toBeTruthy();expect(localStorage.getItem(`${key}:recovery`)).toBe("unreadable original");
});
