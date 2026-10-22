import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Download, Plus, Users } from "lucide-react";
import { Modal } from "./Modal";
import { dayKey, ensureWeek, labelsFor } from "./model";
import type { State } from "./model";
import { download } from "./storage";
import {
  PROFILE_KEY,
  createProfile,
  loadProfiles,
  originalProfileBackup,
  parseProfileBackup,
  replaceProfileState,
  saveProfiles,
} from "./profiles";
import type { ProfileData } from "./profiles";
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
  const [loaded] = useState(loadProfiles);
  const [data, setData] = useState(loaded.data);
  const current = useRef(data);
  current.current = data;
  const [error, setError] = useState(loaded.error);
  const [showProfiles, setShowProfiles] = useState(false);
  const [incoming, setIncoming] = useState<ProfileData | null>(null);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const persist = (next: ProfileData, recover = false) => {
    if (error && !recover) {
      setNotice("Recover or import your saved data before making changes.");
      return false;
    }
    try {
      saveProfiles(next);
      current.current = next;
      setData(next);
      setError("");
      return true;
    } catch {
      setNotice(
        "Could not save on this device. Export a backup; storage may be full or disabled.",
      );
      return false;
    }
  };
  useEffect(() => {
    if (!loaded.error) {
      try {
        saveProfiles(current.current);
      } catch {
        setError(
          "Device storage is unavailable. Your existing data has been kept.",
        );
      }
    }
  }, []);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key !== PROFILE_KEY || !e.newValue) return;
      try {
        const next = parseProfileBackup(e.newValue);
        current.current = next;
        setData(next);
        setError("");
      } catch {
        setError(
          "A change in another tab could not be read. Your saved data has been kept.",
        );
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
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
      error
        ? originalProfileBackup()
        : JSON.stringify(current.current, null, 2),
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
    storageReady: !error,
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
  const [creationName, setCreationName] = useState("");
  const [copy, setCopy] = useState(false);
  const [creating, setCreating] = useState(false);
  const rename = useRef<HTMLInputElement>(null);
  return (
    <ProfileContext.Provider value={store}>
      {children}
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
            saved weeks. Restoring replaces all profiles in this browser.
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
