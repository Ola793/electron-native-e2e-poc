import { NativeDriver, NativeElement } from "../../lib/native-driver";

/**
 * The standard Windows "Open" file dialog, owned by the Electron window. Its controls are located
 * by the dialog-item ids Windows gives them, because their names follow the OS language.
 */
export class FileDialog {
  constructor(
    private readonly native: NativeDriver,
    private readonly owner: () => NativeElement
  ) {}

  get window() {
    return this.owner().$('./Window[@ClassName="#32770"]');
  }

  get fileNameInput() {
    return this.window.$('.//Edit[@AutomationId="1148"]');
  }

  get openButton() {
    return this.window.$('./*[@AutomationId="1"]');
  }

  get cancelButton() {
    return this.window.$('./Button[@AutomationId="2"]');
  }

  async open(filePath: string) {
    await this.native.fill(this.fileNameInput, filePath);
    // "Open" is a split button without InvokePattern, so this one is a real mouse click.
    await this.openButton.click();
    await this.window.waitForExist({ reverse: true });
  }

  async cancel() {
    await this.native.invoke(this.cancelButton);
    await this.window.waitForExist({ reverse: true });
  }
}
