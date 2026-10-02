import fs from "node:fs/promises";
import { expect, test } from "../../lib/fixtures";

// The same flows as tests/electron/main-process.spec.ts, but through the real OS dialogs:
// Playwright triggers them in the renderer, UI Automation answers them, Playwright checks the result.
test.describe("Native dialogs (real)", () => {
  test("opens a file picked in the Windows file dialog", async ({ mainWindow, nativeUi }, testInfo) => {
    const filePath = testInfo.outputPath("picked file.txt");
    await fs.writeFile(filePath, "content from the real dialog");

    await mainWindow.openFileButton.click();
    await nativeUi.fileDialog.open(filePath);

    // Windows returns the path as it is spelled on disk, which may differ in letter case from the typed one.
    await expect(mainWindow.selectedFile).toHaveText(filePath, { ignoreCase: true });
    await expect(mainWindow.fileContent).toHaveText("content from the real dialog");
  });

  test("keeps the opened file when the next file dialog is cancelled", async ({ mainWindow, nativeUi }, testInfo) => {
    const filePath = testInfo.outputPath("kept file.txt");
    await fs.writeFile(filePath, "content that must stay");
    await mainWindow.openFileButton.click();
    await nativeUi.fileDialog.open(filePath);
    await expect(mainWindow.fileContent).toHaveText("content that must stay");

    await mainWindow.openFileButton.click();
    await nativeUi.fileDialog.cancel();

    await expect(mainWindow.selectedFile).toHaveText(filePath, { ignoreCase: true });
    await expect(mainWindow.fileContent).toHaveText("content that must stay");
  });

  test("clears notes after Delete is chosen in the message box", async ({ mainWindow, nativeUi }) => {
    await mainWindow.addNote("Temporary note");

    await mainWindow.clearNotesButton.click();
    await expect.poll(() => nativeUi.messageBox.message()).toBe("Delete all notes?");
    await nativeUi.messageBox.choose("Delete");

    await expect(mainWindow.notes).toHaveCount(0);
  });

  test("keeps notes after Cancel is chosen in the message box", async ({ mainWindow, nativeUi }) => {
    await mainWindow.addNote("Note to keep");

    await mainWindow.clearNotesButton.click();
    await nativeUi.messageBox.choose("Cancel");

    // A note added afterwards puts the check behind the app's handling of the answer.
    await mainWindow.addNote("Note added after Cancel");
    await expect(mainWindow.notes).toHaveText(["Note to keep", "Note added after Cancel"]);
  });
});
