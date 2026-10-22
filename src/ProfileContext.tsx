import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { Download, Plus, Users } from "lucide-react";
import { Modal } from "./Modal";
import { dayKey, ensureWeek, labelsFor } from "./model";
import type { State } from "./model";
import { download } from "./storage";
import {
  createProfile,
  parseProfileBackup,
  replaceProfileState,
} from "./profiles";
import type { ProfileData } from "./profiles";
import { useAccount } from "./accounts/AccountContext";
import { plannerCloud } from "./accounts/cloud";
import { WorkspaceStore } from "./accounts/workspace";
const ProfileContext = createContext<ReturnType<typeof useProfileStore> | null>(
  null,
);
export function useProfiles() {
  const value = useContext(ProfileContext);
  if (!value) throw Error("Missing profile store");
  return value;
}
export function useTypeLabels() {
  const value = useContext(ProfileContext);
  return value ? labelsFor(value.active.state) : labelsFor({} as State);
}
function useProfileStore() {
  const account = useAccount();
  const [workspace] = useState(
    () =>
      new WorkspaceStore(
        account.user?.id ?? null,
        account.user && account.client ? plannerCloud(account.client, account.googleEnabled) : null,
      ),
  );
  const snapshot = useSyncExternalStore(
    workspace.subscribe,
    workspace.snapshot,
  );
  const { data, error } = snapshot;
  const current = useRef(data);
  current.current = data;
  const [showProfiles, setShowProfiles] = useState(false);
  const [incoming, setIncoming] = useState<ProfileData | null>(null);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const persist = (next: ProfileData, recover = false) => {
    const saved = workspace.persist(next, recover);
    if (saved) current.current = workspace.snapshot().data;
    else
      setNotice(
        error ||
          workspace.snapshot().message ||
          "Could not save your change. Export a backup and try again.",
      );
    return saved;
  };
  useEffect(() => {
    workspace.start();
    const sync = () => {
      void workspace.synchronize();
    };
    window.addEventListener("storage", workspace.onStorage);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    const interval = account.user ? setInterval(sync, 30000) : null;
    return () => {
      workspace.dispose();
      window.removeEventListener("storage", workspace.onStorage);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      if (interval) clearInterval(interval);
    };
  }, [workspace]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const active = data.profiles.find((p) => p.id === data.activeProfileId)!;
  const commit = (next: State) =>
    persist(replaceProfileState(current.current, active.id, ensureWeek(next)));
  const switchProfile = (id: string) => {
    if (!current.current.profiles.some((p) => p.id === id)) return false;
    return persist({ ...current.current, activeProfileId: id });
  };
  const exportBackup = () =>
    download(
      error ? workspace.raw() : JSON.stringify(current.current, null, 2),
      `crux-all-profiles-${dayKey()}.json`,
    );
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 10000000) throw Error("Backup exceeds 10 MB.");
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error("Could not read file."));
        reader.readAsText(file);
      });
      setIncoming(parseProfileBackup(raw));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not read backup.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  return {
    data,
    active,
    error,
    storageReady: !error && snapshot.ready,
    ready: snapshot.ready,
    syncStatus: snapshot.status,
    syncMessage: snapshot.message,
    syncNow: workspace.synchronize,
    conflict: snapshot.conflict,
    resolveConflict: workspace.resolveConflict,
    exportRecovery: () =>
      download(workspace.raw(), `crux-recovery-${dayKey()}.json`),
    commit,
    switchProfile,
    exportBackup,
    requestImport: () => fileRef.current?.click(),
    setShowProfiles,
    showProfiles,
    incoming,
    setIncoming,
    persist,
    setNotice,
    notice,
    fileRef,
    importFile,
  };
}
export function ProfileProvider({ children }: { children: ReactNode }) {
  const store = useProfileStore();
  const account = useAccount();
  const [creationName, setCreationName] = useState("");
  const [copy, setCopy] = useState(false);
  const [creating, setCreating] = useState(false);
  const rename = useRef<HTMLInputElement>(null);
  return (
    <ProfileContext.Provider value={store}>
      {store.ready ? (
        children
      ) : (
        <div className="account-loading form-stack" role="status">
          <h1>Your training, on every device.</h1>
          <p>{store.syncMessage || "Loading your private planner…"}</p>
          <button className="button" onClick={() => void store.syncNow()}>
            Try again
          </button>
          <button
            className="text-button"
            onClick={() => void account.signOut()}
          >
            Sign out
          </button>
        </div>
      )}
      <input
        hidden
        ref={store.fileRef}
        type="file"
        accept="application/json,.json"
        aria-label="Import JSON backup"
        onChange={(e) => void store.importFile(e.target.files?.[0])}
      />
      {store.showProfiles && (
        <Modal
          title="Training profiles"
          onClose={() => {
            store.setShowProfiles(false);
            setCreating(false);
          }}
        >
          <p className="muted">
            Separate plans, workouts and history. Recovery considers recent
            training across all your profiles.
          </p>
          <div className="profile-list">
            {store.data.profiles.map((p) => (
              <button
                key={p.id}
                className={`profile-option ${p.id === store.active.id ? "selected" : ""}`}
                onClick={() => {
                  if (store.switchProfile(p.id)) {
                    store.setShowProfiles(false);
                    setCreating(false);
                  }
                }}
              >
                <Users size={19} />
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.state.logs.length} workout
                    {p.state.logs.length === 1 ? "" : "s"} ·{" "}
                    {p.state.settings.periodStart} →{" "}
                    {p.state.settings.periodEnd}
                  </small>
                </span>
                {p.id === store.active.id && (
                  <span className="eyebrow">ACTIVE</span>
                )}
              </button>
            ))}
          </div>
          <form
            className="profile-rename form-stack"
            key={store.active.id + store.active.name}
            onSubmit={(e) => {
              e.preventDefault();
              const name = rename.current!.value.trim();
              if (!name) return;
              if (
                store.persist({
                  ...store.data,
                  profiles: store.data.profiles.map((p) =>
                    p.id === store.active.id ? { ...p, name } : p,
                  ),
                })
              )
                store.setNotice("Profile renamed.");
            }}
          >
            <label>
              Current profile name
              <input
                ref={rename}
                defaultValue={store.active.name}
                required
                maxLength={120}
              />
            </label>
            <button className="button secondary align-start">
              Rename profile
            </button>
          </form>
          {!creating ? (
            <button className="button" onClick={() => setCreating(true)}>
              <Plus size={16} />
              New profile
            </button>
          ) : (
            <form
              className="form-stack new-profile"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  if (
                    store.persist(createProfile(store.data, creationName, copy))
                  ) {
                    setCreationName("");
                    setCopy(false);
                    setCreating(false);
                    store.setShowProfiles(false);
                    store.setNotice(
                      "Profile created. Add workout types and sessions in Settings & library.",
                    );
                  }
                } catch (e) {
                  store.setNotice(
                    e instanceof Error
                      ? e.message
                      : "Could not create profile.",
                  );
                }
              }}
            >
              <h3>A fresh training plan</h3>
              <label>
                New profile name
                <input
                  value={creationName}
                  onChange={(e) => setCreationName(e.target.value)}
                  required
                  maxLength={120}
                  placeholder="e.g. Winter strength"
                  autoFocus
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={copy}
                  onChange={(e) => setCopy(e.target.checked)}
                />
                Copy current workout library and goals
              </label>
              <p className="small muted">
                Start with your own workout types, or reuse this library.
                History and planned sessions stay in their original profile.
                Edit season dates in Settings.
              </p>
              <button className="button">
                Create profile
                <Plus size={16} />
              </button>
            </form>
          )}
        </Modal>
      )}
      {store.incoming && (
        <Modal
          title="Restore this backup?"
          onClose={() => store.setIncoming(null)}
        >
          <p className="muted">
            This backup contains {store.incoming.profiles.length} profile
            {store.incoming.profiles.length === 1 ? "" : "s"},{" "}
            {store.incoming.profiles.reduce(
              (n, p) => n + p.state.logs.length,
              0,
            )}{" "}
            workouts,{" "}
            {store.incoming.profiles.reduce(
              (n, p) => n + p.state.plans.length,
              0,
            )}{" "}
            planned sessions, and{" "}
            {store.incoming.profiles.reduce(
              (n, p) => n + Object.keys(p.state.weeks).length,
              0,
            )}{" "}
            saved weeks. Restoring replaces all profiles in the current planner.
          </p>
          <button className="text-button" onClick={store.exportBackup}>
            <Download size={15} />
            Back up current data first
          </button>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => store.setIncoming(null)}
            >
              Cancel
            </button>
            <button
              className="button"
              onClick={() => {
                if (store.persist(store.incoming!, true)) {
                  store.setIncoming(null);
                  store.setNotice("Backup restored.");
                }
              }}
            >
              Restore backup
            </button>
          </div>
        </Modal>
      )}
      {store.notice && (
        <div className="toast profile-toast" role="status">
          {store.notice}
        </div>
      )}
    </ProfileContext.Provider>
  );
}
