import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build as bundle } from "esbuild";
import { build as buildVite } from "vite";

const projectRoot = resolve(import.meta.dirname, "..");
const outdir = resolve(projectRoot, "dist");

await buildVite({ configFile: resolve(projectRoot, "vite.config.ts") });
await mkdir(outdir, { recursive: true });

await bundle({
  entryPoints: [resolve(projectRoot, "src/background/index.ts")],
  outfile: resolve(outdir, "background.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome114",
  sourcemap: false,
  minify: true
});

await bundle({
  entryPoints: [resolve(projectRoot, "src/content/index.ts")],
  outfile: resolve(outdir, "content.js"),
  bundle: true,
  format: "iife",
  globalName: "QiuzhaoContent",
  platform: "browser",
  target: "chrome114",
  sourcemap: false,
  minify: true
});

await cp(resolve(projectRoot, "public/noise.svg"), resolve(outdir, "noise.svg"));
const ocrOutdir = resolve(outdir, "ocr");
await mkdir(ocrOutdir, { recursive: true });
await Promise.all([
  cp(resolve(projectRoot, "node_modules/tesseract.js/dist/worker.min.js"), resolve(ocrOutdir, "worker.min.js")),
  cp(resolve(projectRoot, "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js"), resolve(ocrOutdir, "tesseract-core-lstm.wasm.js")),
  cp(
    resolve(projectRoot, "node_modules/@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz"),
    resolve(ocrOutdir, "chi_sim.traineddata.gz")
  )
]);
const pdfjsOutdir = resolve(outdir, "pdfjs");
await mkdir(pdfjsOutdir, { recursive: true });
await Promise.all([
  cp(resolve(projectRoot, "node_modules/pdfjs-dist/cmaps"), resolve(pdfjsOutdir, "cmaps"), { recursive: true }),
  cp(resolve(projectRoot, "node_modules/pdfjs-dist/standard_fonts"), resolve(pdfjsOutdir, "standard_fonts"), { recursive: true })
]);
