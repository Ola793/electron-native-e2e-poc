import {
  test as base,
  expect,
  _electron as electron,
  BrowserContext,
  ElectronApplication,
  TestInfo,
} from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MainWindow } from "../pages/MainWindow";
import { FileDialog } from "../pages/native/FileDialog";
import { MessageBox } from "../pages/native/MessageBox";
import { NativePanel } from "../pages/native/NativePanel";
import { startAppiumServer } from "./appium-server";
import { NativeDriver } from "./native-driver";
import { childProcessId } from "./process-tree";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const NATIVE_PANEL_IMAGE = "NativePanel.exe";
const NATIVE_PANEL_EXE = path.join(PROJECT_ROOT, "native", "bin", NATIVE_PANEL_IMAGE);
const CLOSE_TIMEOUT_MS = 5_000;

/** The native side of the running Electron app. */
type NativeUi = {
  fileDialog: FileDialog;
  messageBox: MessageBox;
  /** The native panel embedded in the Electron window as a child window. */
  dockedPanel: NativePanel;
  /** The native panel opened as its own window by the app's companion process. */
  panelWindow: () => Promise<NativePanel>;
};

type Fixtures = {
  electronApp: ElectronApplication;
  mainWindow: MainWindow;
  nativeUi: NativeUi;
  /** The native panel started on its own, without Electron. */
  standalonePanel: NativePanel;
};

type WorkerFixtures = {
  native: NativeDriver;
};

// Playwright starts Electron through a shell on Windows, so process() is the shell and killing it would
// leave the app running. taskkill /T takes down the whole tree, native panel included.
function killProcessTree(electronApp: ElectronApplication) {
  try {
    execFileSync("taskkill", ["/pid", String(electronApp.process().pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Already gone.
  }
}

// A native modal dialog left open by a failed test blocks a graceful quit, and close() has no timeout.
async function closeApp(electronApp: ElectronApplication) {
  const closed = electronApp
    .close()
    .then(() => true)
    .catch(() => true);
  const timedOut = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CLOSE_TIMEOUT_MS));
  if (!(await Promise.race([closed, timedOut]))) killProcessTree(electronApp);
}

// Playwright's own failure screenshot shows web content only; this one shows the native windows too.
async function attachDesktopOnFailure(native: NativeDriver, testInfo: TestInfo) {
  if (testInfo.status === testInfo.expectedStatus) return;
  try {
    const screenshotPath = testInfo.outputPath("desktop.png");
    await fs.writeFile(screenshotPath, await native.screenshot());
    await testInfo.attach("desktop", { path: screenshotPath, contentType: "image/png" });
  } catch {
    // A diagnostic must not replace the failure it is meant to explain.
  }
}

async function keepTraceOnFailure(context: BrowserContext, testInfo: TestInfo) {
  try {
    if (testInfo.status === testInfo.expectedStatus) {
      await context.tracing.stop();
      return;
    }
    const tracePath = testInfo.outputPath("trace.zip");
    await context.tracing.stop({ path: tracePath });
    await testInfo.attach("trace", { path: tracePath, contentType: "application/zip" });
  } catch {
    // The app is already gone (it crashed, or the test made it quit), and its trace with it.
  }
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  electronApp: async ({}, use, testInfo) => {
    // Every test gets a clean profile, so tests never share state and can run in parallel.
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hybrid-demo-"));
    try {
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        HYBRID_DEMO_USER_DATA: userDataDir,
      };
      // Inherited from some IDE terminals; with it Electron starts as plain Node and the launch fails.
      delete env.ELECTRON_RUN_AS_NODE;

      const electronApp = await electron.launch({ args: [PROJECT_ROOT], env });
      try {
        // The test runner's `trace` option does not record Electron windows, so the trace is recorded here.
        const context = electronApp.context();
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        await use(electronApp);
        await keepTraceOnFailure(context, testInfo);
      } finally {
        await closeApp(electronApp);
      }
    } finally {
      await fs.rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await use(new MainWindow(page));

    // An uncaught exception in the renderer is a defect even when the assertions happened to pass.
    expect(pageErrors, "uncaught errors in the renderer").toEqual([]);
  },

  // Appium and its desktop session are started once per worker, and only for tests that ask for them.
  native: [
    async ({}, use, workerInfo) => {
      const server = await startAppiumServer(PROJECT_ROOT, `appium-worker-${workerInfo.workerIndex}`);
      try {
        const native = await NativeDriver.connect(server);
        await use(native);
        await native.disconnect();
      } finally {
        server.stop();
      }
    },
    { scope: "worker", timeout: 120_000 },
  ],

  nativeUi: async ({ electronApp, mainWindow, native }, use, testInfo) => {
    // The handle is the one exact link between a Playwright page and its window in UI Automation.
    const browserWindow = await electronApp.browserWindow(mainWindow.page);
    const hwnd = await browserWindow.evaluate((win) => win.getNativeWindowHandle().readBigUInt64LE(0).toString());
    const appWindow = () => native.windowByHandle(hwnd);

    await use({
      fileDialog: new FileDialog(native, appWindow),
      messageBox: new MessageBox(native, appWindow),
      dockedPanel: new NativePanel(native, () => appWindow().$('./*[@AutomationId="nativePanel"]')),
      // The panel window belongs to another process, so it is found through that process: the one this
      // app instance started. Its AutomationId alone would also match the panel of another instance.
      panelWindow: async () => {
        const appPid = await electronApp.evaluate(() => process.pid);
        let panelPid: number | undefined;
        await expect
          .poll(async () => (panelPid = await childProcessId(appPid, NATIVE_PANEL_IMAGE)), {
            message: "the app starts its native panel process",
          })
          .toBeDefined();
        return new NativePanel(native, () => native.windowByProcess(panelPid!));
      },
    });

    await attachDesktopOnFailure(native, testInfo);
  },

  standalonePanel: async ({ native }, use, testInfo) => {
    const panelProcess = spawn(NATIVE_PANEL_EXE, { stdio: "ignore" });
    try {
      const panel = new NativePanel(native, () => native.windowByProcess(panelProcess.pid!));
      await panel.waitUntilOpen();
      await use(panel);
      await attachDesktopOnFailure(native, testInfo);
    } finally {
      panelProcess.kill();
    }
  },
});

export { expect } from "@playwright/test";
