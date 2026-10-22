import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { publicAccountConfig } from "./src/accounts/config";
export default defineConfig(({ mode }) => {
  const env = mode === "test" ? {} : loadEnv(mode, process.cwd(), "VITE_");
  const config = publicAccountConfig(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  if (config.error) throw Error(config.error);
  return {
    plugins: [react()],
    base: process.env.APP_BASE_PATH || "/",
    test: {
      // PGlite databases and jsdom are memory-heavy; bound concurrent workers
      // so UI timers are exercised reliably on laptops as well as CI.
      maxWorkers: 2,
      testTimeout: 15000,
      // Tests inject disposable clients. Never load a developer's live account
      // configuration or send authentication requests to their project.
      env: {
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
        VITE_GOOGLE_AUTH_ENABLED: "false",
      },
    },
  };
});
