import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openChat: (params) => ipcRenderer.invoke("open-chat", params),
});
