import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiDir = path.resolve(desktopDir, "../ui");

const shared = {
  bundle: true,
  platform: "node" as const,
  target: "node24",
  format: "cjs" as const,
  external: ["electron"],
  sourcemap: true,
};

await esbuild.build({ ...shared, entryPoints: [path.join(desktopDir, "electron/main.ts")], outfile: path.join(desktopDir, "dist/main.js") });
await esbuild.build({ ...shared, entryPoints: [path.join(desktopDir, "electron/preload.ts")], outfile: path.join(desktopDir, "dist/preload.js") });

const vite = spawn("bun", ["run", "dev", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  cwd: uiDir,
  stdio: "inherit",
});

await waitFor("http://127.0.0.1:5173");

const require = createRequire(path.join(desktopDir, "package.json"));
const electronPath = require("electron") as string;
const electron = spawn(electronPath, ["--no-sandbox", "."], {
  cwd: desktopDir,
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:5173" },
});

const stop = (child: ChildProcess) => {
  if (!child.killed) child.kill();
};

electron.on("exit", () => {
  stop(vite);
  process.exit(0);
});

process.on("SIGINT", () => {
  stop(electron);
  stop(vite);
  process.exit(0);
});

async function waitFor(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
