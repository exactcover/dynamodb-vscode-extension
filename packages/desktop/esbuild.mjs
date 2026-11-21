import esbuild from "esbuild";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const shared = {
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

await esbuild.build({
  ...shared,
  entryPoints: [path.join(dir, "electron/main.ts")],
  outfile: path.join(dir, "dist/main.js"),
});

await esbuild.build({
  ...shared,
  entryPoints: [path.join(dir, "electron/preload.ts")],
  outfile: path.join(dir, "dist/preload.js"),
});

const uiDist = path.join(dir, "../ui/dist");
if (existsSync(path.join(uiDist, "index.html"))) {
  const target = path.join(dir, "dist/ui");
  rmSync(target, { recursive: true, force: true });
  cpSync(uiDist, target, { recursive: true });
}
