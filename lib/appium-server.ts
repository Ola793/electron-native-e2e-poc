import { ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const HOST = "127.0.0.1";
const START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;

export type AppiumServer = {
  hostname: string;
  port: number;
  stop: () => void;
};

// A port nobody listens on, so the server that answers on it later can only be the one started here.
function freePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function isReady(port: number) {
  try {
    return (await fetch(`http://${HOST}:${port}/status`)).ok;
  } catch {
    return false;
  }
}

/**
 * Starts the project-local Appium server for one Playwright worker.
 * `logName` must be unique per worker process: Appium deletes an existing log file when it starts.
 */
export async function startAppiumServer(projectRoot: string, logName: string): Promise<AppiumServer> {
  const port = await freePort();
  const logDir = path.join(projectRoot, "logs");
  fs.mkdirSync(logDir, { recursive: true });

  // Appium finds the drivers installed in this project by walking up from its working directory,
  // and only when APPIUM_HOME does not point somewhere else.
  const env = { ...process.env };
  delete env.APPIUM_HOME;

  const server: ChildProcess = spawn(
    process.execPath,
    [
      path.join(path.dirname(require.resolve("appium/package.json")), "index.js"),
      "--address",
      HOST,
      "--port",
      String(port),
      "--log",
      path.join(logDir, `${logName}.log`),
      "--log-level",
      "error:info",
    ],
    { cwd: projectRoot, env, stdio: "ignore" }
  );

  let exitCode: number | null = null;
  server.on("exit", (code) => (exitCode = code ?? 1));

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!(await isReady(port))) {
    if (exitCode !== null) throw new Error(`Appium exited with code ${exitCode} before it was ready (port ${port})`);
    if (Date.now() > deadline) {
      server.kill();
      throw new Error(`Appium did not become ready on port ${port} within ${START_TIMEOUT_MS} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { hostname: HOST, port, stop: () => server.kill() };
}
