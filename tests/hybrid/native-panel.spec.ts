import { expect, test } from "../../lib/fixtures";
import { NativePanel } from "../../pages/native/NativePanel";

test.describe("Native panel (separate window)", () => {
  let panel: NativePanel;

  test.beforeEach(async ({ mainWindow, nativeUi }) => {
    await mainWindow.openPanelButton.click();
    await expect(mainWindow.panelState).toHaveText("open");
    panel = await nativeUi.panelWindow();
    await panel.waitUntilOpen();
  });

  test("delivers a message from the native panel to the renderer", async ({ mainWindow }) => {
    await panel.sendMessage("Naïve café from WinForms", { urgent: true, priority: "High" });

    await expect(mainWindow.messageFromPanel).toHaveText("Naïve café from WinForms (High, urgent)");
  });

  test("delivers a message from the renderer to the native panel", async ({ mainWindow }) => {
    await mainWindow.sendToPanel("Hello from Electron");

    await expect.poll(() => panel.receivedLabel.getText()).toBe("Received: Hello from Electron");
  });

  test("reports the panel as closed when its window is closed natively", async ({ mainWindow }) => {
    await panel.close();

    await expect(mainWindow.panelState).toHaveText("closed");
    await expect(mainWindow.openPanelButton).toBeEnabled();
  });
});

test.describe("Native panel (docked into the Electron window)", () => {
  test("exchanges messages with the renderer in both directions", async ({ mainWindow, nativeUi }) => {
    await mainWindow.dockPanelButton.click();
    await expect(mainWindow.panelState).toHaveText("docked");
    await nativeUi.dockedPanel.waitUntilOpen();

    await nativeUi.dockedPanel.sendMessage("From the docked panel");
    await expect(mainWindow.messageFromPanel).toHaveText("From the docked panel (Normal)");

    await mainWindow.sendToPanel("To the docked panel");
    await expect.poll(() => nativeUi.dockedPanel.receivedLabel.getText()).toBe("Received: To the docked panel");
  });
});
