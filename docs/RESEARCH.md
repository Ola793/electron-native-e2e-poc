# E2E tests for a hybrid Electron + native Windows app: research and PoC results

Date: 2026-10-02. Machine: Windows 11 Home (build 26200), 2560x1600 display at 150% scaling, Developer Mode off.
Everything was installed and run without elevation (the account is an administrator behind UAC; a standard user
account was not tested separately).

Labels used below: **[verified]** means reproduced hands-on on this machine as part of the PoC; **[sources]** means
taken from documentation, repositories and articles and re-checked against primary sources (npm, GitHub API,
official docs), but not run by hand.

## 1. Conclusion

The working setup is **one runner (Playwright Test, TypeScript) and two drivers in the same test**:

| What is tested                                                                 | With                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Everything Chromium renders, plus the Electron main process                    | Playwright `_electron`                                                |
| Native windows, native child windows inside the Electron window, OS dialogs    | Windows UI Automation: Appium 3 + NovaWindows driver, WebdriverIO client |

WinAppDriver is not used as the base: it is abandoned and needs administrator rights. FlaUI as a C# library means a
second language and a second runner; FlaUI.WebDriver (the same FlaUI behind the WebDriver protocol) was tried as a
fallback: the same scenarios pass with the same client and the same locators (details and the cost of switching are
in section 4).

The PoC is built and works: 16 tests, three full runs in a row without failures (section 2).

## 2. What was verified on this machine

### Environment

Everything installs locally into the project, without admin rights and without Developer Mode:

| Component                   | Version |
| --------------------------- | ------- |
| Node.js                     | 22.20.0 (the run was repeated on 20.19.4) |
| electron                    | 44.5.1  |
| @playwright/test            | 1.63.0  |
| appium                      | 3.8.0   |
| appium-novawindows-driver   | 1.4.5   |
| webdriverio (client)        | 9.32.0  |

The native part of the demo app (WinForms) is compiled with the `csc.exe` built into Windows (.NET Framework 4.8),
so no .NET SDK was needed.

### Demo app

The real product was not available, so the PoC is built on a stand-in with the same seams hybrids have:

1. web UI in the renderer;
2. main process (IPC, application menu);
3. native OS dialogs: open-file dialog and message box;
4. a native window of a separate process (WinForms) that talks to Electron;
5. the same native window embedded into the Electron window as a child HWND (`SetParent`).

### Tests and results

| Project    | What is inside                                                                                   | Tests | Time                         |
| ---------- | ------------------------------------------------------------------------------------------------ | ----- | ---------------------------- |
| `electron` | Playwright only: renderer, main process, dialogs and menu through stubs                           | 6     | ~2-3 s, 6 workers in parallel |
| `desktop`  | Playwright + UI Automation: real OS dialogs, native panel (own window and docked), native panel without Electron | 10 | ~29 s, one at a time |

Stability (final version of the code):

- the whole suite (`npm test`) three times in a row: 16 of 16 each time, 32-37 s per run;
- `electron` x10 in parallel: 60 of 60;
- `desktop` with repeats, four series: 49 of 50, 50 of 50, 100 of 100, 100 of 100. That is **one failure in 300
  executions**. Which test failed could not be established: the artifacts of that series were overwritten by the
  next run, and the 250 executions after it were clean. The most likely explanation is the single step that uses
  the real mouse (the "Open" button of the file dialog): the series ran on a machine that was in use at the time.
  This is an assumption, not an established fact;
- no app processes and no temporary profiles are left behind after the runs.

Failure behaviour was checked too: a test that fails with a native message box still open finishes cleanly, the
app is killed after a timeout together with its process tree, and the artifacts contain the trace, the screenshot
of the web content and a screenshot of the whole desktop showing the native dialog.

### Speed of the native driver (NovaWindows) [verified]

| Operation                                       | Time                     |
| ----------------------------------------------- | ------------------------ |
| Appium server start                             | 3-11 s, once per worker  |
| Creating the desktop session                    | ~0.6 s                   |
| Finding an element                              | 60-250 ms                |
| Action through a UIA pattern (invoke, setValue) | 50-300 ms                |
| The whole real open-file dialog flow            | ~1 s                     |

Issue #86 of the driver reports severe slowness (45 s versus 2-3 s with WinAppDriver). That does not show in these
scenarios, but speed has to be re-measured on the real app with its larger element tree.

## 3. Electron side: Playwright

**[sources]**

- Electron support in Playwright is still labelled experimental, but the API has not broken for years. It exists
  only in Node.js/TypeScript: the .NET and Python requests were closed as "not planned" (May 2026). Hence the runner
  is in TypeScript.
- In spring 2026 the Playwright team moved the Electron API into a separate `@playwright/electron` package and
  reverted it three weeks later because packaged apps broke. Takeaway: pin the Playwright version and run a smoke
  test after every upgrade.
- Launch works like this: Playwright starts the exe with `--inspect=0 --remote-debugging-port=0`. If the packaged
  build has the `EnableNodeCliInspectArguments` fuse disabled, the launch fails. The Electron Forge template disables
  this fuse by default; electron-builder does not touch fuses unless configured to. **This is the first question
  for the developers.**
- A possible workaround if the fuse is off and no test build is offered: start the exe with
  `--remote-debugging-port` and attach with `chromium.connectOverCDP`. Only renderer windows work; there is no
  access to the main process, and therefore no dialog stubs. **Unconfirmed:** the only source is one pull request
  in a little-known repository, and the Electron docs do not say whether the fuse affects this switch. Try it on
  the real build.
- The synchronous dialog variants (`showOpenDialogSync`, `showMessageBoxSync`) block the main process: while such a
  dialog is open, `electronApp.evaluate` cannot run, and only the native driver can close the dialog.
- Since Electron 43 the file dialog opens in Downloads by default and does not remember the last folder.
- Playwright cannot see native dialogs, menus, the tray or notifications. The official recipe is to replace
  `dialog.*` in the main process through `electronApp.evaluate`.
- The public test suites of VS Code, Signal Desktop and GitHub Desktop are built the same way: Playwright plus
  stubs, no UIA driver. No mature public example of "Electron + native Windows windows in one test" was found, so
  the combination had to be assembled and verified here.

**[verified]**

- Playwright 1.63 works with Electron 44.5.1, although Playwright's own CI runs against Electron 42.
- Electron 42+ does not download its binary during `npm install`. It has to be installed explicitly
  (`npx install-electron --no`); otherwise the download starts inside the first test launch and hits the timeout.
- `electronApp.process().pid` on Windows is the pid of the `cmd.exe` wrapper, not of Electron. The real pid:
  `electronApp.evaluate(() => process.pid)`.
- Runner options: the screenshot on failure is taken automatically for Electron windows, the trace is not (the
  archive holds only runner steps, no DOM snapshots). The trace is recorded by our fixture through
  `context().tracing`.
- `electronApp.close()` has no timeout and hangs while a native modal dialog is open. The fixture waits 5 s and
  then runs `taskkill /T` on the process tree.
- A real open-file dialog does **not** hang Playwright: `click()` returns and the page stays responsive. Verified
  for the asynchronous `dialog.showOpenDialog` and `showMessageBox`.
- On Electron 44.5.1 the file dialog opened in Downloads, so the test types the full path instead of navigating
  folders. Windows returns the path as it is spelled on disk, so it has to be compared case-insensitively.
- An Appium session is closed by default after 60 s without a command. A session that lives as long as the worker
  needs `appium:newCommandTimeout: 0`; verified with a test that pauses for 65 s.
- `session.execute("windows: ...", element)` does not wait for the element to appear (unlike `click()` and
  `getText()`), so the wait was added in `lib/native-driver.ts`.

## 4. Native side: driver comparison

| Tool | Status [sources] | Requirements | Verdict |
| ---- | ---------------- | ------------ | ------- |
| **WinAppDriver** (Microsoft) | Abandoned: last stable release 1.2.1 on 2020-11-05 | Developer Mode and an MSI install, both need admin rights | Not a base. Upside: preinstalled on GitHub-hosted runners |
| **appium-windows-driver** | Maintained (6.3.0, 2026-09-14), but it is a proxy to WinAppDriver; its own README recommends NovaWindows | The same, plus Appium 3 | Only as a fallback for CI |
| **appium-novawindows-driver** | 1.4.5 on 2026-08-27. Recommended in the Appium docs as the replacement. A young project with essentially one maintainer; version 2.0 with a C# backend is still in preview | Appium 3, Node >= 20.19. No WinAppDriver, no Developer Mode, no .NET | **Chosen. [verified]** |
| **FlaUI** (C#) | The most mature library (5.0.0, 2025-02-25, repository active) | .NET SDK, tests in C# | A second language and runner; from C# Electron is reachable only over CDP |
| **FlaUI.WebDriver** | 0.4.0 on 2025-07-22, calls itself experimental, no commits since July 2025 | One self-contained exe, no .NET and no admin rights | **Fallback. [verified]** |
| **pywinauto** | 0.6.9 on 2025-01-06, compatibility with Python 3.14 not confirmed | Python | A third language, not considered |
| **winapp CLI** (`winapp ui`, Microsoft) | 0.7.1 on 2026-10-01, public preview; UIA commands with JSON output | npm or winget | Worth watching; still a preview and one process per command |
| nut.js, robotjs | Coordinate clicks; prebuilt nut.js packages are paid | - | Do not use |

### NovaWindows: hands-on findings [verified]

- It installs as an ordinary dev dependency of the project; Appium picks the driver up from `package.json` with no
  global install. Defender did not react to the driver's PowerShell backend (the driver's docs describe that risk).
- The driver **deliberately hides everything Chromium exposes**. To it the Electron window is an empty frame, and
  `--force-renderer-accessibility` does not change that. For us this is an advantage: the two drivers' areas of
  responsibility do not overlap.
- The Electron application menu on Windows is not a Win32 menu; Chromium draws it, so it is not reachable through
  UIA. The menu is driven from the main process: `Menu.getApplicationMenu().getMenuItemById(id).click()`.
- Dialogs opened with an owner window (file dialog, message box) sit **inside** the Electron window in the UIA
  tree. So does a native child HWND. A separate window of another process sits at the top level of the desktop.
- UIA patterns work without focus and without the mouse: `windows: invoke`, `setValue`, `toggle`,
  `expand`/`select`, `close`. Non-ASCII text passes through `setValue`.
- The "Open" button of the file dialog has no InvokePattern (it is a split button), so it needs a real mouse click.
  At 150% scaling the click lands correctly, although issue #85 of the driver describes misses on HiDPI displays.

### FlaUI.WebDriver as plan B [verified]

The same scenarios (real file dialog, docked panel, separate window) passed in a separate trial script with the
same WebdriverIO client and the same locators. That variant is not in the repository. Switching is more than
changing the server address: FlaUI.WebDriver has none of the `windows: invoke/setValue/toggle...` commands that
`lib/native-driver.ts` is built on; the trial used plain `click()` and `setValue()`. A switch means rewriting the
action layer in that file and the server launcher (`lib/appium-server.ts`); the page objects and tests stay as they
are. Differences:

- sessions are created faster (0.01-0.2 s); the server is a single 190 MB exe;
- it works through UIA3 and **sees the Electron web content** without any flags (from Electron 37 Chromium's native
  UIA provider is on by default);
- text input goes through keyboard emulation (the file path takes about 3 s), so it depends on focus;
- the project is formally experimental and has not been updated for a long time.

## 5. How the two drivers work in one test

```
test("opens a file picked in the Windows file dialog", async ({ mainWindow, nativeUi }) => {
  await mainWindow.openFileButton.click();          // Playwright: click in the renderer
  await nativeUi.fileDialog.open(filePath);         // UI Automation: the real Windows dialog
  await expect(mainWindow.selectedFile).toHaveText(filePath);   // Playwright: check the result
});
```

- **The handover** goes through the window handle: `electronApp.browserWindow(page)` ->
  `getNativeWindowHandle()` -> the UIA element with RuntimeId `42.<hwnd>`. Title search is not used.
- **One UIA session per worker** for the whole desktop ("Root"). Windows are looked up only among the direct
  children of the desktop and only by a key that one window alone has: its handle or its process id. Searching all
  descendants is slow and can match another application. AutomationId is fine for controls inside a window that is
  already found, but not for the window itself: a second instance of the app has the same one.
- **The companion process window** is found through the process tree: the pid of the Electron main process -> its
  child process `NativePanel.exe` -> that process's window (`lib/process-tree.ts`). No hooks in the app are needed.
- **Appium starts lazily**, only when a test asks for the native fixture. Tests of the `electron` project do not
  wait for it.
- **After a native step the state is checked through Playwright**, not through focus or pauses.

## 6. Stability rules

1. Web content: Playwright only. Native UI: UIA only.
2. Dialogs are stubbed by default; the real dialog is used only where the dialog itself is under test. Pyramid:
   unit -> IPC integration -> E2E on stubs (the bulk) -> a small set of real hybrid scenarios.
3. Native locators: AutomationId first. Names supplied by the OS itself ("Open", "File name") depend on the Windows
   display language; the open-file dialog has numeric ids (file name field `1148`, buttons `1` and `2`). The save
   dialog was not checked.
4. Actions go through UIA patterns; a real click only where there is no pattern.
5. No fixed pauses: Playwright web-first assertions, `expect.poll` and `waitForExist` for native elements.
6. Every test starts its own app instance with its own temporary profile.
7. Native tests run one at a time per desktop (`workers: 1`) and in a separate invocation from the parallel
   Electron tests: a machine has one desktop, one focus and one mouse. Scale by sharding across machines. Named
   locks from Playwright 1.63 only serialise tests that share a lock and do not protect against other windows.
8. For the developers: native controls need stable AutomationIds (in WinForms that is `Name`, in WPF
   `AutomationProperties.AutomationId`).

## 7. CI [sources]

- On GitHub-hosted Windows runners UI Automation works in practice: Microsoft runs the Calculator UI tests there
  and Playwright runs its own Electron tests. Officially GitHub does not guarantee an interactive desktop.
- The default resolution is 1024x768; it is changed with `Set-DisplayResolution -Width 1920 -Height 1080 -Force`.
- Hosted runners are Windows Server, not the Windows 11 client.
- Self-hosted: the agent has to run as an interactive process under auto-logon, not as a service. Closing RDP locks
  the session (fixed with `tscon`), and the screen must not lock.
- No public example of NovaWindows on hosted runners was found. The CI fallback, should it stop working there, is
  appium-windows-driver with the WinAppDriver that is preinstalled on the runners.

**[verified]** The workflow `.github/workflows/e2e.yml` was run on 2026-10-02 on a GitHub-hosted `windows-2025`
runner and passed on the first attempt, with no test retries:

- native tests: 10 of 10 in ~30 s (the whole job takes about 2 minutes including setup);
- Electron tests: 6 of 6 in ~8 s; on the runner Playwright used a single worker, so there is no parallelism there;
- `Set-DisplayResolution` worked, and NovaWindows and the real mouse click in the file dialog work on the runner.

This is a handful of runs, not statistics: stability on the runner still has to be established over time.

## 8. Risks

| Risk | What to do |
| ---- | ---------- |
| The packaged build of the product has the `EnableNodeCliInspectArguments` fuse disabled | Check with `npx @electron/fuses read --app <exe>`. Ask for a test build with the fuse on. The CDP workaround is unconfirmed and has to be tried on the real build |
| NovaWindows is a young project with one maintainer | All access to the driver is in one file (`lib/native-driver.ts`); the same scenarios pass on FlaUI.WebDriver, and switching means rewriting that file and the server launcher |
| A native component runs elevated | A normal process cannot drive elevated windows (UIPI). Find out from the developers |
| Native controls have no AutomationId | Ask for them to be added; until then the locators are fragile |
| Experimental status of Electron support in Playwright | Pin the version, smoke-test after every upgrade |
| Node 20 went out of support on 2026-04-30; Appium 4 (beta) does not support it | The project's baseline is Node 22 |
| The PoC is built on a stand-in, not on the real product | The next step is to connect the real build |

## 9. Questions for the product's developers

1. Which Electron version, which packager (Forge or electron-builder), and which fuses are set in the build?
2. What are the native components written in (WPF, WinForms, Win32/C++)? Are they a separate process, separate
   windows, or child windows inside the Electron window? Is there a WebView2 inside?
3. Do the native controls have AutomationIds?
4. Does anything run elevated?
5. Are dialogs called asynchronously (`showOpenDialog`) or synchronously (`showOpenDialogSync`)?
6. Is a dev build or the repository available, not only the installer?
7. Where will CI run: GitHub-hosted, an in-house server, virtual machines?

## 10. Sources

No article was found that covers exactly "Electron + native Windows windows in one suite": the solution is put
together from three well-documented parts. Three Medium articles could not be opened (HTTP 403) and are not listed.

**Electron and Playwright**

- [Playwright: class Electron](https://playwright.dev/docs/api/class-electron) - status, launch options, the fuse, the dialog-stub recipe.
- [Playwright: ElectronApplication](https://playwright.dev/docs/api/class-electronapplication) - `evaluate`, `browserWindow(page)`, `process()`.
- [Source of the Electron launcher in Playwright 1.63](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/electron/electron.ts) - how exactly the app is started.
- [PR #40733: revert of moving the Electron API to a separate package](https://github.com/microsoft/playwright/pull/40733) (2026-05-09).
- [Issue #39477: what "experimental" means](https://github.com/microsoft/playwright/issues/39477) (2026-03).
- [Electron: Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing) and [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses).
- [Electron: Breaking Changes](https://github.com/electron/electron/blob/main/docs/breaking-changes.md) - 42: the binary is not downloaded on install; 43: default dialog folder.
- [electron-playwright-helpers](https://github.com/spaceagetv/electron-playwright-helpers) (3.1.2, 2026-08-10) - ready-made dialog stubs, menu clicks, IPC.
- [Electron App Testing Guide, qaskills.sh](https://qaskills.sh/blog/electron-app-testing-guide) (2026-07-10) - strategy and test pyramid.
- [Electron testing with CircleCI](https://circleci.com/blog/electron-testing) (updated 2026-06-29) - project skeleton and CI.
- [Testing Electron Apps with Playwright, Kubeshop](https://dev.to/kubeshop/testing-electron-apps-with-playwright-3f89) (2022, details outdated) - experience from a real project.
- [chevron PR #364](https://github.com/builtbygio/chevron/pull/364) (2026-09-06) - attaching over CDP with the fuse disabled.

**Native drivers**

- [Appium: Ecosystem - Drivers](https://appium.io/docs/en/latest/ecosystem/drivers/) (2026-08-24) - WinAppDriver is unmaintained, NovaWindows is recommended.
- [appium-novawindows-driver](https://github.com/AutomateThePlanet/appium-novawindows-driver) (1.4.5) - capabilities, `windows:` commands; issues #48, #85, #86, #96.
- [appium-windows-driver](https://github.com/appium/appium-windows-driver) (6.3.0) - WinAppDriver requirements.
- [Update on WinAppDriver, issue #1550](https://github.com/microsoft/WinAppDriver/issues/1550) (2021-07-01) - the last official status.
- [FlaUI](https://github.com/FlaUI/FlaUI) and [FlaUI.WebDriver](https://github.com/FlaUI/FlaUI.WebDriver).
- [winapp CLI: UI Automation](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/ui-automation) (2026-09-24).
- [UI Automated Testing for Desktop Apps: FlaUI in Practice](https://comcomponent.com/en/blog/windows-desktop-ui-automation-testing/) (2026-07-03) - the best recent overview of the native side and of CI requirements.
- [FlaUI in practice, Habr](https://habr.com/ru/articles/943650/) (2025-09-03) - locator priority, waits instead of pauses.
- [UI tests: how to organise the code, Habr](https://habr.com/ru/post/914636) (2025-05-31) - framework structure.

**Hybrid setups and accessibility**

- [Native UI Automation for Windows in Chromium](https://developer.chrome.com/blog/windows-uia-support-update) (2025-08-14) - native UIA provider from Chrome 138.
- [Microsoft Learn: WebView2 and WebDriver](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver) - the official description of the "native driver + web driver" setup.
- [Playwright + Appium + WebdriverIO, Habr, Fix Price](https://habr.com/ru/companies/fix_price/articles/1020244/) (2026-04-07) - the same two-driver idea on Android.
- [TTC Global: Playwright and FlaUI.WebDriver](https://ttcglobal.com/what-we-think/blog/playwright-selenium-desktop-application-automation-testing) (2024-06-18).
- [qavajs/playwright-wdio-fixtures](https://github.com/qavajs/playwright-wdio-fixtures) - ready-made WebdriverIO fixtures for Playwright Test.

**CI and stability**

- [Azure Pipelines: Configure for UI testing](https://learn.microsoft.com/en-us/azure/devops/pipelines/test/ui-testing-considerations?view=azure-devops) - interactive agent, auto-logon, `tscon`.
- [microsoft/calculator: action-ci.yml](https://github.com/microsoft/calculator/blob/main/.github/workflows/action-ci.yml) - UI tests on a hosted runner.
- [files-community/Files: ci.yml](https://github.com/files-community/Files/blob/main/.github/workflows/ci.yml) - Appium 3 and WinAppDriver on a hosted runner.
- [Playwright: Parallelism](https://playwright.dev/docs/test-parallel) - per-project workers, named locks, sharding.
- [UI Automation Security Overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-securityoverview) - the UIPI restriction.
- [VS Code smoke tests](https://github.com/microsoft/vscode/blob/main/test/smoke/README.md) - do not depend on focus, wait for DOM state.
