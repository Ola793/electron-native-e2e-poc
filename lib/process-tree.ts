import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Process id of a direct child of `parentPid` with the given image name, or undefined if there is none.
 * This is how a companion process is tied to the app instance that started it.
 */
export async function childProcessId(parentPid: number, imageName: string) {
  const query = `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${parentPid} AND Name='${imageName}'").ProcessId`;
  const { stdout } = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", query]);
  const pid = Number.parseInt(stdout.trim().split(/\s+/)[0], 10);
  return Number.isNaN(pid) ? undefined : pid;
}
