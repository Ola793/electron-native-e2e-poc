import { remote } from "webdriverio";
import type { ChainablePromiseElement } from "webdriverio";
import type { AppiumServer } from "./appium-server";

export type NativeElement = ChainablePromiseElement;

const ELEMENT_TIMEOUT_MS = 10_000;

/**
 * Windows UI Automation access to everything Playwright cannot see: OS dialogs, native windows
 * and native child windows embedded in the Electron window.
 *
 * It is one Appium "Root" session (the whole desktop), so windows are always looked up by a key
 * that belongs to one window only - its handle or its process id - and only among the desktop's
 * direct children. Searching all descendants of the desktop is slow and can match another app.
 *
 * Interactions use UI Automation patterns where the control supports them. A pattern acts on
 * the element itself, so it needs neither keyboard focus nor the mouse cursor.
 */
export class NativeDriver {
  private constructor(readonly session: WebdriverIO.Browser) {}

  static async connect(server: AppiumServer) {
    const session = await remote({
      hostname: server.hostname,
      port: server.port,
      logLevel: "error",
      waitforTimeout: ELEMENT_TIMEOUT_MS,
      capabilities: {
        platformName: "Windows",
        "appium:automationName": "NovaWindows",
        "appium:app": "Root",
        // The session lives as long as the worker. By default Appium ends a session after 60 s without
        // a command, which a test that spends a while on the Playwright side would exceed.
        "appium:newCommandTimeout": 0,
      },
    });
    return new NativeDriver(session);
  }

  async disconnect() {
    await this.session.deleteSession();
  }

  /** A top-level window by its native handle (HWND), e.g. the one Electron reports for a BrowserWindow. */
  windowByHandle(hwnd: string): NativeElement {
    // UI Automation runtime ids of HWND-based elements are "42.<hwnd>".
    return this.session.$(`/Pane/Window[@RuntimeId="42.${hwnd}"]`);
  }

  /** The top-level window of the given process. */
  windowByProcess(pid: number): NativeElement {
    return this.session.$(`/Pane/Window[@ProcessId="${pid}"]`);
  }

  /** InvokePattern: presses a button without moving the mouse. */
  async invoke(element: NativeElement) {
    await this.session.execute("windows: invoke", await this.resolve(element));
  }

  /** ValuePattern: sets the text of an edit control without typing. */
  async fill(element: NativeElement, value: string) {
    await this.session.execute("windows: setValue", await this.resolve(element), value);
  }

  /** TogglePattern: flips a check box. */
  async toggle(element: NativeElement) {
    await this.session.execute("windows: toggle", await this.resolve(element));
  }

  /** Picks an item of a combo box by its visible name. */
  async selectOption(comboBox: NativeElement, optionName: string) {
    const combo = await this.resolve(comboBox);
    await this.session.execute("windows: expand", combo);
    await this.session.execute("windows: select", await this.resolve(combo.$(`.//ListItem[@Name="${optionName}"]`)));
    await this.session.execute("windows: collapse", combo);
  }

  /** WindowPattern: closes a window the way its title-bar button would. */
  async closeWindow(window: NativeElement) {
    await this.session.execute("windows: close", await this.resolve(window));
  }

  /** PNG of the whole desktop. Playwright screenshots only contain web content, never native windows. */
  async screenshot() {
    return Buffer.from(await this.session.takeScreenshot(), "base64");
  }

  // Element commands such as click() wait for their element; execute() does not, it fails at once when
  // handed an element that is not there yet. So wait here and look the element up again.
  private async resolve(element: NativeElement) {
    const found = await element.getElement();
    if (found.elementId) return found;
    await found.waitForExist();
    return found.parent.$(found.selector as string).getElement();
  }
}
