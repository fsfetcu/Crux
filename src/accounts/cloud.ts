import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProfileBackup } from "../profiles";
import type { ProfileData } from "../profiles";

export interface RemotePlanner {
  data: ProfileData;
  revision: number;
  updatedAt: string;
}
export interface PlannerCloud {
  read: (userId: string, signal: AbortSignal) => Promise<RemotePlanner | null>;
  save: (
    userId: string,
    expectedRevision: number,
    data: ProfileData,
    signal: AbortSignal,
  ) => Promise<RemotePlanner>;
}
export class PlannerConflict extends Error {}
export class PlannerAccessDenied extends Error {
  constructor() {
    super("This Google account does not have access to Crux. Sign in again with a verified Google account. If this continues, contact the app owner. Your device backup has been kept.");
  }
}
export function parseRemote(row: Record<string, unknown>): RemotePlanner {
  const revision = Number(row.revision);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof row.updated_at !== "string"
  )
    throw Error(
      "The online planner could not be read. Your device copy is unchanged.",
    );
  return {
    data: parseProfileBackup(JSON.stringify(row.data)),
    revision,
    updatedAt: row.updated_at,
  };
}
export function plannerCloud(client: SupabaseClient, restricted = false): PlannerCloud {
  return {
    async read(userId, signal) {
      const { data, error } = restricted ? await client
        .rpc("load_planner", { p_user_id: userId })
        .abortSignal(signal)
        .maybeSingle() : await client
        .from("user_planners")
        .select("data,revision,updated_at")
        .eq("user_id", userId)
        .abortSignal(signal)
        .maybeSingle();
      if (error?.code === "PT403") throw new PlannerAccessDenied();
      if (error) throw error;
      return data ? parseRemote(data as Record<string, unknown>) : null;
    },
    async save(userId, expectedRevision, data, signal) {
      const result = await client
        .rpc("save_planner", {
          p_user_id: userId,
          p_expected_revision: expectedRevision,
          p_data: data,
        })
        .abortSignal(signal)
        .single();
      if (result.error?.code === "PT409")
        throw new PlannerConflict(result.error.message);
      if (result.error?.code === "PT403") throw new PlannerAccessDenied();
      if (result.error) throw result.error;
      return parseRemote(result.data as Record<string, unknown>);
    },
  };
}
