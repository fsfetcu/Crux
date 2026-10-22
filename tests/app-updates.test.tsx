// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { act,render,screen,cleanup } from "@testing-library/react";

const original=Object.getOwnPropertyDescriptor(navigator,"serviceWorker");
let service: EventTarget & {controller:Worker|null;register:ReturnType<typeof vi.fn>};
class Worker extends EventTarget {state="activated";postMessage=vi.fn();}
class Registration extends EventTarget {
  installing:Worker|null=null;active:Worker|null=new Worker();waiting:Worker|null=null;
  update=vi.fn(async()=>{});
}
let reg:Registration;
beforeEach(()=>{
  vi.resetModules();vi.useFakeTimers();vi.stubEnv("PROD",true);
  document.head.innerHTML='<meta name="crux-build" content="loaded-build">';
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});
  Object.defineProperty(navigator,"onLine",{configurable:true,value:true});
  reg=new Registration();service=Object.assign(new EventTarget(),{controller:reg.active,register:vi.fn(async()=>reg)});
  Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:service});
  sessionStorage.clear();localStorage.clear();
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks();document.head.innerHTML="";document.body.classList.remove("dragging-workout");if(original)Object.defineProperty(navigator,"serviceWorker",original);else Reflect.deleteProperty(navigator,"serviceWorker");});
async function setup(){const updates=await import("../src/appUpdates");updates.startAppUpdates();await act(async()=>{});return updates;}
function announce(version:string,source:Worker|null=reg.active){service.dispatchEvent(new MessageEvent("message",{source:source as unknown as ServiceWorker,data:{type:"CRUX_VERSION",version}}));}

it("checks immediately, on returning to the foreground, and after reconnecting",async()=>{
  await setup();expect(service.register).toHaveBeenCalledOnce();expect(reg.update).toHaveBeenCalledOnce();
  expect(service.register).toHaveBeenCalledWith(expect.stringContaining("sw.js"),expect.objectContaining({updateViaCache:"none"}));
  act(()=>window.dispatchEvent(new Event("pageshow")));expect(reg.update).toHaveBeenCalledOnce();
  await act(async()=>{vi.advanceTimersByTime(31000);document.dispatchEvent(new Event("visibilitychange"));});expect(reg.update).toHaveBeenCalledTimes(2);
  Object.defineProperty(navigator,"onLine",{configurable:true,value:false});
  await act(async()=>{vi.advanceTimersByTime(31000);window.dispatchEvent(new Event("online"));});expect(reg.update).toHaveBeenCalledTimes(2);
  Object.defineProperty(navigator,"onLine",{configurable:true,value:true});
  await act(async()=>{window.dispatchEvent(new Event("online"));});expect(reg.update).toHaveBeenCalledTimes(3);
});
it("detects an already activated update after suspension without reloading a matching first install",async()=>{
  const updates=await setup();function Status(){const s=updates.useAppUpdates();return <p>{s.ready?"Update now":"Current"}</p>;}
  render(<Status/>);act(()=>announce("loaded-build"));expect(screen.getByText("Current")).toBeTruthy();
  act(()=>announce("unrelated-build",new Worker()));expect(screen.getByText("Current")).toBeTruthy();
  act(()=>announce("downloaded-build"));expect(screen.getByText("Update now")).toBeTruthy();
  // Same-version active workers must not trigger a reload loop.
  act(()=>announce("loaded-build"));expect(screen.getByText("Current")).toBeTruthy();
});
it("queries a newly controlling worker and retries failed registration",async()=>{
  service.register.mockRejectedValueOnce(Error("Offline"));const updates=await setup();expect(reg.update).not.toHaveBeenCalled();
  await act(async()=>updates.checkForAppUpdate());expect(service.register).toHaveBeenCalledTimes(2);
  const worker=new Worker();service.controller=worker;reg.active=worker;
  act(()=>service.dispatchEvent(new Event("controllerchange")));expect(worker.postMessage).toHaveBeenCalledWith({type:"CRUX_GET_VERSION"});
});
it("keeps local training, pending sync and workout drafts intact, and limits automatic reloads",async()=>{
  const updates=await setup();const saved={history:"completed training",draft:"sets, kg and timer",pending:"unsynced change"};
  for(const [k,v] of Object.entries(saved))localStorage.setItem(k,v);
  announce("downloaded-build");const reload=vi.fn();expect(updates.refreshApp(true,reload)).toBe(true);expect(reload).toHaveBeenCalledOnce();
  expect(Object.fromEntries(Object.keys(saved).map(k=>[k,localStorage.getItem(k)]))).toEqual(saved);
  vi.resetModules();const reopened=await import("../src/appUpdates");reopened.startAppUpdates();await act(async()=>{});announce("downloaded-build");
  expect(reopened.refreshApp(true,reload)).toBe(false);expect(reload).toHaveBeenCalledOnce();
  expect(reopened.refreshApp(false,reload)).toBe(true);expect(reload).toHaveBeenCalledTimes(2);
});
it("does not update an editor, workout, active drag, hidden page, or failed save",async()=>{
  const {useSafeAppUpdate}=await setup();const apply=vi.fn();
  function Guard({saved=true}:{saved?:boolean}){useSafeAppUpdate(true,saved,apply);return null;}
  const view=render(<Guard saved={false}/>);act(()=>vi.advanceTimersByTime(5000));expect(apply).not.toHaveBeenCalled();
  view.rerender(<Guard/>);const dialog=document.createElement("div");dialog.role="dialog";document.body.append(dialog);
  act(()=>vi.advanceTimersByTime(5000));expect(apply).not.toHaveBeenCalled();dialog.remove();
  const form=document.createElement("form");document.body.append(form);act(()=>vi.advanceTimersByTime(3000));expect(apply).not.toHaveBeenCalled();form.remove();
  const checkin=document.createElement("div");checkin.dataset.updateBlock="";document.body.append(checkin);act(()=>vi.advanceTimersByTime(3000));expect(apply).not.toHaveBeenCalled();checkin.remove();
  document.body.classList.add("dragging-workout");act(()=>vi.advanceTimersByTime(3000));expect(apply).not.toHaveBeenCalled();document.body.classList.remove("dragging-workout");
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});act(()=>vi.advanceTimersByTime(3000));expect(apply).not.toHaveBeenCalled();
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});act(()=>vi.advanceTimersByTime(500));expect(apply).toHaveBeenCalledWith(true);
});
it("waits for typing and held pointers to finish before automatically applying an update",async()=>{
  const {useSafeAppUpdate}=await setup();const apply=vi.fn();function Guard(){useSafeAppUpdate(true,true,apply);return <input aria-label="Notes"/>;}
  render(<Guard/>);const input=screen.getByLabelText("Notes");input.focus();act(()=>vi.advanceTimersByTime(3000));expect(apply).not.toHaveBeenCalled();input.blur();
  act(()=>{window.dispatchEvent(new Event("pointerdown"));vi.advanceTimersByTime(5000);});expect(apply).not.toHaveBeenCalled();
  act(()=>{window.dispatchEvent(new Event("pointerup"));vi.advanceTimersByTime(2000);window.dispatchEvent(new Event("input"));vi.advanceTimersByTime(2000);});expect(apply).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(500));expect(apply).toHaveBeenCalledWith(true);
});
it("leaves the current app usable when checking offline or when downloading fails",async()=>{
  const updates=await setup();function Status(){return <p>{updates.useAppUpdates().message}</p>;}render(<Status/>);
  Object.defineProperty(navigator,"onLine",{configurable:true,value:false});await act(async()=>updates.checkForAppUpdate());expect(screen.getByText(/You’re offline/)).toBeTruthy();
  Object.defineProperty(navigator,"onLine",{configurable:true,value:true});reg.update.mockRejectedValueOnce(Error("Unavailable"));await act(async()=>updates.checkForAppUpdate());expect(screen.getByText(/Couldn’t check/)).toBeTruthy();expect(updates.refreshApp(true,vi.fn())).toBe(false);
});
