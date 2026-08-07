import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@developer-tools": resolve(
        __dirname,
        mode === "collector"
          ? "src/devtools/ats-collector/entry.tsx"
          : "src/devtools/entry.tsx"
      )
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        options: resolve(__dirname, "options.html"),
        sidepanel: resolve(__dirname, "sidepanel.html")
      }
    }
  }
}));
