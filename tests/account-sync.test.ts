// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstProfile, PROFILE_KEY } from "../src/profiles";
import { initialState } from "../src/model";
import { PlannerConflict, parseRemote } from "../src/accounts/cloud";
import type { PlannerCloud, RemotePlanner } from "../src/accounts/cloud";
import { WorkspaceStore, accountStorageKey } from "../src/accounts/workspace";
const planner = (name = "My training") => {
  const data = firstProfile(initialState());
  data.profiles[0].name = name;
  return data;
};
const remote = (name = "Online training", revision = 1): RemotePlanner => ({
  data: planner(name),
  revision,
  updatedAt: new Date().toISOString(),
});
const cache = (
  userId: string,
  data = planner(),
  revision = 1,
  dirty = false,
) => {
  localStorage.setItem(
    accountStorageKey(userId),
    JSON.stringify({ version: 1, userId, data, revision, dirty }),
  );
};
const fakeCloud = (initial: RemotePlanner | null = null) => {
  let row = initial;
  const api: PlannerCloud = {
    read: vi.fn(async () => row),
    save: vi.fn(async (_id, expected, data) => {
      if (expected !== (row?.revision ?? 0)) throw new PlannerConflict();
      row = {
        data: structuredClone(data),
        revision: expected + 1,
        updatedAt: new Date().toISOString(),
      };
      return row;
    }),
  };
  return { api, row: () => row };
};
beforeEach(() => localStorage.clear());
describe("private account workspaces", () => {
  it("does not copy guest data or a previous account into a new account", async () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify(planner("Guest private plan")),
    );
    cache("A", planner("Account A private plan"));
    const cloud = fakeCloud();
    const store = new WorkspaceStore("B", cloud.api);
    expect(store.snapshot().ready).toBe(false);
    expect(store.snapshot().data.profiles[0].name).not.toContain(
      "private plan",
    );
    expect(store.persist(planner("Too early"))).toBe(false);
    await store.synchronize();
    expect(cloud.api.save).toHaveBeenCalledWith(
      "B",
      0,
      expect.anything(),
      expect.any(AbortSignal),
    );
    expect(localStorage.getItem(PROFILE_KEY)).toContain("Guest private plan");
    expect(localStorage.getItem(accountStorageKey("A"))).toContain(
      "Account A private plan",
    );
  });
  it("loads a saved online account on a fresh device without uploading blank defaults", async () => {
    const cloud = fakeCloud(remote());
    const store = new WorkspaceStore("A", cloud.api);
    await store.synchronize();
    expect(store.snapshot().data.profiles[0].name).toBe("Online training");
    expect(store.snapshot().ready).toBe(true);
    expect(cloud.api.save).not.toHaveBeenCalled();
  });
  it("blocks an uncached account when its online data cannot be loaded", async () => {
    const cloud = fakeCloud();
    vi.mocked(cloud.api.read).mockRejectedValue(Error("offline"));
    const store = new WorkspaceStore("A", cloud.api);
    await store.synchronize();
    expect(store.snapshot().ready).toBe(false);
    expect(store.persist(planner("Blank replacement"))).toBe(false);
    expect(cloud.api.save).not.toHaveBeenCalled();
  });
  it("retains offline edits after reopening and uploads them when connected", async () => {
    cache("A");
    const offline = fakeCloud(remote("Saved online"));
    vi.mocked(offline.api.read).mockRejectedValue(Error("offline"));
    const store = new WorkspaceStore("A", offline.api);
    expect(store.persist(planner("Offline edit"))).toBe(true);
    await vi.waitFor(() => expect(store.snapshot().status).toBe("pending"));
    store.dispose();
    const online = fakeCloud(remote("Saved online"));
    const reopened = new WorkspaceStore("A", online.api);
    expect(reopened.snapshot().data.profiles[0].name).toBe("Offline edit");
    await reopened.synchronize();
    expect(online.row()?.data.profiles[0].name).toBe("Offline edit");
    expect(reopened.snapshot().status).toBe("saved");
    expect(
      JSON.parse(localStorage.getItem(accountStorageKey("A"))!).dirty,
    ).toBe(false);
  });
  it("never silently replaces a newer device's work with an offline copy", async () => {
    cache("A", planner("Local edit"), 1, true);
    const cloud = fakeCloud(remote("Newer online edit", 2));
    const store = new WorkspaceStore("A", cloud.api);
    await store.synchronize();
    expect(store.snapshot().status).toBe("conflict");
    expect(store.snapshot().data.profiles[0].name).toBe("Local edit");
    expect(store.snapshot().conflict?.data.profiles[0].name).toBe(
      "Newer online edit",
    );
    expect(cloud.api.save).not.toHaveBeenCalled();
    expect(store.resolveConflict("online")).toBe(true);
    expect(store.snapshot().data.profiles[0].name).toBe("Newer online edit");
    expect(
      localStorage.getItem(`${accountStorageKey("A")}:before-conflict`),
    ).toContain("Local edit");
  });
  it("uploads the device copy only after an explicit conflict choice, using the new revision", async () => {
    cache("A", planner("Local edit"), 1, true);
    const cloud = fakeCloud(remote("Online edit", 3));
    const store = new WorkspaceStore("A", cloud.api);
    await store.synchronize();
    store.resolveConflict("device");
    await vi.waitFor(() => expect(store.snapshot().status).toBe("saved"));
    expect(cloud.api.save).toHaveBeenCalledWith(
      "A",
      3,
      expect.anything(),
      expect.any(AbortSignal),
    );
    expect(cloud.row()?.data.profiles[0].name).toBe("Local edit");
  });
  it("keeps edits made while an earlier save is in flight", async () => {
    cache("A");
    const cloud = fakeCloud(remote());
    const originalSave = cloud.api.save;
    let release!: () => void;
    vi.mocked(cloud.api.save).mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return originalSave(...args);
    });
    const store = new WorkspaceStore("A", cloud.api);
    store.persist(planner("First edit"));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    store.persist(planner("Second edit"));
    release();
    await vi.waitFor(() => expect(store.snapshot().status).toBe("saved"));
    expect(cloud.row()?.data.profiles[0].name).toBe("Second edit");
    expect(cloud.row()?.revision).toBe(3);
  });
  it("discards late reads after logout instead of writing into another user's cache", async () => {
    let release!: (row: RemotePlanner) => void;
    const api = fakeCloud().api;
    vi.mocked(api.read).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const store = new WorkspaceStore("A", api);
    const task = store.synchronize();
    store.dispose();
    release(remote("A private"));
    await task;
    expect(localStorage.getItem(accountStorageKey("A"))).toBeNull();
    expect(localStorage.getItem(accountStorageKey("B"))).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
  });
  it("leaves the current data intact when device storage fails", () => {
    cache("A");
    const store = new WorkspaceStore("A", fakeCloud().api);
    const before = store.snapshot().data;
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw Error("full");
      });
    expect(store.persist(planner("Unsaved change"))).toBe(false);
    expect(store.snapshot().data).toBe(before);
    spy.mockRestore();
  });
  it("preserves unreadable cache bytes before restoring a valid online copy", async () => {
    const raw = '{"broken account cache';
    localStorage.setItem(accountStorageKey("A"), raw);
    const store = new WorkspaceStore("A", fakeCloud(remote()).api);
    expect(store.snapshot().error).toBeTruthy();
    await store.synchronize();
    expect(store.snapshot().error).toBe("");
    expect(localStorage.getItem(`${accountStorageKey("A")}:unreadable`)).toBe(
      raw,
    );
  });
  it("rejects malformed remote records before they can replace a local document", () => {
    expect(() =>
      parseRemote({
        revision: 1,
        updated_at: new Date().toISOString(),
        data: { version: 2, profiles: [] },
      }),
    ).toThrow();
    expect(() =>
      parseRemote({ revision: -1, updated_at: "now", data: planner() }),
    ).toThrow();
  });
});
