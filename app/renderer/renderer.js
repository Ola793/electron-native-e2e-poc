const api = window.hybridDemo;

const noteForm = document.getElementById("note-form");
const noteInput = document.getElementById("note-input");
const notes = document.getElementById("notes");
const selectedFile = document.getElementById("selected-file");
const fileContent = document.getElementById("file-content");
const panelState = document.getElementById("panel-state");
const panelMessage = document.getElementById("panel-message");
const panelReceived = document.getElementById("panel-received");
const openPanel = document.getElementById("open-panel");
const dockPanel = document.getElementById("dock-panel");
const closePanel = document.getElementById("close-panel");
const sendToPanel = document.getElementById("send-to-panel");
const nativeDock = document.getElementById("native-dock");

function clearNotes() {
  notes.replaceChildren();
}

function dockBounds() {
  const rect = nativeDock.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

noteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = noteInput.value.trim();
  if (!text) return;
  const item = document.createElement("li");
  item.textContent = text;
  notes.append(item);
  noteInput.value = "";
});

document.getElementById("clear-notes").addEventListener("click", async () => {
  if (await api.confirmClearNotes()) clearNotes();
});

document.getElementById("open-file").addEventListener("click", async () => {
  const result = await api.openFile();
  if (result.canceled) return;
  selectedFile.textContent = result.filePath;
  fileContent.textContent = result.content;
});

openPanel.addEventListener("click", () => api.openNativePanel({ docked: false }));

dockPanel.addEventListener("click", () => {
  nativeDock.classList.add("active");
  api.openNativePanel({ docked: true, bounds: dockBounds() });
});

closePanel.addEventListener("click", () => api.closeNativePanel());

sendToPanel.addEventListener("click", () => api.sendToNativePanel(panelMessage.value));

// The docked panel is a separate HWND, so it has to be told whenever its placeholder moves: when the
// window is resized or scrolled, and when content above the placeholder grows or shrinks.
const reportDockBounds = () => api.reportDockBounds(dockBounds());
window.addEventListener("resize", reportDockBounds);
window.addEventListener("scroll", reportDockBounds);
new ResizeObserver(reportDockBounds).observe(document.querySelector("main"));

api.onNativePanelState((state) => {
  const isOpen = state !== "closed";
  panelState.textContent = state;
  openPanel.disabled = isOpen;
  dockPanel.disabled = isOpen;
  closePanel.disabled = !isOpen;
  sendToPanel.disabled = !isOpen;
  if (!isOpen) nativeDock.classList.remove("active");
});

api.onNativePanelMessage((message) => {
  const flags = message.urgent ? `${message.priority}, urgent` : message.priority;
  panelReceived.textContent = `${message.text} (${flags})`;
});

api.onClearNotes(clearNotes);
