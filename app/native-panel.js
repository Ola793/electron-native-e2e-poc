const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const readline = require("node:readline");

const EXE_PATH = process.env.HYBRID_DEMO_NATIVE_PANEL || path.join(__dirname, "..", "native", "bin", "NativePanel.exe");

/**
 * The native half of the app: a WinForms process that talks to Electron over stdin/stdout,
 * one JSON object per line. With `parentHwnd` it embeds itself into the Electron window
 * as a child HWND instead of opening its own top-level window.
 */
class NativePanel extends EventEmitter {
  constructor({ parentHwnd = null, bounds = null } = {}) {
    super();
    this.docked = parentHwnd !== null;

    const args = ["--ipc"];
    if (this.docked) {
      args.push(`--parent-hwnd=${parentHwnd}`, `--bounds=${bounds.x},${bounds.y},${bounds.width},${bounds.height}`);
    }

    this.process = spawn(EXE_PATH, args, { stdio: ["pipe", "pipe", "ignore"] });
    // A panel that could not be started is reported the same way as one that has closed.
    this.process.on("error", () => this.emit("exit"));
    this.process.on("exit", () => this.emit("exit"));
    // Writing to a panel that is just closing fails with EPIPE; its "exit" event already tells the story.
    this.process.stdin.on("error", () => {});

    readline.createInterface({ input: this.process.stdout }).on("line", (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === "ready") this.emit("ready");
      if (event.type === "message") {
        this.emit("message", { text: event.text, urgent: event.urgent, priority: event.priority });
      }
    });
  }

  showMessage(text) {
    this.write({ type: "show-message", text });
  }

  setBounds(bounds) {
    this.write({ type: "bounds", ...bounds });
  }

  close() {
    this.write({ type: "close" });
  }

  write(command) {
    if (this.process.stdin.writable) this.process.stdin.write(`${JSON.stringify(command)}\n`);
  }
}

module.exports = { NativePanel };
