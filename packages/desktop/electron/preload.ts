import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopHost", {
  request: (message: unknown) => ipcRenderer.invoke("dynamo:request", message),
});
