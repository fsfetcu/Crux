import type { GradeCount, GradeSystem, Workout } from "./model";
export const gradeSystemLabels: Record<GradeSystem, string> = { font: "Font", v: "V scale", custom: "Custom" };
export const gradeSuggestions: Record<GradeSystem, string[]> = {
  font: ["3", "4", "4+", "5", "5+", ...[6, 7, 8, 9].flatMap((n) => ["A", "A+", "B", "B+", "C", "C+"].map((letter) => `${n}${letter}`))],
  v: ["VB", ...Array.from({length: 18}, (_, n) => `V${n}`)], custom: [],
};
export function normalizeGradeCounts(rows: GradeCount[]): GradeCount[] {
  const totals = new Map<string, GradeCount>();
  for (const row of rows) {
    const grade = row.system === "custom" ? row.grade.trim() : row.grade.trim().toUpperCase().replace(/\s+/g, "");
    if (!grade || grade.length > 40 || !Number.isInteger(row.count) || row.count < 1 || row.count > 10000) throw Error("Give every grade a name and a whole completion count from 1 to 10,000.");
    const key = `${row.system}:${grade.toUpperCase()}`;
    const old = totals.get(key);
    totals.set(key, { ...row, grade: old?.grade ?? grade, count: (old?.count ?? 0) + row.count });
  }
  if ([...totals.values()].some((g) => g.count > 10000)) throw Error("A grade can have at most 10,000 completions in a session.");
  return [...totals.values()];
}
export function gradeTotals(logs: Workout[]): GradeCount[] {
  const totals = new Map<string, GradeCount>();
  for (const log of logs) for (const row of log.gradeCounts ?? []) {
    const grade = row.system === "custom" ? row.grade.trim() : row.grade.trim().toUpperCase().replace(/\s+/g, "");
    const key = `${row.system}:${grade.toUpperCase()}`;
    totals.set(key, { ...row, grade, count: (totals.get(key)?.count ?? 0) + row.count });
  }
  return [...totals.values()].sort((a, b) => a.system.localeCompare(b.system) || a.grade.localeCompare(b.grade, "en", {numeric:true}));
}
