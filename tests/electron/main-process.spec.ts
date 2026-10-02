import fs from "node:fs/promises";
import { expect, test } from "../../lib/fixtures";

// Native UI replaced in the main process: fast and parallel-safe, but the real OS dialogs are never
// shown; those are covered by tests/hybrid. The application menu can only be tested this way: Electron
// draws it itself, so UI Automation does not see it.
test.describe("Main process (stubbed native UI)", () => {
  test("reads app state from the main process", async ({ electronApp, mainWindow }) => {
    const windowCount = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

    expect(windowCount).toBe(1);
    await expect(mainWindow.page).toHaveTitle("Hybrid Demo");
  });

  test("shows the file chosen in a stubbed open dialog", async ({ electronApp, mainWindow }, testInfo) => {
    const filePath = testInfo.outputPath("stubbed.txt");
    await fs.writeFile(filePath, "content from a stubbed dialog");
    await electronApp.evaluate(
      ({ dialog }, filePaths) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths });
      },
      [filePath]
    );

    await mainWindow.openFileButton.click();

    await expect(mainWindow.selectedFile).toHaveText(filePath);
    await expect(mainWindow.fileContent).toHaveText("content from a stubbed dialog");
  });

  test("clears notes when the stubbed confirmation is accepted", async ({ electronApp, mainWindow }) => {
    await electronApp.evaluate(({ dialog }) => {
      dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
    });
    await mainWindow.addNote("Temporary note");

    await mainWindow.clearNotesButton.click();

    await expect(mainWindow.notes).toHaveCount(0);
  });

  test("clears notes from the application menu item", async ({ electronApp, mainWindow }) => {
    await mainWindow.addNote("Temporary note");

    await electronApp.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()!.getMenuItemById("clear-notes")!.click();
    });

    await expect(mainWindow.notes).toHaveCount(0);
  });
});
