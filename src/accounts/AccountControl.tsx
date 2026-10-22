import { useState } from "react";
import { Cloud, LogIn, UserRound } from "lucide-react";
import { Modal } from "../Modal";
import { useProfiles } from "../ProfileContext";
import { originalProfileBackup, parseProfileBackup } from "../profiles";
import { accountStorageKey } from "./workspace";
import { useAccount, accountRedirect } from "./AccountContext";

export const syncLabels = {
  device: "Device only",
  loading: "Loading account…",
  syncing: "Saving online…",
  saved: "Saved online",
  pending: "Saved here · sync pending",
  conflict: "Review online changes",
  error: "Online saving unavailable",
};
export function AccountControl() {
  const account = useAccount();
  const profiles = useProfiles();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const deviceBackup = () => {
    try {
      return originalProfileBackup();
    } catch {
      return "";
    }
  };
  const close = () => {
    account.setShowAccount(false);
    setPassword("");
    account.setError("");
    setMessage("");
  };
  return (
    <>
      <button
        className="account-button"
        aria-label={
          account.user ? "Manage account" : "Sign in or create account"
        }
        onClick={() => account.setShowAccount(true)}
      >
        {account.user ? <UserRound size={16} /> : <LogIn size={16} />}
        <span>{account.user ? "Account" : "Sign in"}</span>
      </button>
      {account.showAccount && (
        <Modal
          title={
            account.user
              ? "Your Crux account"
              : mode === "signup"
                ? "Create your Crux account"
                : mode === "reset"
                  ? "Reset your password"
                  : "Welcome back to Crux"
          }
          onClose={close}
        >
          {account.user ? (
            <div className="form-stack">
              <p className="account-email">{account.user.email}</p>
              <p className="account-sync">
                <Cloud size={17} /> {syncLabels[profiles.syncStatus]}
              </p>
              <p className="muted">
                Your profiles, workouts and check-ins are private to this
                account. Sign in on another device to load them.
              </p>
              {profiles.syncMessage && (
                <p role="status" className="warning">
                  {profiles.syncMessage}
                </p>
              )}
              <button
                className="button secondary"
                onClick={() => void profiles.syncNow()}
              >
                Sync now
              </button>
              <button className="text-button" onClick={profiles.exportBackup}>
                Download a backup
              </button>
              {deviceBackup() && (
                <button
                  className="text-button"
                  onClick={() => {
                    try {
                      profiles.setIncoming(parseProfileBackup(deviceBackup()));
                      close();
                    } catch {
                      account.setError(
                        "The device-only backup could not be read. Import a valid JSON backup in Settings.",
                      );
                    }
                  }}
                >
                  Bring my device-only planner into this account
                </button>
              )}
              <p className="small muted">
                Signing out clears a fully synced account copy from this device.
                Unsynced changes stay separate for your next sign-in.
              </p>
              {account.error && (
                <p role="alert" className="warning">
                  {account.error}
                </p>
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  const userId = account.user!.id;
                  const synced = profiles.syncStatus === "saved";
                  setBusy(true);
                  try {
                    if (await account.signOut()) {
                      if (synced) {
                        localStorage.removeItem(accountStorageKey(userId));
                        localStorage.removeItem(
                          `${accountStorageKey(userId)}:before-conflict`,
                        );
                      }
                    }
                  } catch {
                    account.setError(
                      "Could not sign out. Check your connection and try again.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </div>
          ) : !account.client ? (
            <p className="muted">
              Account setup is being completed. Your device-only planner still
              saves normally.
            </p>
          ) : (
            <form
              className="form-stack"
              onSubmit={async (event) => {
                event.preventDefault();
                account.setError("");
                setMessage("");
                setBusy(true);
                try {
                  if (mode === "reset") {
                    const result =
                      await account.client!.auth.resetPasswordForEmail(
                        email.trim(),
                        { redirectTo: accountRedirect() },
                      );
                    if (result.error) throw result.error;
                    setMessage(
                      "If an account exists for that address, you’ll receive a password reset link.",
                    );
                  } else if (mode === "signup") {
                    const result = await account.client!.auth.signUp({
                      email: email.trim(),
                      password,
                      options: { emailRedirectTo: accountRedirect() },
                    });
                    if (result.error) throw result.error;
                    setPassword("");
                    if (result.data.session) close();
                    else
                      setMessage(
                        "Check your email to confirm your account, then sign in here. Your device-only planner stays unchanged.",
                      );
                  } else {
                    const result =
                      await account.client!.auth.signInWithPassword({
                        email: email.trim(),
                        password,
                      });
                    if (result.error) throw result.error;
                    close();
                  }
                } catch (error) {
                  account.setError(
                    error instanceof Error
                      ? error.message
                      : "Could not complete this request. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="muted">
                {mode === "signup"
                  ? "A private place for your training, saved across devices. Your existing device-only plan is imported only when you choose."
                  : mode === "reset"
                    ? "We’ll email a link to choose a new password."
                    : "Sign in to load your own saved training."}
              </p>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {mode !== "reset" && (
                <label>
                  Password
                  <input
                    type="password"
                    aria-label="Password"
                    aria-describedby={
                      mode === "signup" ? "account-password-help" : undefined
                    }
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    minLength={mode === "signup" ? 8 : 1}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  {mode === "signup" && (
                    <span className="helper" id="account-password-help">
                      At least 8 characters.
                    </span>
                  )}
                </label>
              )}
              {account.error && (
                <p role="alert" className="warning">
                  {account.error}
                </p>
              )}
              {message && (
                <p role="status" className="account-message">
                  {message}
                </p>
              )}
              <button className="button" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : "Sign in"}
              </button>
              <div className="account-links">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMode(mode === "signup" ? "signin" : "signup");
                    account.setError("");
                    setMessage("");
                    setPassword("");
                  }}
                >
                  {mode === "signup"
                    ? "Already have an account? Sign in"
                    : "Create an account"}
                </button>
                {mode !== "reset" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setMode("reset");
                      account.setError("");
                      setPassword("");
                      setMessage("");
                    }}
                  >
                    Forgot password?
                  </button>
                )}
                {mode === "reset" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setMode("signin");
                      setMessage("");
                    }}
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
