import { createClient } from "@supabase/supabase-js";
import { publicAccountConfig } from "./config";
import { oauthCallbackFailed, oauthFailureMessage } from "./oauth";

export const googleAuthEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";
export const initialOAuthError = typeof window !== "undefined" && oauthCallbackFailed(window.location.href)
  ? oauthFailureMessage : "";

const { url, key, error } = publicAccountConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const accountConfigurationError = error;
export const supabase =
  url && key && !accountConfigurationError
    ? createClient(url, key, {
        auth: {
          storageKey: "crux-auth",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
export const accountRedirect = () =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;
