import { useEffect, useSyncExternalStore } from "react";

type UpdateState = { ready:boolean; checking:boolean; offlineReady:boolean; message:string; version:string };
let state:UpdateState={ready:false,checking:false,offlineReady:false,message:"",version:""};
const listeners=new Set<()=>void>();
const publish=(patch:Partial<UpdateState>)=>{state={...state,...patch};listeners.forEach((fn)=>fn());};
const loadedVersion=document.querySelector<HTMLMetaElement>('meta[name="crux-build"]')?.content ?? "";
let registration:ServiceWorkerRegistration | undefined;
let registering:Promise<ServiceWorkerRegistration> | undefined;
let started=false;
let lastCheck=0;
let reloading=false;
const watched=new WeakSet<ServiceWorker>();

function askVersion(worker:ServiceWorker|null) {
  if(worker?.state==="activated")worker.postMessage({type:"CRUX_GET_VERSION"});
}
export function observeAppUpdates(reg:ServiceWorkerRegistration) {
  registration=reg;
  const watch=(worker:ServiceWorker|null)=>{
    if(!worker||watched.has(worker))return;
    watched.add(worker);
    const wasControlled=!!navigator.serviceWorker.controller;
    worker.addEventListener("statechange",()=>{
      if(worker.state==="activated") {
        publish({offlineReady:true,...(!loadedVersion&&wasControlled?{ready:true}:{})});
        askVersion(worker);
      }
      if(worker.state==="redundant"&&!state.ready)publish({message:"The update couldn’t finish downloading. Your current app is still available."});
    });
  };
  reg.addEventListener("updatefound",()=>watch(reg.installing));
  watch(reg.installing);
  watch(reg.waiting);
  if(reg.active){publish({offlineReady:true});askVersion(reg.active);}
}
async function ensureRegistration() {
  if(registration)return registration;
  if(!registering)registering=navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL,updateViaCache:"none"}).then((reg)=>{observeAppUpdates(reg);return reg;}).finally(()=>{registering=undefined;});
  return registering;
}
export async function checkForAppUpdate(silent=false) {
  if(!navigator.onLine){if(!silent)publish({message:"You’re offline. Saved training and downloaded updates are still available."});return;}
  if(state.checking)return;
  if(!("serviceWorker" in navigator)){if(!silent)publish({message:"Automatic updates aren’t available in this browser."});return;}
  publish({checking:true,...(!silent?{message:""}:{})});
  try {
    const reg=await ensureRegistration();
    lastCheck=Date.now();
    await reg.update();
    askVersion(reg.active);
    if(!silent)publish({message:reg.installing||reg.waiting?"Downloading the update. It will apply when you’re ready.":"Update check complete. Any new version will apply when you’re ready."});
  } catch {if(!silent)publish({message:"Couldn’t check for updates. Your saved training is safe; try again when connected."});}
  finally {publish({checking:false});}
}
export function startAppUpdates() {
  if(started || !("serviceWorker" in navigator) || !import.meta.env.PROD)return;
  started=true;
  navigator.serviceWorker.addEventListener("message",(event:MessageEvent)=>{
    if(event.source!==registration?.active&&event.source!==navigator.serviceWorker.controller)return;
    if(event.data?.type!=="CRUX_VERSION"||typeof event.data.version!=="string"||!event.data.version)return;
    publish({offlineReady:true,version:event.data.version,ready:!!loadedVersion&&loadedVersion!==event.data.version});
  });
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    publish({offlineReady:true});
    askVersion(navigator.serviceWorker.controller);
  });
  const check=()=>{
    if(document.visibilityState!=="visible")return;
    // A worker may have changed while iOS suspended this page. Compare versions
    // even when a network check is throttled or the phone is now offline.
    askVersion(navigator.serviceWorker.controller);
    if(navigator.onLine&&Date.now()-lastCheck>30000)void checkForAppUpdate(true);
  };
  document.addEventListener("visibilitychange",check);
  window.addEventListener("online",check);
  window.addEventListener("pageshow",check);
  window.addEventListener("focus",check);
  // Do not wait for load/pageshow: they can fire before registration finishes.
  void checkForAppUpdate(true);
}
export function useAppUpdates(){return useSyncExternalStore((fn)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>state);}

export function updateIsBlocked() {
  return document.visibilityState!=="visible" || !!document.querySelector('[role="dialog"], form, [contenteditable="true"], [data-update-block]') || document.body.classList.contains("dragging-workout") || document.activeElement?.matches("input,textarea,select");
}
export function refreshApp(automatic=false,reload=()=>window.location.reload()) {
  if(reloading||!state.ready||registration?.active?.state!=="activated")return false;
  // A cached/proxy mismatch must never trap someone in a reload loop.
  if(automatic){
    try {
      const key="crux-last-automatic-update",previous=JSON.parse(sessionStorage.getItem(key)??"null");
      if(previous?.version===state.version&&Date.now()-previous.at<60000)return false;
      sessionStorage.setItem(key,JSON.stringify({version:state.version,at:Date.now()}));
    } catch {return false;}
  }
  reloading=true;
  reload();
  return true;
}
export function useSafeAppUpdate(ready:boolean,storageReady:boolean,apply=refreshApp) {
  useEffect(()=>{
    if(!ready||!storageReady)return;
    let lastInteraction=Date.now(),pointerDown=false;
    const touch=()=>{lastInteraction=Date.now();};
    const down=()=>{pointerDown=true;touch();};
    const up=()=>{pointerDown=false;touch();};
    window.addEventListener("pointerdown",down,true);
    window.addEventListener("pointerup",up,true);
    window.addEventListener("pointercancel",up,true);
    window.addEventListener("keydown",touch,true);
    window.addEventListener("input",touch,true);
    window.addEventListener("scroll",touch,true);
    const timer=setInterval(()=>{
      if(!pointerDown&&Date.now()-lastInteraction>=2500&&!updateIsBlocked())apply(true);
    },500);
    return()=>{
      clearInterval(timer);
      window.removeEventListener("pointerdown",down,true);
      window.removeEventListener("pointerup",up,true);
      window.removeEventListener("pointercancel",up,true);
      window.removeEventListener("keydown",touch,true);
      window.removeEventListener("input",touch,true);
      window.removeEventListener("scroll",touch,true);
    };
  },[ready,storageReady,apply]);
}
