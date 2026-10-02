import { expect, test } from "../../lib/fixtures";

// The native component on its own, without Electron: UI Automation only.
test.describe("Native panel (standalone)", () => {
  test("shows the sent message with default options", async ({ standalonePanel }) => {
    await standalonePanel.sendMessage("Plain message");

    await expect.poll(() => standalonePanel.statusLabel.getText()).toBe("Sent: Plain message (Normal)");
  });

  test("shows the sent message with urgency and priority", async ({ standalonePanel }) => {
    await standalonePanel.sendMessage("Important message", { urgent: true, priority: "Low" });

    await expect.poll(() => standalonePanel.statusLabel.getText()).toBe("Sent: Important message (Low, urgent)");
    expect(await standalonePanel.urgentCheckBox.isSelected()).toBe(true);
    expect(await standalonePanel.priorityCombo.getText()).toBe("Low");
  });
});
