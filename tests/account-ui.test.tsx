// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { AccountProvider } from "../src/accounts/AccountContext";
import { AccountWorkspace } from "../src/App";
import { firstProfile, PROFILE_KEY } from "../src/profiles";
import { initialState } from "../src/model";
import type { ProfileData } from "../src/profiles";
import { GOOGLE_REDIRECT_KEY } from "../src/accounts/googleRedirect";
const profile = (name: string) => {
  const data = firstProfile(initialState());
  data.profiles[0].name = name;
  return data;
};
function fakeClient() {
  let session: Session | null = null;
  let listener = (_event: string, _session: Session | null) => {};
  const rows = new Map<
    string,
    { data: ProfileData; revision: number; updated_at: string }
  >();
  for (const id of ["A", "B"])
    rows.set(id, {
      data: profile(`Account ${id}`),
      revision: 1,
      updated_at: new Date().toISOString(),
    });
  const signIn = (id: string) => {
    session = {
      user: { id, email: `${id.toLowerCase()}@example.test` },
    } as Session;
    listener("SIGNED_IN", session);
  };
  const api = {
    auth: {
      onAuthStateChange: vi.fn((fn: typeof listener) => {
        listener = fn;
        return { data: { subscription: { unsubscribe() {} } } };
      }),
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      signInWithPassword: vi.fn(async ({ email }: { email: string }) => {
        signIn(email.startsWith("a") ? "A" : "B");
        return { data: { session }, error: null };
      }),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      signInWithOAuth: vi.fn(async () => ({ data: { url: "https://example.test/authorize" }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => {
        session = null;
        listener("SIGNED_OUT", null);
        return { error: null };
      }),
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          abortSignal: () => ({
            maybeSingle: async () => ({
              data: session?.user.id === id ? (rows.get(id) ?? null) : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
    rpc: (
      _fn: string,
      args: {
        p_user_id: string;
        p_expected_revision: number;
        p_data: ProfileData;
      },
    ) => ({
      abortSignal: () => ({
        maybeSingle: async () => ({
          data: session?.user.id === args.p_user_id ? (rows.get(args.p_user_id) ?? null) : null,
          error: null,
        }),
        single: async () => {
          if (session?.user.id !== args.p_user_id)
            return {
              data: null,
              error: { code: "PT403", message: "Wrong account" },
            };
          const previous = rows.get(args.p_user_id);
          if ((previous?.revision ?? 0) !== args.p_expected_revision)
            return {
              data: null,
              error: { code: "PT409", message: "Conflict" },
            };
          const row = {
            data: structuredClone(args.p_data),
            revision: args.p_expected_revision + 1,
            updated_at: new Date().toISOString(),
          };
          rows.set(args.p_user_id, row);
          return { data: row, error: null };
        },
      }),
    }),
  };
  return {
    api,
    client: api as unknown as SupabaseClient,
    rows,
    signIn,
    recover: () => {
      listener("PASSWORD_RECOVERY", session);
    },
  };
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  window.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const mount = (fake: ReturnType<typeof fakeClient>, googleEnabled = false) =>
  render(
    <AccountProvider client={fake.client} googleEnabled={googleEnabled}>
      <AccountWorkspace />
    </AccountProvider>,
  );
const login = async (
  user: ReturnType<typeof userEvent.setup>,
  email: string,
) => {
  await user.click(
    await screen.findByRole("button", { name: "Sign in or create account" }),
  );
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Email"), email);
  await user.type(
    within(dialog).getByLabelText("Password"),
    "test-password-only",
  );
  await user.click(within(dialog).getByRole("button", { name: "Sign in" }));
  await screen.findByRole("button", { name: "Manage account" });
};
describe("account UI and workspace switching", () => {
  it("automatically opens Google once in Strict Mode before showing a planner", async () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile("Device-only planner")));
    const fake = fakeClient();
    render(<StrictMode><AccountProvider client={fake.client} googleEnabled><AccountWorkspace /></AccountProvider></StrictMode>);
    await vi.waitFor(() => expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('button',{name:'Dashboard'})).toBeNull();
    expect(screen.queryByRole('option',{name:'Device-only planner'})).toBeNull();
    expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledWith({provider:'google',options:{redirectTo:expect.any(String),queryParams:{prompt:'select_account'}}});
    expect(fake.api.auth.signUp).not.toHaveBeenCalled();
    expect(fake.api.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)!).profiles[0].name).toBe('Device-only planner');
    expect(screen.getByRole('button',{name:'Opening Google…'}).getAttribute('disabled')).not.toBeNull();
  });
  it("can retry when Google sign-in fails to start", async () => {
    const fake = fakeClient();
    fake.api.auth.signInWithOAuth.mockRejectedValueOnce(Error('offline'));
    const user = userEvent.setup(); mount(fake,true);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('Could not start Google sign-in'));
    expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button',{name:'Continue with Google'}).getAttribute('disabled')).toBeNull();
    await user.click(screen.getByRole('button',{name:'Continue with Google'}));
    expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(2);
  });
  it("waits for session restoration before deciding to redirect", async () => {
    const fake=fakeClient();
    let finish!: (value: {data:{session:Session|null};error:null}) => void;
    fake.api.auth.getSession.mockImplementationOnce(() => new Promise(resolve => { finish=resolve; }));
    mount(fake,true);
    expect(screen.getByText('Restoring your sign-in…')).toBeTruthy();
    expect(fake.api.auth.signInWithOAuth).not.toHaveBeenCalled();
    await act(async () => finish({data:{session:null},error:null}));
    await vi.waitFor(() => expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1));
  });
  it("restores an existing Google session directly into its private planner", async () => {
    const fake=fakeClient(); fake.signIn('A'); mount(fake,true);
    expect(await screen.findByRole('option',{name:'Account A'})).toBeTruthy();
    expect(fake.api.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading',{name:'Your training, just for you.'})).toBeNull();
  });
  it("does not automatically restart after an OAuth cancellation", async () => {
    window.history.replaceState(null,'','/?error=access_denied&error_description=untrusted-message');
    const fake=fakeClient(); const user=userEvent.setup(); mount(fake,true);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('could not be completed'));
    expect(screen.queryByText('untrusted-message')).toBeNull();
    expect(fake.api.auth.signInWithOAuth).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Continue with Google'}));
    expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });
  it("offers a manual retry when Back restores a previous redirect attempt", async () => {
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY,'1');
    const fake=fakeClient(); const user=userEvent.setup(); mount(fake,true);
    const button=await screen.findByRole('button',{name:'Continue with Google'});
    expect(fake.api.auth.signInWithOAuth).not.toHaveBeenCalled();
    await user.click(button);
    expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });
  it("unlocks the sign-in button when browser Back restores the page from memory", async () => {
    const fake=fakeClient(); mount(fake,true);
    await screen.findByRole('button',{name:'Opening Google…'});
    const event=new Event('pageshow'); Object.defineProperty(event,'persisted',{value:true});
    await act(async () => { window.dispatchEvent(event); });
    expect(screen.getByRole('button',{name:'Continue with Google'}).hasAttribute('disabled')).toBe(false);
    expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });
  it("stays on sign-in after an intentional sign-out until the user continues", async () => {
    const fake=fakeClient(); fake.signIn('A'); const user=userEvent.setup(); mount(fake,true);
    await user.click(await screen.findByRole('button',{name:'Manage account'}));
    await user.click(screen.getByRole('button',{name:'Sign out'}));
    expect(await screen.findByRole('heading',{name:'Your training, just for you.'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Dashboard'})).toBeNull();
    expect(fake.api.auth.signInWithOAuth).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Continue with Google'}));
    expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });
  it("waits offline and starts once when connectivity returns", async () => {
    const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
    const fake=fakeClient(); mount(fake,true);
    expect(await screen.findByText(/You’re offline/)).toBeTruthy();
    expect(fake.api.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'Continue with Google'}).hasAttribute('disabled')).toBe(true);
    online.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await vi.waitFor(() => expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1));
  });
  it("keeps manual sign-in available when session storage is blocked", async () => {
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw Error('Blocked storage'); });
    const fake=fakeClient(); const user=userEvent.setup(); mount(fake,true);
    const button=await screen.findByRole('button',{name:'Continue with Google'});
    expect(fake.api.auth.signInWithOAuth).not.toHaveBeenCalled();
    await user.click(button);
    expect(fake.api.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });
  it("loads the correct account and keeps its history separate from guest and another account", async () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify(profile("Device-only planner")),
    );
    const fake = fakeClient();
    const user = userEvent.setup();
    mount(fake);
    await login(user, "a@example.test");
    expect(screen.getByRole("option", { name: "Account A" })).toBeTruthy();
    expect(
      screen.queryByRole("option", { name: "Device-only planner" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Log session" }));
    await user.type(
      within(screen.getByRole("dialog")).getByLabelText(/Notes/),
      "Only account A",
    );
    await user.click(screen.getByRole("button", { name: "Save workout" }));
    await vi.waitFor(() =>
      expect(fake.rows.get("A")!.data.profiles[0].state.logs).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(screen.getByText("Saved online")).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: "Manage account" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("option", { name: "Device-only planner" }),
    ).toBeTruthy();
    await login(user, "b@example.test");
    expect(screen.getByRole("option", { name: "Account B" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Account A" })).toBeNull();
    expect(fake.rows.get("B")!.data.profiles[0].state.logs).toEqual([]);
    expect(
      JSON.parse(localStorage.getItem(PROFILE_KEY)!).profiles[0].state.logs,
    ).toEqual([]);
  });
  it("does not upload device-only records when signup awaits email confirmation", async () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify(profile("My device-only plan")),
    );
    const fake = fakeClient();
    const user = userEvent.setup();
    mount(fake);
    await user.click(
      await screen.findByRole("button", { name: "Sign in or create account" }),
    );
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Email"), "new@example.test");
    await user.type(
      within(dialog).getByLabelText("Password"),
      "test-password-only",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create account" }),
    );
    expect(await screen.findByText(/Check your email to confirm/)).toBeTruthy();
    expect(fake.api.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.test",
        options: { emailRedirectTo: expect.any(String) },
      }),
    );
    expect(
      screen.getByRole("option", { name: "My device-only plan" }),
    ).toBeTruthy();
    expect(fake.rows.has("new")).toBe(false);
  });
  it("handles reset requests and the password-recovery form", async () => {
    const fake = fakeClient();
    const user = userEvent.setup();
    mount(fake);
    await user.click(
      await screen.findByRole("button", { name: "Sign in or create account" }),
    );
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "a@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/If an account exists/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await act(async () => {
      fake.signIn("A");
    });
    await screen.findByRole("button", { name: "Manage account" });
    await act(async () => {
      fake.recover();
    });
    await user.type(
      screen.getByLabelText("New password"),
      "replacement-test-password",
    );
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(fake.api.auth.updateUser).toHaveBeenCalledWith({
      password: "replacement-test-password",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
