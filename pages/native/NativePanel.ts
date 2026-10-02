import { NativeDriver, NativeElement } from "../../lib/native-driver";

/**
 * The WinForms panel, driven through UI Automation. Controls are located by AutomationId,
 * which for WinForms is the control's Name and does not change with the UI language.
 *
 * `locate` returns the panel's own window: a top-level window, or a child of the Electron
 * window when the panel is docked.
 */
export class NativePanel {
  constructor(
    private readonly native: NativeDriver,
    private readonly locate: () => NativeElement
  ) {}

  get window() {
    return this.locate();
  }

  get messageInput() {
    return this.window.$("~messageInput");
  }

  get urgentCheckBox() {
    return this.window.$("~urgentCheckBox");
  }

  get priorityCombo() {
    return this.window.$("~priorityCombo");
  }

  get sendButton() {
    return this.window.$("~sendButton");
  }

  get receivedLabel() {
    return this.window.$("~receivedLabel");
  }

  get statusLabel() {
    return this.window.$("~statusLabel");
  }

  async waitUntilOpen() {
    await this.window.waitForExist();
  }

  async sendMessage(text: string, options: { urgent?: boolean; priority?: "Low" | "Normal" | "High" } = {}) {
    await this.native.fill(this.messageInput, text);
    if (options.urgent !== undefined && (await this.urgentCheckBox.isSelected()) !== options.urgent) {
      await this.native.toggle(this.urgentCheckBox);
    }
    if (options.priority) await this.native.selectOption(this.priorityCombo, options.priority);
    await this.native.invoke(this.sendButton);
  }

  async close() {
    await this.native.closeWindow(this.window);
  }
}
