import esbuild from "esbuild";
import { cpSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: [path.join(dir, "src/extension.ts")],
  outfile: path.join(dir, "dist/extension.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
} else {
  await esbuild.build(buildOptions);
}

const webview = path.join(dir, "dist/webview");
rmSync(webview, { recursive: true, force: true });
cpSync(path.join(dir, "../ui/dist"), webview, { recursive: true });
