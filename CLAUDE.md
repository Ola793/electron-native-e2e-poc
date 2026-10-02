# electron-native-e2e-poc

E2E test PoC for a hybrid Electron + native Windows app. Read `README.md` first: it has the layout, the
commands and the conventions every test must follow. The reasoning behind the stack is in `docs/RESEARCH.md`.

## Running things

- Node 22 is required for installing (`.nvmrc`).
- `npm run test:electron` does not use the mouse or UI Automation, but it opens real Electron windows.
- `npm run test:desktop` and `npm test` open real windows on the user's desktop and move the real mouse.
- Never run two test commands at once, `test:electron` included: its windows cover the native dialogs a
  desktop run is working with.
- After changing `native/NativePanel.cs`, run `npm run build:native`. It must stay C# 5: it is compiled with
  the .NET Framework `csc.exe` that ships with Windows.
- `npm run typecheck` before finishing a change to `lib/`, `pages/` or `tests/`.

## Facts that are easy to get wrong

- `electronApp.process().pid` is the `cmd.exe` wrapper on Windows, not Electron. Use
  `electronApp.evaluate(() => process.pid)` or the window handle.
- The NovaWindows driver hides everything Chromium renders, including Electron's menu bar. Menus are driven
  from the main process (`Menu.getApplicationMenu().getMenuItemById(...).click()`), web content by Playwright.
- The runner's `trace` option does not record Electron windows; the `electronApp` fixture records the trace.
- A native modal dialog left open blocks `electronApp.close()`; the fixture kills the process tree after a
  timeout.
- `session.execute("windows: ...", element)` does not wait for the element. Go through `NativeDriver`
  (`invoke`, `fill`, `toggle`, `selectOption`, `closeWindow`), which does.
