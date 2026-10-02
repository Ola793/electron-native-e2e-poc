const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hybridDemo", {
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
  confirmClearNotes: () => ipcRenderer.invoke("dialog:confirm-clear"),
  openNativePanel: (options) => ipcRenderer.invoke("native-panel:open", options),
  closeNativePanel: () => ipcRenderer.invoke("native-panel:close"),
  sendToNativePanel: (text) => ipcRenderer.invoke("native-panel:send", text),
  reportDockBounds: (bounds) => ipcRenderer.send("native-panel:dock-bounds", bounds),
  onNativePanelState: (listener) => ipcRenderer.on("native-panel:state", (_event, state) => listener(state)),
  onNativePanelMessage: (listener) => ipcRenderer.on("native-panel:message", (_event, message) => listener(message)),
  onClearNotes: (listener) => ipcRenderer.on("menu:clear-notes", () => listener()),
});
