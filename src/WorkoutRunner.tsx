import { useEffect,useState } from "react";
import { Check,Clock3,Pause,Play,RotateCcw } from "lucide-react";
import { Modal } from "./Modal";
import { WeightInput } from "./TrainingFields";
import { restSeconds,targetSets } from "./workoutDraft";
import type { WorkoutDraft } from "./workoutDraft";

export function WorkoutRunner({draft,onChange,onClose,onFinish,onDiscard}:{draft:WorkoutDraft;onChange:(d:WorkoutDraft)=>void;onClose:()=>void;onFinish:()=>void;onDiscard:()=>void}) {
  const [now,setNow]=useState(Date.now());
  const [rest,setRest]=useState(90);
  const [discarding,setDiscarding]=useState(false);
  useEffect(()=>{const tick=()=>setNow(Date.now());const t=setInterval(tick,500);document.addEventListener("visibilitychange",tick);return()=>{clearInterval(t);document.removeEventListener("visibilitychange",tick);};},[]);
  const remaining=draft.restEndsAt===null?null:Math.max(0,Math.ceil((draft.restEndsAt-Date.now())/1000));
  const done=Object.values(draft.completed).reduce((sum,s)=>sum+s.length,0),total=draft.exercises.reduce((sum,e)=>sum+targetSets(e),0);
  return <Modal title={draft.template.name} onClose={onClose} wide><div className="workout-runner">
    <div className="runner-summary"><span className="eyebrow">WORKOUT IN PROGRESS</span><strong>{Math.max(0,Math.floor((now-Date.parse(draft.started))/60000))} min</strong><p>{total?`${done} of ${total} sets completed` : "Train at your own pace."} · Draft saved on this phone</p></div>
    <section className="runner-timer" aria-label="Rest timer"><Clock3 size={20}/><div><span>Rest timer</span><strong role="timer">{remaining===null?"Ready":remaining===0?"Rest complete":`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}`}</strong></div><label><span className="sr-only">Rest seconds</span><input aria-label="Rest seconds" type="number" min="0" max="3600" value={rest} onChange={(e)=>setRest(Math.max(0,Math.min(3600,Number(e.target.value))))}/><small>seconds</small></label><button className="icon-button" aria-label={remaining!==null&&remaining>0?"Stop rest timer":"Start rest timer"} onClick={()=>onChange({...draft,restEndsAt:remaining!==null&&remaining>0?null:Date.now()+rest*1000})}>{remaining!==null&&remaining>0?<Pause size={20}/>:<Play size={20}/>}</button></section>
    {draft.exercises.map((e)=><article className="runner-exercise" key={e.id}><div className="runner-exercise-heading"><h3>{e.name}</h3><span>{e.reps} reps / time · {e.rest} rest</span></div><WeightInput name={e.name} value={e.weightKg} onChange={(weightKg)=>onChange({...draft,exercises:draft.exercises.map((x)=>x.id===e.id?{...x,weightKg}:x)})}/><div className="runner-sets">{Array.from({length:targetSets(e)},(_,index)=>{const checked=draft.completed[e.id]?.includes(index)??false;return <button key={index} className={checked?"set-toggle done":"set-toggle"} aria-label={`${e.name} set ${index+1}`} aria-pressed={checked} onClick={()=>{const sets=draft.completed[e.id]??[],seconds=restSeconds(e.rest);setRest(seconds);onChange({...draft,completed:{...draft.completed,[e.id]:checked?sets.filter((n)=>n!==index):[...sets,index]},restEndsAt:checked?draft.restEndsAt:Date.now()+seconds*1000});}}>{checked?<Check size={19}/>:index+1}<span>Set {index+1}</span></button>;})}</div></article>)}
    <p className="small muted">Weights and checked sets stay in this draft. Finish and save to update your training history and recovery.</p>
    {discarding?<div className="warning" role="alert"><p>Discard the unfinished sets and weights in this draft? Your training history, plan and library stay unchanged.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setDiscarding(false)}>Keep draft</button><button className="button" onClick={onDiscard}>Discard draft</button></div></div>:<button className="text-button align-start" onClick={()=>setDiscarding(true)}>Discard unfinished workout</button>}
    <div className="modal-actions runner-actions"><button className="button secondary" onClick={onClose}><RotateCcw size={16}/>Continue later</button><button className="button" disabled={total>0&&done===0} onClick={onFinish}><Check size={17}/>Finish & log</button></div>
  </div></Modal>;
}
