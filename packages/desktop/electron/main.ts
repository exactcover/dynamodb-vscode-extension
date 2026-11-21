import { ConnectionBook, ServiceCache, createDispatcher, type Host } from "@dynamodb-client/core";
import { app, BrowserWindow, clipboard, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { installAppMenu } from "./menu";
import { ElectronConnectionRepository, secretsAreEncrypted } from "./store";

declare const __dirname: string;

const here = __dirname;

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

let windowRef: BrowserWindow | undefined;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 560,
    title: "DynamoDB Client",
    backgroundColor: "#1c1915",
    webPreferences: {
      preload: path.join(here, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRef = win;
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(here, "ui/index.html"));
  }
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`Failed to load ${url}: ${description} (${code})`);
  });
  win.on("closed", () => {
    windowRef = undefined;
  });
}

function host(): Host {
  return {
    connections: new ConnectionBook(new ElectronConnectionRepository()),
    appInfo: async () => ({
      encryption: await secretsAreEncrypted(),
      platform: process.platform,
      product: "desktop",
    }),
    saveJsonFile: async (suggestedName, contents) => {
      const options = { defaultPath: suggestedName, filters: [{ name: "JSON", extensions: ["json"] }] };
      const result = windowRef ? await dialog.showSaveDialog(windowRef, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return false;
      fs.writeFileSync(result.filePath, contents, "utf8");
      return true;
    },
    pickJsonFile: async () => {
      const options = { filters: [{ name: "JSON", extensions: ["json"] }], properties: ["openFile" as const] };
      const result = windowRef ? await dialog.showOpenDialog(windowRef, options) : await dialog.showOpenDialog(options);
      const file = result.filePaths[0];
      if (result.canceled || !file) return null;
      return fs.readFileSync(file, "utf8");
    },
    writeClipboard: async (text) => {
      clipboard.writeText(text);
    },
  };
}

app.on("second-instance", () => {
  if (!windowRef) return;
  if (windowRef.isMinimized()) windowRef.restore();
  windowRef.focus();
});

if (hasLock) {
  void (async () => {
    await app.whenReady();
    installAppMenu();
    const dispatch = createDispatcher(host(), new ServiceCache());
    ipcMain.handle("dynamo:request", async (_event, message: { method?: string; params?: unknown }) => {
      if (!message || typeof message.method !== "string") throw new Error("Invalid request.");
      return dispatch(message.method, message.params);
    });
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })();
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
