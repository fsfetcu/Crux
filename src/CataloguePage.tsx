import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BookOpen, Check, Dumbbell, Mountain, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useProfiles } from "./ProfileContext";
import { Modal } from "./Modal";
import { WorkoutBuilder } from "./WorkoutBuilder";
import { catalogueFocus, addCatalogueToPlan, templateInPlan, removeTemplateFromPlan, parseCatalogue } from "./catalogue";
import type { CatalogueItem, CatalogueFocus } from "./catalogue";
import { intensityLabels, labelsFor, loadLabels, trainingTags, uid, workoutTypes } from "./model";
import type { SessionTemplate } from "./model";

export function CataloguePage({ renderEditor, onViewPlan }: { renderEditor: (template: SessionTemplate, save: (t: SessionTemplate) => void) => ReactNode; onViewPlan: () => void }) {
  const profiles = useProfiles();
  const items = profiles.data.catalogue ?? [];
  const [search,setSearch] = useState("");
  const [focus,setFocus] = useState("all");
  const [kind,setKind] = useState("all");
  const [building,setBuilding] = useState(false);
  const [editing,setEditing] = useState<CatalogueItem | null>(null);
  const [adding,setAdding] = useState<CatalogueItem | null>(null);
  const [removing,setRemoving] = useState<CatalogueItem | null>(null);
  const [deleting,setDeleting] = useState<CatalogueItem | null>(null);
  const [editorFocus,setEditorFocus] = useState<CatalogueFocus>("Other");
  const [editorError,setEditorError] = useState("");
  const [editorKind,setEditorKind] = useState<CatalogueItem["kind"]>("workout");
  const openEdit = (item: CatalogueItem) => { setEditorError(""); setEditing(item); setEditorFocus(item.focus); setEditorKind(item.kind); };
  const create = (kind: CatalogueItem["kind"]) => openEdit({id:uid(),name:"",category:"strength",location:"",description:"",exercises:kind === "exercise" ? [{id:uid(),name:"",sets:"3",reps:"10",rest:"90 s",fingerLoad:false}] : [],intensity:"moderate",loading:[],focus:"Other",kind});
  const shown = items.filter((item) => (focus === "all" || item.focus === focus) && (kind === "all" || item.kind === kind) && `${item.name} ${item.description} ${item.exercises.map((e) => e.name).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="page-heading"><div><div className="eyebrow">BUILD YOUR OWN WAY</div><h1>Your training catalogue<span className="accent">.</span></h1><p>A personal collection to reuse across your training plans.</p></div><div className="catalogue-create-actions"><button className="button" onClick={() => setBuilding(true)}><Dumbbell size={16}/>Build strength workout</button><button className="button secondary" onClick={() => create("workout")}><Plus size={16}/>New workout</button><button className="button secondary" onClick={() => create("exercise")}><Plus size={16}/>New exercise</button></div></div>
    <div className="catalogue-plan-banner"><BookOpen size={22}/><div><strong>Choose here. Train in your plan.</strong><p>Adding an item makes an independent copy. Its intensity and loading tags guide recovery recommendations in that plan.</p></div><button className="text-button" onClick={onViewPlan}>View training plan<ArrowRight size={16}/></button></div>
    <div className="catalogue-filters"><label className="catalogue-search"><Search size={17}/><input aria-label="Search catalogue" placeholder="Search workouts, exercises…" value={search} onChange={(e) => setSearch(e.target.value)}/></label><label><span className="sr-only">Catalogue focus</span><select aria-label="Catalogue focus" value={focus} onChange={(e) => setFocus(e.target.value)}><option value="all">All training goals</option>{catalogueFocus.map((f) => <option key={f}>{f}</option>)}</select></label><label><span className="sr-only">Catalogue item type</span><select aria-label="Catalogue item type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">Workouts & exercises</option><option value="workout">Workouts</option><option value="exercise">Exercises</option></select></label></div>
    <p className="small muted catalogue-count">{shown.length} item{shown.length === 1 ? "" : "s"} · Adding to {profiles.active.name}</p>
    <div className="catalogue-grid">{shown.map((item) => {
      const tags = trainingTags(item), inPlan = templateInPlan(item,profiles.active);
      return <article className="catalogue-card" key={item.id}>
        <div className="catalogue-card-meta"><span className="catalogue-focus">{item.focus}</span><span>{item.kind === "exercise" ? <Dumbbell size={16}/> : <Mountain size={16}/>} {item.kind}</span></div>
        <h2>{item.name}</h2><p className="catalogue-description">{item.description || `${item.exercises.length} exercise${item.exercises.length === 1 ? "" : "s"}. Customize the details to suit your training.`}</p>
        <div className="catalogue-tags"><span>{intensityLabels[tags.intensity]}</span>{item.targetRpe !== undefined && <span>Target RPE {item.targetRpe}</span>}{tags.loading.map((tag) => <span key={tag}>{loadLabels[tag]}</span>)}</div>
        {item.exercises.length > 0 && <details className="catalogue-exercise-preview"><summary>{item.exercises.length} exercise{item.exercises.length === 1 ? "" : "s"} · View details</summary><ul>{item.exercises.map((e) => <li key={e.id}><strong>{e.name}</strong><span>{e.sets} × {e.reps}{e.weightKg !== undefined ? ` · ${e.weightKg} kg` : ""} · {e.rest} rest</span></li>)}</ul></details>}
        <div className="catalogue-card-actions">{inPlan ? <button className="text-button catalogue-added" aria-label={`Manage ${item.name} in this plan`} onClick={() => setRemoving(item)}><Check size={16}/>In this plan · Manage</button> : <button className="button secondary" onClick={() => setAdding(item)}><Plus size={15}/>Add to training plan</button>}<button className="icon-button" aria-label={`Edit catalogue ${item.name}`} onClick={() => openEdit(item)}><Pencil size={16}/></button><button className="icon-button" aria-label={`Delete catalogue ${item.name}`} onClick={() => setDeleting(item)}><Trash2 size={16}/></button></div>
      </article>;
    })}</div>
    {!shown.length && <div className="panel empty-state"><BookOpen size={32}/><h2>No matching items</h2><p>Adjust the filters or create a workout or exercise of your own.</p><button className="button" onClick={() => create("workout")}>Create a workout</button></div>}
    {building&&<WorkoutBuilder items={items} onClose={()=>setBuilding(false)} onSave={(item,addToPlan)=>{try{const catalogue=parseCatalogue([...items,item]);if(profiles.persist({...profiles.data,catalogue})){setBuilding(false);setSearch(item.name);setFocus("all");setKind("all");if(addToPlan)setAdding(item);profiles.setNotice("Workout saved to your catalogue. Add it to a training plan, then drag the whole workout into a day.");}}catch(error){profiles.setNotice(error instanceof Error?error.message:"Could not save workout.");}}}/> }
    {editing && <Modal title={items.some((i) => i.id === editing.id) ? "Edit catalogue item" : "Create catalogue item"} onClose={() => setEditing(null)} wide><div className="form-stack catalogue-editor-metadata"><p className="small muted">Saved to your personal catalogue. Add it to a training plan when ready; existing plan copies and logs won’t change.</p><div className="form-grid"><label>Training focus<select value={editorFocus} onChange={(e) => setEditorFocus(e.target.value as CatalogueFocus)}>{catalogueFocus.map((f) => <option key={f}>{f}</option>)}</select></label><label>Item type<select value={editorKind} onChange={(e) => setEditorKind(e.target.value as CatalogueItem["kind"])}><option value="workout">Workout / routine</option><option value="exercise">Individual exercise</option></select></label></div>{editorError && <p className="warning" role="alert">{editorError}</p>}</div>{renderEditor(editing,(t) => {
      const item: CatalogueItem = {...editing,...t,focus:editorFocus,kind:editorKind};
      if (editorKind === "exercise" && item.exercises.length !== 1) {setEditorError("An individual exercise needs exactly one exercise row. Choose Workout / routine for several exercises.");return;}
      const next = items.some((i) => i.id === item.id) ? items.map((i) => i.id === item.id ? item : i) : [...items,item];
      try {parseCatalogue(next);} catch(e) {setEditorError(e instanceof Error ? e.message : "Check this item’s details.");return;}
      if (profiles.persist({...profiles.data,catalogue:next})) {setEditing(null);setSearch(item.name);setFocus("all");setKind("all");profiles.setNotice("Saved to your catalogue. Choose Add to training plan to use it.");}
    })}</Modal>}
    {adding && <AddToPlan item={adding} onClose={() => setAdding(null)}/>}
    {removing && <Modal title="Remove from this training plan?" onClose={() => setRemoving(null)}><p className="muted">Remove {removing.name} from {profiles.active.name}. This also removes {profiles.active.state.plans.filter((p) => p.templateId === templateInPlan(removing,profiles.active)?.id).length} scheduled sessions using this item. Completed history, grade counts, weights and the catalogue item are kept.</p><div className="modal-actions"><button className="button secondary" onClick={() => setRemoving(null)}>Cancel</button><button className="button" onClick={() => {const template = templateInPlan(removing,profiles.active);if (template && profiles.commit(removeTemplateFromPlan(profiles.active.state,template.id))) {setRemoving(null);profiles.setNotice("Removed from this plan. Still available in your catalogue.");}}}>Remove from plan</button></div></Modal>}
    {deleting && <Modal title="Delete catalogue item?" onClose={() => setDeleting(null)}><p className="muted">Remove {deleting.name} from the catalogue. Copies already in training plans, scheduled sessions and history are kept.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleting(null)}>Cancel</button><button className="button" onClick={() => {if(profiles.persist({...profiles.data,catalogue:items.filter((i) => i.id !== deleting.id)})) setDeleting(null);}}>Delete catalogue item</button></div></Modal>}
  </>;
}
function AddToPlan({item,onClose}:{item:CatalogueItem;onClose:()=>void}) {
  const profiles=useProfiles();
  const [profileId,setProfileId]=useState(profiles.active.id);
  const target=profiles.data.profiles.find((p)=>p.id===profileId)!;
  const types=workoutTypes(target.state);
  const defaultCategory=(id:string)=>{const p=profiles.data.profiles.find((p)=>p.id===id)!;const types=workoutTypes(p.state);return types.find((t)=>t.id===item.category)?.id ?? types[0]?.id ?? "new";};
  const [category,setCategory]=useState(defaultCategory(profileId));
  const [typeName,setTypeName]=useState<string>(item.focus);
  const [targetCount,setTargetCount]=useState(1);
  const [selection,setSelection]=useState<string[] | undefined>(undefined);
  const [error,setError]=useState("");
  const exists=!!templateInPlan(item,target);
  return <Modal title={`Add ${item.name} to a plan`} onClose={onClose}><form className="form-stack" onSubmit={(e)=>{e.preventDefault();setError("");try{const next=addCatalogueToPlan(profiles.data,item,profileId,category,category==="new"?{name:typeName,target:targetCount}:undefined,selection);if(profiles.persist(next)){profiles.setNotice(`${item.name} added to ${target.name}. Schedule it from the training plan.`);onClose();}}catch(e){setError(e instanceof Error?e.message:"Could not add this item.");}}}>
    <p className="muted small">Add an independent copy, then drag its activities onto your calendar. The catalogue and other plans stay unchanged.</p>
    <label>Training plan<select value={profileId} onChange={(e)=>{setProfileId(e.target.value);setCategory(defaultCategory(e.target.value));setError("");}}>{profiles.data.profiles.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Workout type in this plan<select value={category} onChange={(e)=>setCategory(e.target.value)}>{types.map((t)=><option key={t.id} value={t.id}>{labelsFor(target.state)[t.id]}</option>)}<option value="new">+ Create a workout type</option></select></label>
    {category==="new"&&<div className="form-grid"><label>New workout type name<input required maxLength={120} value={typeName} onChange={(e)=>setTypeName(e.target.value)}/></label><label>Weekly target<input required type="number" min="0" max="14" step="1" value={Number.isNaN(targetCount) ? "" : targetCount} onChange={(e)=>setTargetCount(e.target.valueAsNumber)}/></label></div>}
    {item.exercises.length>1&&<fieldset className="catalogue-exercise-picker"><legend>Exercises to include</legend>{item.exercises.map((exercise)=><label className="checkbox-label" key={exercise.id}><input type="checkbox" checked={selection===undefined||selection.includes(exercise.id)} onChange={(e)=>{const selected=selection??item.exercises.map((x)=>x.id);setSelection(e.target.checked?[...selected,exercise.id]:selected.filter((id)=>id!==exercise.id));}}/>{exercise.name}</label>)}</fieldset>}
    {exists&&<p className="warning">This item is already in that training plan.</p>}{error&&<p className="warning" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" disabled={exists||selection?.length===0}><Plus size={16}/>Add to plan</button></div>
  </form></Modal>;
}
