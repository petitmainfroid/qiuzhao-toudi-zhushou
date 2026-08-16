import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "ui"),
  publicDir: resolve(__dirname, "../../public"),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^\.\.\/storage\/savedResumeRepository$/, replacement: resolve(__dirname, "ui/stubs/savedResumeRepository.ts") },
    ]
  },
  build: {
    outDir: resolve(__dirname, "dist-ui"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/profile-host.js",
        chunkFileNames: "assets/profile-host-[name].js",
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith(".css"))
            ? "assets/profile-host.css"
            : "assets/[name][extname]"
      }
    }
  }
});
