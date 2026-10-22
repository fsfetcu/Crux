import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { publicAccountConfig } from "./src/accounts/config";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const config = publicAccountConfig(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  if (config.error) throw Error(config.error);
  return { plugins: [react()], base: process.env.APP_BASE_PATH || "/" };
});
