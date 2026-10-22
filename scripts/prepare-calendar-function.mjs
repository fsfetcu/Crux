// For Supabase's browser editor; CLI deployments use the original imports.
// Usage: node scripts/prepare-calendar-function.mjs /absolute/scratch/index.ts
import { readFileSync, writeFileSync } from "node:fs";
const destination = process.argv[2];
if (!destination) throw Error("Supply an output path for the dashboard source.");
const shared = readFileSync(new URL("../supabase/functions/_shared/calendar.ts", import.meta.url), "utf8");
const entry = readFileSync(new URL("../supabase/functions/calendar-feed/index.ts", import.meta.url), "utf8")
  .replace('import { handleCalendarFeed } from "../_shared/calendar.ts";\n', "");
writeFileSync(destination, shared + "\n" + entry);
console.log(`Prepared calendar function at ${destination}`);
