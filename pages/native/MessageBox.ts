import { NativeDriver, NativeElement } from "../../lib/native-driver";

/** A native message box (Windows task dialog) owned by the Electron window. */
export class MessageBox {
  constructor(
    private readonly native: NativeDriver,
    private readonly owner: () => NativeElement
  ) {}

  get window() {
    return this.owner().$('./Window[@ClassName="#32770"]');
  }

  /** The main instruction line; UI Automation exposes its text as the element name. */
  async message() {
    return this.window.$("~MainInstruction").getAttribute("Name");
  }

  /** The app shows its message boxes with custom labels (`noLink`), so a button is addressed by its label. */
  async choose(buttonName: string) {
    await this.native.invoke(this.window.$(`./Button[@Name="${buttonName}"]`));
    await this.window.waitForExist({ reverse: true });
  }
}
