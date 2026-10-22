import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Search, X } from "lucide-react";
import { Modal } from "./Modal";
import { WeightInput } from "./TrainingFields";
import { composeStrengthWorkout, copyCatalogueExercise } from "./catalogue";
import type { CatalogueItem } from "./catalogue";
import { intensityLabels, loadLabels, trainingTags } from "./model";
import type { Exercise, Intensity } from "./model";

export function WorkoutBuilder({items,onClose,onSave}:{items:CatalogueItem[];onClose:()=>void;onSave:(item:CatalogueItem,addToPlan:boolean)=>void}) {
  const [search,setSearch]=useState("");
  const [name,setName]=useState("");
  const [location,setLocation]=useState("Gym");
  const [selected,setSelected]=useState<{catalogueId:string;exercise:Exercise}[]>([]);
  const [error,setError]=useState("");
  const available=items.filter((i)=>i.kind==="exercise" && `${i.name} ${i.description} ${i.focus}`.toLowerCase().includes(search.trim().toLowerCase()));
  const update=(id:string,patch:Partial<Exercise>)=>setSelected((rows)=>rows.map((r)=>r.exercise.id===id ? {...r,exercise:{...r.exercise,...patch}} : r));
  const move=(index:number,by:number)=>setSelected((rows)=>{const next=[...rows];[next[index],next[index+by]]=[next[index+by],next[index]];return next;});
  const save=(addToPlan:boolean)=>{try{const item=composeStrengthWorkout(name,location,selected.map((r)=>r.exercise));onSave(item,addToPlan);}catch(e){setError(e instanceof Error?e.message:"Check your workout details.");}};
  return <Modal title="Build a strength workout" onClose={onClose} wide>
    <form className="form-stack workout-builder" onSubmit={(e)=>{e.preventDefault();save(true);}}>
      <p className="muted small">Choose catalogue exercises, then set their details for this workout. Your individual catalogue exercises keep their original defaults.</p>
      <div className="form-grid"><label>Workout name<input required maxLength={120} placeholder="e.g. Pull & push strength" value={name} onChange={(e)=>setName(e.target.value)}/></label><label>Location<input maxLength={200} value={location} onChange={(e)=>setLocation(e.target.value)}/></label></div>
      <section className="builder-picker" aria-label="Choose catalogue exercises">
        <div className="builder-section-title"><h3>1. Choose exercises</h3><span>{selected.length} selected</span></div>
        <label className="catalogue-search"><Search size={17}/><input aria-label="Search exercises to build workout" placeholder="Search exercises…" value={search} onChange={(e)=>setSearch(e.target.value)}/></label>
        <div className="builder-options">{available.map((item)=>{
          const checked=selected.some((r)=>r.catalogueId===item.id),tags=trainingTags(item);
          return <label className={`builder-option ${checked?"selected":""}`} key={item.id}>
            <input type="checkbox" aria-label={`Include ${item.name}`} checked={checked} disabled={!checked&&selected.length>=200} onChange={(e)=>setSelected((rows)=>e.target.checked?[...rows,{catalogueId:item.id,exercise:copyCatalogueExercise(item)}]:rows.filter((r)=>r.catalogueId!==item.id))}/>
            <span><strong>{item.name}</strong><small>{intensityLabels[tags.intensity]}{tags.loading.length ? ` · ${tags.loading.map((l)=>loadLabels[l]).join(", ")}` : ""}</small></span>{checked ? <Check size={17}/> : <Plus size={17}/>}
          </label>;
        })}{!available.length&&<p className="muted small">No matching exercises. Create individual exercises in the catalogue to include them here.</p>}</div>
      </section>
      <section className="builder-prescriptions" aria-label="Workout exercise details">
        <div className="builder-section-title"><h3>2. Set your workout</h3><span>{selected.length} exercise{selected.length===1?"":"s"}</span></div>
        {!selected.length&&<p className="builder-empty muted">Select exercises above. Sets, reps, rest and optional kilograms appear here.</p>}
        {selected.map(({exercise:e},index)=><fieldset className="builder-exercise" key={e.id}>
          <legend>{index+1}. {e.name}</legend>
          <div className="builder-exercise-actions"><button type="button" className="icon-button" disabled={index===0} aria-label={`Move ${e.name} up`} onClick={()=>move(index,-1)}><ArrowUp size={16}/></button><button type="button" className="icon-button" disabled={index===selected.length-1} aria-label={`Move ${e.name} down`} onClick={()=>move(index,1)}><ArrowDown size={16}/></button><button type="button" className="icon-button" aria-label={`Remove ${e.name} from workout`} onClick={()=>setSelected((rows)=>rows.filter((r)=>r.exercise.id!==e.id))}><X size={16}/></button></div>
          <div className="builder-exercise-fields"><label>Sets<input required maxLength={200} aria-label={`${e.name} sets`} value={e.sets} onChange={(event)=>update(e.id,{sets:event.target.value})}/></label><label>Reps / time<input required maxLength={200} aria-label={`${e.name} reps`} value={e.reps} onChange={(event)=>update(e.id,{reps:event.target.value})}/></label><label>Rest<input required maxLength={200} aria-label={`${e.name} rest`} value={e.rest} onChange={(event)=>update(e.id,{rest:event.target.value})}/></label><WeightInput name={e.name} value={e.weightKg} onChange={(weightKg)=>update(e.id,{weightKg})}/></div>
          <label className="builder-effort">Exercise effort<select aria-label={`${e.name} effort`} value={e.intensity} onChange={(event)=>update(e.id,{intensity:event.target.value as Intensity})}>{Object.entries(intensityLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        </fieldset>)}
        {selected.some((r)=>r.exercise.fingerLoad||r.exercise.loading?.includes("fingers"))&&<p className="small muted">Includes fingers / grip loading. Exercise effort and loading tags carry into recovery recommendations.</p>}
      </section>
      {error&&<p className="warning" role="alert">{error}</p>}
      <div className="modal-actions builder-save-actions"><button type="button" className="button secondary" onClick={(e)=>{if(e.currentTarget.form?.reportValidity()) save(false);}} disabled={!selected.length}>Save to catalogue</button><button className="button" disabled={!selected.length}><Plus size={16}/>Save & add to plan</button></div>
    </form>
  </Modal>;
}
