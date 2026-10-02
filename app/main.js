const { app, BrowserWindow, Menu, dialog, ipcMain, screen } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { NativePanel } = require("./native-panel");

// Tests point every app instance at its own profile so parallel instances never share state.
if (process.env.HYBRID_DEMO_USER_DATA) {
  app.setPath("userData", process.env.HYBRID_DEMO_USER_DATA);
}

let mainWindow = null;
let nativePanel = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 760,
    title: "Hybrid Demo",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
    closeNativePanel();
  });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: "&File",
      submenu: [
        { id: "clear-notes", label: "&Clear notes", click: () => send("menu:clear-notes") },
        { type: "separator" },
        { id: "exit", label: "E&xit", role: "quit" },
      ],
    },
    {
      label: "&Help",
      submenu: [{ id: "about", label: "&About Hybrid Demo", click: showAbout }],
    },
  ]);
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "About Hybrid Demo",
    message: "Hybrid Demo",
    detail: `Electron ${process.versions.electron} + a native WinForms panel.`,
    buttons: ["OK"],
    noLink: true,
  });
}

// The native window handle is a pointer-sized buffer; the panel needs it as a decimal string.
function nativeHandleOf(win) {
  const handle = win.getNativeWindowHandle();
  return handle.length === 8 ? handle.readBigUInt64LE(0).toString() : handle.readUInt32LE(0).toString();
}

// The docked panel is a child HWND positioned by the native side, which works in physical screen pixels.
function toScreenPixels(win, rect) {
  const content = win.getContentBounds();
  return screen.dipToScreenRect(win, {
    x: Math.round(content.x + rect.x),
    y: Math.round(content.y + rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
}

function openNativePanel({ docked = false, bounds = null } = {}) {
  if (nativePanel) return;
  const options = docked ? { parentHwnd: nativeHandleOf(mainWindow), bounds: toScreenPixels(mainWindow, bounds) } : {};
  nativePanel = new NativePanel(options);
  nativePanel.on("ready", () => send("native-panel:state", docked ? "docked" : "open"));
  nativePanel.on("message", (message) => send("native-panel:message", message));
  nativePanel.on("exit", () => {
    nativePanel = null;
    send("native-panel:state", "closed");
  });
}

function closeNativePanel() {
  if (nativePanel) nativePanel.close();
}

function registerIpc() {
  ipcMain.handle("dialog:open-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open file",
      properties: ["openFile"],
      filters: [
        { name: "Text files", extensions: ["txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const filePath = result.filePaths[0];
    return { canceled: false, filePath, content: await fs.readFile(filePath, "utf8") };
  });

  ipcMain.handle("dialog:confirm-clear", async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "Hybrid Demo",
      message: "Delete all notes?",
      detail: "This cannot be undone.",
      buttons: ["Delete", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  ipcMain.handle("native-panel:open", (_event, options) => openNativePanel(options));
  ipcMain.handle("native-panel:close", () => closeNativePanel());
  ipcMain.handle("native-panel:send", (_event, text) => {
    if (nativePanel) nativePanel.showMessage(text);
  });
  ipcMain.on("native-panel:dock-bounds", (_event, bounds) => {
    if (nativePanel && nativePanel.docked) nativePanel.setBounds(toScreenPixels(mainWindow, bounds));
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
