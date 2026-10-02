import { Locator, Page } from "@playwright/test";

/** The Electron renderer window, driven through Playwright. */
export class MainWindow {
  readonly noteInput: Locator;
  readonly addNoteButton: Locator;
  readonly clearNotesButton: Locator;
  readonly notes: Locator;

  readonly openFileButton: Locator;
  readonly selectedFile: Locator;
  readonly fileContent: Locator;

  readonly openPanelButton: Locator;
  readonly dockPanelButton: Locator;
  readonly closePanelButton: Locator;
  readonly panelState: Locator;
  readonly panelMessageInput: Locator;
  readonly sendToPanelButton: Locator;
  readonly messageFromPanel: Locator;

  constructor(readonly page: Page) {
    this.noteInput = page.getByRole("textbox", { name: "Note", exact: true });
    this.addNoteButton = page.getByRole("button", { name: "Add note" });
    this.clearNotesButton = page.getByRole("button", { name: "Clear notes…" });
    this.notes = page.getByRole("list", { name: "Notes" }).getByRole("listitem");

    this.openFileButton = page.getByRole("button", { name: "Open file…" });
    this.selectedFile = page.getByRole("status", { name: "Selected file" });
    this.fileContent = page.getByRole("region", { name: "File content" });

    this.openPanelButton = page.getByRole("button", { name: "Open native panel" });
    this.dockPanelButton = page.getByRole("button", { name: "Dock native panel" });
    this.closePanelButton = page.getByRole("button", { name: "Close native panel" });
    this.panelState = page.getByRole("status", { name: "Native panel state" });
    this.panelMessageInput = page.getByRole("textbox", { name: "Message for native panel" });
    this.sendToPanelButton = page.getByRole("button", { name: "Send to native panel" });
    this.messageFromPanel = page.getByRole("status", { name: "Message from native panel" });
  }

  async addNote(text: string) {
    await this.noteInput.fill(text);
    await this.addNoteButton.click();
  }

  async sendToPanel(text: string) {
    await this.panelMessageInput.fill(text);
    await this.sendToPanelButton.click();
  }
}
