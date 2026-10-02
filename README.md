# electron-native-e2e-poc

Proof of concept: end-to-end tests for a **hybrid Windows desktop app** — an Electron app with native Windows
parts — written as one Playwright Test suite in TypeScript.

- **Playwright (`_electron`)** drives everything Chromium renders and talks to the Electron main process.
- **Windows UI Automation** (Appium 3 + NovaWindows driver, through a WebdriverIO client) drives everything
  Playwright cannot see: OS dialogs, native windows, native child windows inside the Electron window.
- Both are fixtures of the same test, so one test can click in the renderer, answer a real Windows dialog and
  assert the result back in the renderer.

Why this stack, what else was evaluated and what was measured: [docs/RESEARCH.md](docs/RESEARCH.md).

## The app under test

The real product is not in this repo. `app/` and `native/` are a small stand-in with the same seams:

| Seam                                    | In the demo app                                                   | Driven by      |
| --------------------------------------- | ----------------------------------------------------------------- | -------------- |
| Web UI                                  | Notes list (`app/renderer`)                                       | Playwright     |
| Main process                            | IPC handlers, application menu (`app/main.js`)                    | Playwright     |
| Native OS dialogs                       | Open-file dialog, confirmation message box                        | UI Automation  |
| Native window of a companion process    | WinForms panel (`native/NativePanel.cs`), talks over stdin/stdout | UI Automation  |
| Native child window inside the Electron window | The same panel, docked with `SetParent`                    | UI Automation  |

## Setup

Requirements: Windows 10/11, Node.js 22.12+ (see `.nvmrc`). No admin rights, no Developer Mode, no .NET SDK.

```powershell
npm install
npx install-electron --no     # Electron 42+ no longer downloads its binary during npm install
npm run build:native          # compiles native/bin/NativePanel.exe with the C# compiler built into Windows
```

## Running

```powershell
npm test                 # everything, one test at a time
npm run test:electron    # Playwright-only tests, in parallel
npm run test:desktop     # tests that drive native UI, one at a time
npm run show:report      # HTML report of the last run
```

Desktop tests open real windows on your desktop and one step uses the real mouse, so leave the mouse and
keyboard alone while they run (about 30 seconds).

Electron tests do not use the mouse, but they do open real app windows. Do not run them at the same time as
the desktop tests: a window opened by a parallel Electron worker can cover the native dialog a desktop test is
working with. `npm test` avoids this by running everything one at a time.

## Layout

```
app/                     demo app: Electron main process, preload, renderer
native/                  demo app: WinForms companion panel + build script
lib/fixtures.ts          test fixtures: electronApp, mainWindow, native, nativeUi, standalonePanel
lib/native-driver.ts     UI Automation access (one desktop session per worker)
lib/appium-server.ts     starts the project-local Appium server for a worker
lib/process-tree.ts      finds the companion process an app instance started
pages/MainWindow.ts      page object for the renderer (Playwright locators)
pages/native/            page objects for native UI (UI Automation locators)
tests/electron/          Playwright only; native dialogs and the menu are stubbed in the main process
tests/hybrid/            Playwright + UI Automation in the same test
tests/native/            UI Automation only: the native panel without Electron
```

## Conventions

- **Web content belongs to Playwright, native UI to UI Automation.** Never read or click web content through
  UI Automation.
- **Stub native dialogs by default** (`tests/electron`): fast and parallel. Drive the real dialog only in the
  few tests where the dialog itself is what is being tested (`tests/hybrid`).
- **Renderer locators are role-based** (`getByRole`). **Native locators are AutomationId-first**; a visible
  name is acceptable only when the app itself supplies it (button labels of a message box), never for
  OS-provided text, which changes with the Windows language.
- **Native interactions use UI Automation patterns** (`NativeDriver.invoke`, `fill`, `toggle`,
  `selectOption`): they need neither focus nor the mouse. A real `click()` is the exception and gets a comment
  saying why.
- **Find a window by a key only that window has** — its handle or its process id — among the desktop's direct
  children. The handle comes from Electron (`electronApp.browserWindow(page)`), a companion process from the
  app's process tree. Never search by title, and use AutomationId only for controls inside a window: a second
  instance of the app has the same ids.
- **No fixed sleeps.** Playwright web-first assertions for the renderer, `expect.poll` and `waitForExist` for
  native elements.
- **Every test owns its app instance and profile.** Nothing is shared between tests.
- **An uncaught error in the renderer fails the test**, even if its assertions passed (`mainWindow` fixture).

## Failure artifacts

On failure a test keeps, under `playwright-artifacts/` and in the HTML report:

- `trace.zip` — Playwright trace of the Electron windows (`npx playwright show-trace <path>`);
- Playwright's screenshot of the web content;
- `desktop.png` — screenshot of the whole desktop, the only one that shows native windows.

Appium logs go to `logs/`.

## CI

`.github/workflows/e2e.yml` runs the suite on a GitHub-hosted `windows-2025` runner on every push and pull
request: one job for the Electron tests, one for the desktop tests. Reports, traces and Appium logs are
uploaded as artifacts.
