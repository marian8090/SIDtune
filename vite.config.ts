import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Serves ./hvsc-build at /hvsc (with Range support) so the online catalogue works in `npm run dev`. */
function hvscDev(): Plugin {
  return {
    name: "sidtune-hvsc-dev",
    configureServer(server) {
      server.middlewares.use("/hvsc", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
        if (!name || name.includes("/") || name.includes("..")) return next();
        const file = resolve("hvsc-build", name);
        if (!existsSync(file)) return next();
        const size = statSync(file).size;
        const type = name.endsWith(".json") ? "application/json" : name.endsWith(".txt") ? "text/plain; charset=latin1" : "application/octet-stream";
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", type);
        res.setHeader("Cache-Control", "no-cache");
        if (m && (m[1] || m[2])) {
          const start = m[1] ? Number(m[1]) : size - Number(m[2]);
          const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
          res.setHeader("Content-Length", end - start + 1);
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader("Content-Length", size);
          createReadStream(file).pipe(res);
        }
      });
    },
  };
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [hvscDev()],
  worker: {
    format: "es",
    // The library loads SIDLite with a dynamic import. If that chunk imports from the worker entry, WebKit evaluates the
    // worker a second time, and the copy with empty state takes over onmessage. Keep shared code out of the entry.
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: "sid-shared", test: /libsidplayfp-wasm[\\/]dist[\\/](?!sidlite[\\/]).*\.js$|rolldown:runtime/ }] } },
    },
  },
  build: { target: "es2022" },
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
});
