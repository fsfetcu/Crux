import { useSyncExternalStore } from "react";

type UpdateState = { ready:boolean; checking:boolean; offlineReady:boolean; message:string };
let state:UpdateState={ready:false,checking:false,offlineReady:false,message:""};
const listeners=new Set<()=>void>();
const publish=(patch:Partial<UpdateState>)=>{state={...state,...patch};listeners.forEach((fn)=>fn());};
let registration:ServiceWorkerRegistration | undefined;
let started=false;
let lastCheck=0;
export function observeAppUpdates(reg:ServiceWorkerRegistration) {
  registration=reg;
  const watch=(worker:ServiceWorker|null)=>{
    if(!worker)return;
    const wasControlled=!!navigator.serviceWorker.controller;
    const inspect=()=>{
      if(worker.state==="activated")publish({offlineReady:true,ready:wasControlled});
    };
    worker.addEventListener("statechange",inspect);
  };
  reg.addEventListener("updatefound",()=>watch(reg.installing));
  watch(reg.installing);
  if(reg.waiting)publish({ready:true});
  if(reg.active)publish({offlineReady:true});
}
export async function checkForAppUpdate() {
  if(!navigator.onLine){publish({message:"Connect to the internet to check for updates."});return;}
  if(!registration){publish({message:"Updates are checked when the app opens online."});return;}
  publish({checking:true,message:""});
  try {await registration.update();publish({message:"Update check complete. New versions appear here when downloaded."});}
  catch {publish({message:"Couldn’t check for updates. Try again when connected."});}
  finally {publish({checking:false});}
}
export function startAppUpdates() {
  if(started || !("serviceWorker" in navigator) || !import.meta.env.PROD)return;
  started=true;
  let hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    publish({offlineReady:true,ready:hadController});hadController=true;
  });
  const register=()=>void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL,updateViaCache:"none"}).then((reg)=>{observeAppUpdates(reg);return navigator.serviceWorker.ready;}).then(()=>publish({offlineReady:true})).catch(()=>{});
  if(document.readyState==="complete")register();else window.addEventListener("load",register,{once:true});
  const check=()=>{if(registration&&document.visibilityState==="visible"&&navigator.onLine&&Date.now()-lastCheck>60000){lastCheck=Date.now();void checkForAppUpdate();}};
  document.addEventListener("visibilitychange",check);
  window.addEventListener("online",check);
  window.addEventListener("pageshow",check);
}
export function useAppUpdates(){return useSyncExternalStore((fn)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>state);}
export function refreshApp(){window.location.reload();}
