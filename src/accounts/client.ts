import { createClient } from "@supabase/supabase-js";
import { publicAccountConfig } from "./config";

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
