import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Modal } from "../Modal";
import { accountRedirect, googleAuthEnabled, initialOAuthError, supabase } from "./client";

function useAccountStore(client: SupabaseClient | null, googleEnabled: boolean) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!client);
  const [error, setError] = useState(initialOAuthError);
  const [showAccount, setShowAccount] = useState(!!initialOAuthError);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    if (!client) return;
    let active = true;
    let observed = false;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      observed = true;
      setSession(next);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT")
        setShowAccount(false);
    });
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || observed) return;
        if (error)
          setError("Could not restore your sign-in. Try signing in again.");
        setSession(data.session);
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setReady(true);
          setError("Could not restore your sign-in.");
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);
  const signOut = async () => {
    if (!client) return true;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) {
      setError(error.message);
      return false;
    }
    setSession(null);
    setShowAccount(false);
    setRecovering(false);
    return true;
  };
  return {
    client,
    googleEnabled,
    user: session?.user ?? null,
    ready,
    error,
    setError,
    showAccount,
    setShowAccount,
    recovering,
    setRecovering,
    signOut,
  };
}
const AccountContext = createContext<ReturnType<typeof useAccountStore> | null>(
  null,
);
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw Error("Missing account provider");
  return value;
}
export function AccountProvider({
  children,
  client = supabase,
  googleEnabled = googleAuthEnabled,
}: {
  children: ReactNode;
  client?: SupabaseClient | null;
  googleEnabled?: boolean;
}) {
  const account = useAccountStore(client, googleEnabled);
  return (
    <AccountContext.Provider value={account}>
      {children}
      {account.recovering && <PasswordRecovery />}
    </AccountContext.Provider>
  );
}
function PasswordRecovery() {
  const account = useAccount();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Choose a new password"
      onClose={() => account.setRecovering(false)}
    >
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await account.client!.auth.updateUser({ password });
            if (result.error) throw result.error;
            setPassword("");
            account.setRecovering(false);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Could not update your password.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          Your recovery link has signed you in. Set a new password for Crux.
        </p>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="warning">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </Modal>
  );
}
export { accountRedirect };
