// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen,within,fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import { PROFILE_KEY,firstProfile } from "../src/profiles";
import { initialState,dayKey } from "../src/model";
import { workoutDraftKey } from "../src/workoutDraft";
const saved=()=>JSON.parse(localStorage.getItem(PROFILE_KEY)!);
beforeEach(()=>{localStorage.clear();window.scrollTo=vi.fn();});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("phone app flows",()=>{
  it("keeps Today focused and exposes all four sections and profile settings",async()=>{
    const user=userEvent.setup();render(<App/>);
    expect(screen.queryByRole("region",{name:"Workouts to drag into your calendar"})).toBeNull();
    expect(screen.queryByRole("button",{name:"Drag Kilter projecting into calendar"})).toBeNull();
    const nav=screen.getByRole("navigation",{name:"Phone navigation"});
    await user.click(within(nav).getByRole("button",{name:"Go to Plan"}));
    expect(screen.getByRole("button",{name:"Drag Kilter projecting into calendar"})).toBeTruthy();
    await user.click(within(nav).getByRole("button",{name:"Go to Catalogue"}));expect(screen.getByRole("heading",{name:"Your training catalogue."})).toBeTruthy();
    await user.click(screen.getByRole("button",{name:"Profile and settings"}));
    await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Settings"}));expect(screen.getByRole("heading",{name:"Training preferences"})).toBeTruthy();
  });
  it("defers an automatic update while a recovery check-in has unsaved choices",async()=>{
    const user=userEvent.setup();render(<App/>);
    expect(document.querySelector("[data-update-block]")).toBeNull();
    await user.click(screen.getByRole("button",{name:"Somewhat fatigued"}));
    expect(document.querySelector("[data-update-block]")).toBeTruthy();
    await user.click(screen.getByRole("button",{name:"Get my recommendation"}));
    expect(document.querySelector("[data-update-block]")).toBeNull();
    expect(saved().profiles[0].state.checkins[dayKey()].recovery).toBe("somewhat");
  });
  it("resumes a workout with completed sets and weights, then logs only the work done",async()=>{
    const user=userEvent.setup();let view=render(<App/>);
    await user.click(screen.getByRole("button",{name:"Plan"}));await user.click(screen.getByRole("tab",{name:"Strength"}));
    await user.click(screen.getByRole("button",{name:"Start Full-body strength"}));let dialog=screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button",{name:"Bench press set 1"}));await user.click(within(dialog).getByRole("button",{name:"Bench press set 2"}));
    await user.type(within(dialog).getByLabelText("Bench press kilograms"),"52.5");
    expect(saved().profiles[0].state.logs).toEqual([]);
    expect(within(dialog).getByRole("timer").textContent).toBe("2:00");
    await user.click(within(dialog).getByRole("button",{name:"Continue later"}));view.unmount();view=render(<App/>);
    await user.click(screen.getByRole("button",{name:"Resume workout"}));dialog=screen.getByRole("dialog");
    expect(within(dialog).getByRole("button",{name:"Bench press set 1"}).getAttribute("aria-pressed")).toBe("true");
    expect((within(dialog).getByLabelText("Bench press kilograms") as HTMLInputElement).value).toBe("52.5");
    await user.click(within(dialog).getByRole("button",{name:"Finish & log"}));await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Save workout"}));
    const log=saved().profiles[0].state.logs[0];expect(log.exercises).toHaveLength(1);expect(log.exercises[0]).toMatchObject({name:"Bench press",sets:"2",weightKg:52.5});expect(log.fingerLoad).toBe(false);
    expect(localStorage.getItem(workoutDraftKey(null,"original-climbing"))).toBeNull();expect(screen.queryByRole("button",{name:"Resume workout"})).toBeNull();
  });
  it("keeps a rest timer accurate when the phone resumes after being hidden",async()=>{
    const user=userEvent.setup();let now=Date.now();vi.spyOn(Date,"now").mockImplementation(()=>now);render(<App/>);
    await user.click(screen.getByRole("button",{name:"Plan"}));await user.click(screen.getByRole("tab",{name:"Strength"}));await user.click(screen.getByRole("button",{name:"Start Full-body strength"}));
    await user.click(screen.getByRole("button",{name:"Bench press set 1"}));now+=121000;fireEvent(document,new Event("visibilitychange"));expect(screen.getByRole("timer").textContent).toBe("Rest complete");
  });
  it("can discard an unfinished draft without removing the plan or logging a workout",async()=>{
    const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole("button",{name:"Plan"}));await user.click(screen.getByRole("tab",{name:"Strength"}));await user.click(screen.getByRole("button",{name:"Start Full-body strength"}));
    await user.click(screen.getByRole("button",{name:"Bench press set 1"}));const before=saved().profiles[0].state;
    await user.click(screen.getByRole("button",{name:"Discard unfinished workout"}));expect(screen.getByRole("alert").textContent).toContain("training history");await user.click(screen.getByRole("button",{name:"Discard draft"}));
    expect(saved().profiles[0].state).toEqual(before);expect(localStorage.getItem(workoutDraftKey(null,"original-climbing"))).toBeNull();expect(screen.queryByRole("button",{name:"Resume workout"})).toBeNull();
  });
  it("lets the phone day strip select days without changing planned or completed training",async()=>{
    const data=firstProfile(initialState()),state=data.profiles[0].state;state.plans=[{id:"day",date:dayKey(),templateId:"kilter"}];localStorage.setItem(PROFILE_KEY,JSON.stringify(data));
    const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole("button",{name:"Plan"}));
    const days=within(screen.getByLabelText("Choose a calendar day")).getAllByRole("button");await user.click(days[0]);expect(days[0].getAttribute("aria-pressed")).toBe("true");expect(saved().profiles[0].state.plans).toEqual(state.plans);expect(saved().profiles[0].state.logs).toEqual([]);
  });
});
