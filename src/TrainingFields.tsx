import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import type { GradeCount, GradeSystem, Workout } from "./model";
import { gradeSuggestions, gradeSystemLabels, gradeTotals } from "./grades";

export function WeightInput({ name, value, onChange, label }: { name: string; value?: number; onChange: (value: number | undefined) => void; label?: string }) {
  return <label className="weight-field">{label ?? "Load (kg)"}<input aria-label={`${name} kilograms${label === "Kg for this day" ? " for this day" : ""}`} type="number" min="0" max="2000" step="any" inputMode="decimal" placeholder="Optional" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.valueAsNumber)} /></label>;
}
export function GradeCountFields({ rows, onChange }: { rows: GradeCount[]; onChange: (rows: GradeCount[]) => void }) {
  const id = useId();
  const change = (index: number, update: Partial<GradeCount>) => onChange(rows.map((g, i) => i === index ? {...g,...update} : g));
  return <section className="grade-log form-stack" aria-label="Boulders completed">
    <div><h3>Boulders completed <span className="subtle">optional</span></h3><p className="small muted">Count completions at each grade, including any projects sent. Repeats count again; attempts belong in Projects below. Grades aren’t converted between systems.</p></div>
    {rows.map((g, i) => <div className="grade-count-row" key={i}>
      <label>System<select aria-label={`Grade ${i + 1} system`} value={g.system} onChange={(event) => change(i,{system:event.target.value as GradeSystem,grade:""})}>{Object.entries(gradeSystemLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Grade<input aria-label={`Grade ${i + 1}`} required maxLength={40} placeholder={g.system === "v" ? "V4" : "6A"} list={`${id}-${i}`} value={g.grade} onChange={(event) => change(i,{grade:event.target.value})}/><datalist id={`${id}-${i}`}>{gradeSuggestions[g.system].map((grade) => <option key={grade} value={grade}/>)}</datalist></label>
      <label>Completed<input aria-label={`Grade ${i + 1} count`} required type="number" min="1" max="10000" step="1" inputMode="numeric" value={Number.isNaN(g.count) ? "" : g.count} onChange={(event) => change(i,{count:event.target.valueAsNumber})}/></label>
      <button type="button" className="icon-button" aria-label={`Remove grade ${i + 1}`} onClick={() => onChange(rows.filter((_,index) => index !== i))}><X size={16}/></button>
    </div>)}
    <button type="button" className="text-button align-start" disabled={rows.length >= 200} onClick={() => onChange([...rows,{system:rows.at(-1)?.system ?? "font",grade:"",count:1}])}><Plus size={15}/>Add grade count</button>
  </section>;
}
export function GradeStatistics({ logs }: { logs: Workout[] }) {
  const [period, setPeriod] = useState("all");
  const cutoff = Date.now() - Number(period) * 86400000;
  const included = logs.filter((l) => period === "all" || Date.parse(l.timestamp) >= cutoff);
  const totals = gradeTotals(included);
  const total = totals.reduce((sum,g) => sum + g.count,0);
  const sessions = included.filter((l) => l.gradeCounts?.length).length;
  return <section className="panel grade-statistics">
    <div className="section-header"><div><div className="eyebrow">BOULDERING VOLUME</div><h2>Grades you’ve climbed</h2><p className="small muted">{total} completions · {sessions} session{sessions === 1 ? "" : "s"} with grade counts</p></div><label><span className="sr-only">Grade statistics period</span><select aria-label="Grade statistics period" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label></div>
    {totals.length ? <div className="grade-tables">{Object.entries(gradeSystemLabels).map(([system,label]) => {
      const rows = totals.filter((g) => g.system === system);
      const max = Math.max(...rows.map((g) => g.count));
      return rows.length ? <table key={system}><caption>{label}</caption><thead><tr><th scope="col">Grade</th><th scope="col">Completed</th></tr></thead><tbody>{rows.map((g) => <tr key={g.grade}><th scope="row">{g.grade}</th><td><div className="grade-stat-value"><span className="grade-stat-track" aria-hidden="true"><span style={{width:`${g.count / max * 100}%`}}/></span><strong>{g.count}</strong></div></td></tr>)}</tbody></table> : null;
    })}</div> : <p className="padded-copy muted">Add grade counts when logging a session to build your grade distribution here. Past sessions without counts aren’t estimated from projects or RPE.</p>}
    <p className="small muted padded-copy">Current training plan only. Counts include repeats; Font, V and custom grades stay separate.</p>
  </section>;
}
