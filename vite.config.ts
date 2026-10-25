import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: { target: "es2022" },
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
});
