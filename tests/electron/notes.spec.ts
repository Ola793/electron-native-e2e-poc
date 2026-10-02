import { expect, test } from "../../lib/fixtures";

test.describe("Notes (renderer)", () => {
  test("adds notes to the list", async ({ mainWindow }) => {
    await mainWindow.addNote("Buy milk");
    await mainWindow.addNote("Call the bank");

    await expect(mainWindow.notes).toHaveText(["Buy milk", "Call the bank"]);
    await expect(mainWindow.noteInput).toBeEmpty();
  });

  test("ignores a blank note", async ({ mainWindow }) => {
    await mainWindow.addNote("   ");

    await expect(mainWindow.notes).toHaveCount(0);
  });
});
