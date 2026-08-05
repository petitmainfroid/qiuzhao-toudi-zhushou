import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
});
