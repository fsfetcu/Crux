import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
const source = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
).replaceAll("__CRUX_BUILD__", "test-build");
const origin = "http://127.0.0.1:4173";
function harness(failAsset = false, login = false, base = "/", mismatchedVersion = false) {
  const html = `<html><meta name="crux-build" content="${mismatchedVersion ? "old-build" : "test-build"}"><div id="root"></div><script src="${base}assets/app-test.js"></script><link href="${base}assets/app-test.css"></html>`;
  const prefix = `crux-shell-${encodeURIComponent(base)}-`;
  const cacheName = `${prefix}test-build`;
  const oldCacheName = `${prefix}old`;
  const stores = new Map<string, Map<string, Response>>();
  const listeners: Record<string, (e: any) => void> = {};
  const requestOrigins = new Map<string, string>();
  const requestOrigin = (r: any) =>
    typeof r === "string" ? "" : (r.headers?.get("Origin") ?? "");
  let offline = false;
  const fetch = vi.fn(async (input: any) => {
    const path = typeof input === "string" ? input : input.url;
    if (offline || (failAsset && path.endsWith(".css")))
      throw new TypeError("Network unavailable");
    return new Response(
      path === base
        ? login
          ? "<html>Sign in to continue</html>"
          : html
        : "asset",
      {
        status: 200,
        headers: path.startsWith(base + "assets/") ? { Vary: "Origin" } : {},
      },
    );
  });
  const key = (r: any) => (typeof r === "string" ? r : new URL(r.url).pathname);
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name)!;
      return {
        put: async (request: any, response: Response) => {
          data.set(key(request), response.clone());
          requestOrigins.set(name + key(request), requestOrigin(request));
        },
        match: async (request: any, options?: { ignoreVary?: boolean }) => {
          const response = data.get(key(request));
          if (
            !options?.ignoreVary &&
            response?.headers.get("Vary")?.includes("Origin") &&
            (requestOrigins.get(name + key(request)) ?? "") !==
              requestOrigin(request)
          )
            return undefined;
          return response?.clone();
        },
        addAll: async (urls: string[]) => {
          for (const url of urls) {
            const r = await fetch(url);
            if (!r.ok) throw Error("Asset failed");
            data.set(url, r);
            requestOrigins.set(name + url, "");
          }
        },
      };
    },
  };
  const skipWaiting = vi.fn(async () => {}),
    claim = vi.fn(async () => {});
  runInNewContext(source, {
    self: {
      location: { origin },
      registration: { scope: origin + base },
      addEventListener: (name: string, fn: any) => (listeners[name] = fn),
      skipWaiting,
      clients: { claim },
    },
    caches,
    fetch,
    URL,
  });
  const lifecycle = async (name: string) => {
    let work: Promise<any> | undefined;
    listeners[name]({ waitUntil: (p: Promise<any>) => (work = p) });
    await work;
  };
  const request = async (path = base, mode = "navigate") => {
    let work: Promise<Response> | undefined;
    listeners.fetch({
      request: {
        url: origin + path,
        method: "GET",
        mode,
        headers: new Headers(mode === "cors" ? { Origin: origin } : {}),
      },
      respondWith: (p: Promise<Response>) => (work = p),
    });
    return work;
  };
  return {
    message: (event: unknown) => listeners.message(event),
    stores,
    cacheName,
    oldCacheName,
    base,
    fetch,
    skipWaiting,
    claim,
    lifecycle,
    request,
    setOffline: () => (offline = true),
  };
}
describe.each(["/", "/crux-planner/"])(
  "offline service worker at %s",
  (base) => {
    it("loads cached modules offline when Vary Origin differs from precaching", async () => {
      const h = harness(false, false, base);
      await h.lifecycle("install");
      h.setOffline();
      h.fetch.mockClear();
      expect(await (await h.request())?.text()).toContain('id="root"');
      expect(
        await (await h.request(base + "assets/app-test.js", "cors"))?.text(),
      ).toBe("asset");
      expect(h.fetch).not.toHaveBeenCalled();
    });
    it("keeps the last usable app if the next download fails halfway through", async () => {
      const h = harness(true, false, base);
      h.stores.set(
        h.oldCacheName,
        new Map([[base, new Response("previous usable app")]]),
      );
      await expect(h.lifecycle("install")).rejects.toThrow(
        "Network unavailable",
      );
      expect(h.stores.has(h.cacheName)).toBe(false);
      expect(await h.stores.get(h.oldCacheName)?.get(base)?.text()).toBe(
        "previous usable app",
      );
      expect(h.skipWaiting).not.toHaveBeenCalled();
    });
    it("does not poison offline access with a hosting sign-in page", async () => {
      const h = harness(false, true, base);
      h.stores.set(
        h.oldCacheName,
        new Map([[base, new Response("previous usable app")]]),
      );
      await expect(h.lifecycle("install")).rejects.toThrow(
        "app shell is unavailable",
      );
      expect(h.stores.has(h.oldCacheName)).toBe(true);
      expect(h.stores.has(h.cacheName)).toBe(false);
    });
    it("cleans an old app cache only after the replacement has installed successfully", async () => {
      const h = harness(false, false, base);
      h.stores.set(h.oldCacheName, new Map());
      await h.lifecycle("install");
      expect(h.stores.has(h.oldCacheName)).toBe(true);
      await h.lifecycle("activate");
      expect([...h.stores.keys()]).toEqual([h.cacheName]);
      expect(h.claim).toHaveBeenCalledOnce();
    });
    it("does not intercept the private hosting sign-in route", async () => {
      const h = harness(false, false, base);
      expect(await h.request("/signin-with-chatgpt")).toBeUndefined();
      expect(h.fetch).not.toHaveBeenCalled();
    });
    it("serves the explicit index page offline without intercepting another app", async () => {
      const h = harness(false, false, base);
      await h.lifecycle("install");
      h.setOffline();
      expect(await (await h.request(base + "index.html"))?.text()).toContain(
        'id="root"',
      );
      expect(await h.request("/another-app/")).toBeUndefined();
      if (base !== "/") {
        expect(
          await h.request("/another-app/assets/main.js", "cors"),
        ).toBeUndefined();
      }
    });
    it("reports the downloaded build to suspended or older clients", async () => {
      const h = harness(false, false, base), postMessage = vi.fn();
      h.message({data:{type:"CRUX_GET_VERSION"},source:{postMessage}});
      expect(postMessage).toHaveBeenCalledWith({type:"CRUX_VERSION",version:"test-build"});
    });
    it("retains the previous app when a deployment serves mismatched HTML and worker versions", async () => {
      const h = harness(false, false, base, true);
      h.stores.set(h.oldCacheName, new Map([[base, new Response("previous usable app")]]));
      await expect(h.lifecycle("install")).rejects.toThrow("app shell is unavailable");
      expect(h.stores.has(h.oldCacheName)).toBe(true);
      expect(h.skipWaiting).not.toHaveBeenCalled();
    });
    it("keeps a neighboring project's offline cache when activating", async () => {
      const h = harness(false, false, base);
      const neighbor = "crux-shell-%2Fanother-app%2F-build";
      h.stores.set(
        neighbor,
        new Map([["/another-app/", new Response("neighbor")]]),
      );
      h.stores.set(h.oldCacheName, new Map());
      await h.lifecycle("install");
      await h.lifecycle("activate");
      expect(h.stores.has(neighbor)).toBe(true);
      expect(h.stores.has(h.oldCacheName)).toBe(false);
      expect(h.stores.has(h.cacheName)).toBe(true);
    });
  },
);
