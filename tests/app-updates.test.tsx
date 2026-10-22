// @vitest-environment jsdom
import { expect,it,vi } from "vitest";
import { act,render,screen,cleanup } from "@testing-library/react";
import { observeAppUpdates,useAppUpdates,checkForAppUpdate } from "../src/appUpdates";
it("offers a refresh after an update activates, without reloading or clearing a first installation",async()=>{
  const original=Object.getOwnPropertyDescriptor(navigator,"serviceWorker");
  const service={controller:null as object|null};Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:service});
  class Worker extends EventTarget {state="installing";}
  class Registration extends EventTarget {installing=new Worker();active=null;waiting=null;update=vi.fn(async()=>{});}
  const reg=new Registration();
  function Status(){const status=useAppUpdates();return <p>{status.ready?"Refresh available":"Current"}</p>;}
  try {
    observeAppUpdates(reg as unknown as ServiceWorkerRegistration);render(<Status/>);
    act(()=>{reg.installing.state="activated";reg.installing.dispatchEvent(new Event("statechange"));});expect(screen.getByText("Current")).toBeTruthy();
    service.controller={};act(()=>{reg.installing=new Worker();reg.dispatchEvent(new Event("updatefound"));reg.installing.state="installed";reg.installing.dispatchEvent(new Event("statechange"));});expect(screen.getByText("Current")).toBeTruthy();
    act(()=>{reg.installing.state="activated";reg.installing.dispatchEvent(new Event("statechange"));});expect(screen.getByText("Refresh available")).toBeTruthy();
    await act(async()=>{await checkForAppUpdate();});expect(reg.update).toHaveBeenCalledOnce();
  } finally {cleanup();if(original)Object.defineProperty(navigator,"serviceWorker",original);else Reflect.deleteProperty(navigator,"serviceWorker");}
});
