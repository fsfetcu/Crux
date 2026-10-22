import {
  firstProfile,
  loadProfiles,
  originalProfileBackup,
  parseProfileBackup,
  PROFILE_KEY,
} from "../profiles";
import type { ProfileData } from "../profiles";
import { initialState } from "../model";
import { PlannerAccessDenied, PlannerConflict } from "./cloud";
import type { PlannerCloud, RemotePlanner } from "./cloud";

export const accountStorageKey = (userId: string) =>
  `crux-account:${encodeURIComponent(userId)}`;
type CachedPlanner = {
  version: 1;
  userId: string;
  data: ProfileData;
  revision: number;
  dirty: boolean;
};
export type SyncStatus =
  | "device"
  | "loading"
  | "syncing"
  | "saved"
  | "pending"
  | "conflict"
  | "error";
export interface WorkspaceSnapshot {
  data: ProfileData;
  error: string;
  ready: boolean;
  status: SyncStatus;
  message: string;
  conflict: RemotePlanner | null;
}
const readCache = (raw: string, userId: string): CachedPlanner => {
  const cache = JSON.parse(raw);
  if (
    cache.version !== 1 ||
    cache.userId !== userId ||
    !Number.isSafeInteger(cache.revision) ||
    cache.revision < 0 ||
    typeof cache.dirty !== "boolean"
  )
    throw Error("Invalid account cache");
  return { ...cache, data: parseProfileBackup(JSON.stringify(cache.data)) };
};

// One instance belongs to one signed-in user, and is discarded on account changes.
// Authentication tokens stay in Supabase Auth, outside exported training data.
export class WorkspaceStore {
  readonly key: string;
  private cache: CachedPlanner;
  private state: WorkspaceSnapshot;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private disposed = false;
  private running = false;
  private change = 0;
  private request: AbortController | null = null;

  constructor(
    readonly userId: string | null,
    private cloud: PlannerCloud | null,
    private storage: Storage = localStorage,
  ) {
    this.key = userId ? accountStorageKey(userId) : PROFILE_KEY;
    const fresh = firstProfile(initialState());
    this.cache = {
      version: 1,
      userId: userId ?? "",
      data: fresh,
      revision: 0,
      dirty: false,
    };
    this.state = {
      data: fresh,
      error: "",
      ready: !userId,
      status: userId ? "loading" : "device",
      message: "",
      conflict: null,
    };
    if (!userId) {
      const loaded = loadProfiles();
      this.cache.data = loaded.data;
      this.state = { ...this.state, data: loaded.data, error: loaded.error };
    } else {
      try {
        const raw = storage.getItem(this.key);
        if (raw) {
          this.cache = readCache(raw, userId);
          this.state = {
            ...this.state,
            data: this.cache.data,
            ready: true,
            status: this.cache.dirty ? "pending" : "saved",
          };
        }
      } catch {
        this.state = {
          ...this.state,
          ready: true,
          status: "error",
          error:
            "Your account's device copy could not be read. Export its recovery file or load the online copy before making changes.",
        };
      }
    }
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(next: Partial<WorkspaceSnapshot>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }
  raw = () =>
    this.userId
      ? (this.storage.getItem(this.key) ?? "")
      : originalProfileBackup();
  private write(cache: CachedPlanner) {
    this.storage.setItem(
      this.key,
      this.userId ? JSON.stringify(cache) : JSON.stringify(cache.data),
    );
    this.cache = cache;
  }
  persist = (data: ProfileData, recover = false) => {
    if (this.disposed || !this.state.ready || (this.state.error && !recover))
      return false;
    try {
      const valid = parseProfileBackup(JSON.stringify(data));
      this.write({ ...this.cache, data: valid, dirty: !!this.userId });
      this.change += 1;
      this.emit({
        data: valid,
        error: "",
        status: this.state.conflict
          ? "conflict"
          : this.userId
            ? "pending"
            : "device",
        message: "",
      });
      if (this.userId && !this.state.conflict) void this.synchronize();
      return true;
    } catch {
      this.emit({
        message:
          "Could not save on this device. Export a backup; storage may be full or disabled.",
      });
      return false;
    }
  };
  start() {
    this.disposed = false;
    if (!this.userId) {
      if (!this.state.error) this.persist(this.cache.data);
    } else void this.synchronize();
  }
  dispose() {
    this.disposed = true;
    this.epoch += 1;
    this.request?.abort();
    this.running = false;
  }
  // Guest tabs retain their original local-only behavior. Account tabs synchronize
  // through database revisions instead of adopting another tab's unconfirmed data.
  onStorage = (event: StorageEvent) => {
    if (event.key !== this.key || !event.newValue) return;
    if (this.userId) {
      void this.synchronize();
      return;
    }
    try {
      const data = parseProfileBackup(event.newValue);
      this.cache.data = data;
      this.emit({ data, error: "" });
    } catch {
      this.emit({
        error:
          "A change in another tab could not be read. Your saved data has been kept.",
      });
    }
  };
  synchronize = async () => {
    if (
      !this.userId ||
      !this.cloud ||
      this.running ||
      this.disposed ||
      this.state.conflict
    )
      return;
    const epoch = this.epoch;
    const request = new AbortController();
    this.request = request;
    this.running = true;
    const active = () => !this.disposed && this.epoch === epoch;
    const deadline = setTimeout(() => request.abort(), 20000);
    this.emit({
      status: this.state.ready ? "syncing" : "loading",
      message: "",
    });
    try {
      const remote = await this.cloud.read(this.userId, request.signal);
      if (!active()) return;
      if (this.state.error) {
        if (!remote)
          throw Error(
            "No online copy is available. Export the recovery file before restoring a backup.",
          );
        this.storage.setItem(`${this.key}:unreadable`, this.raw());
        this.write({
          ...this.cache,
          data: remote.data,
          revision: remote.revision,
          dirty: false,
        });
        this.emit({
          data: remote.data,
          error: "",
          ready: true,
          status: "saved",
        });
        return;
      }
      if (!this.cache.dirty && remote) {
        this.write({
          ...this.cache,
          data: remote.data,
          revision: remote.revision,
          dirty: false,
        });
        this.emit({
          data: remote.data,
          ready: true,
          status: "saved",
          message: "",
        });
        return;
      }
      if (
        remote &&
        this.cache.dirty &&
        remote.revision !== this.cache.revision
      ) {
        // Persist the local candidate as well as retaining the server copy.
        this.write(this.cache);
        this.emit({ ready: true, status: "conflict", conflict: remote });
        return;
      }
      if (!remote && this.cache.revision > 0)
        throw Error(
          "The online planner is unavailable. Your device copy is kept; retry before uploading.",
        );
      const sentChange = this.change;
      const sentData = this.cache.data;
      const saved = await this.cloud.save(
        this.userId,
        this.cache.revision,
        sentData,
        request.signal,
      );
      if (!active()) return;
      const changedWhileSaving = this.change !== sentChange;
      this.write({
        ...this.cache,
        revision: saved.revision,
        dirty: changedWhileSaving,
      });
      this.emit({
        ready: true,
        status: changedWhileSaving ? "pending" : "saved",
        message: "",
      });
    } catch (error) {
      if (!active()) return;
      if (error instanceof PlannerAccessDenied) {
        this.emit({ ready: false, status: "error", message: error.message });
      } else if (error instanceof PlannerConflict) {
        let denied = false;
        const remote = await this.cloud
          .read(this.userId, request.signal)
          .catch((failure: unknown) => {
            if (failure instanceof PlannerAccessDenied) {
              denied = true;
              this.emit({ ready: false, status: "error", message: failure.message });
            }
            return null;
          });
        if (!active()) return;
        if (denied) return;
        if (remote) {
          this.write(this.cache);
          this.emit({ ready: true, status: "conflict", conflict: remote });
        } else
          this.emit({
            status: "error",
            message:
              "Another device saved changes. Retry to review both copies.",
          });
      } else {
        this.emit({
          status: this.state.ready ? "pending" : "error",
          message: this.state.ready
            ? "Saved on this device. Online saving will retry when connected."
            : "Could not load your online planner. Check your connection and try again.",
        });
      }
    } finally {
      clearTimeout(deadline);
      if (active()) {
        this.running = false;
        this.request = null;
        if (
          this.cache.dirty &&
          this.state.status === "pending" &&
          !this.state.message
        )
          void this.synchronize();
      }
    }
  };
  resolveConflict = (choice: "online" | "device") => {
    const remote = this.state.conflict;
    if (!remote) return false;
    try {
      // The recovery copy permits undoing either explicit choice via JSON import.
      this.storage.setItem(
        `${this.key}:before-conflict`,
        JSON.stringify(this.cache.data),
      );
      const data = choice === "online" ? remote.data : this.cache.data;
      this.write({
        ...this.cache,
        data,
        revision: remote.revision,
        dirty: choice === "device",
      });
      this.change += 1;
      this.emit({
        data,
        conflict: null,
        status: choice === "device" ? "pending" : "saved",
        message: "",
      });
      if (choice === "device") void this.synchronize();
      return true;
    } catch {
      this.emit({
        message:
          "Could not save the recovery copy. Export your data before resolving this change.",
      });
      return false;
    }
  };
}
