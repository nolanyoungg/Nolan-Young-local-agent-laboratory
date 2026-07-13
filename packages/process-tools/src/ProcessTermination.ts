import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

const waitForExit = async (
  child: ChildProcessWithoutNullStreams,
  milliseconds: number,
): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  ]);
};

const terminateWindowsTree = async (pid: number): Promise<void> => {
  const systemRoot =
    process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  const taskkill = spawn(
    path.join(systemRoot, "System32", "taskkill.exe"),
    ["/pid", String(pid), "/t", "/f"],
    { shell: false, windowsHide: true, stdio: "ignore" },
  );
  await new Promise<void>((resolve) => {
    taskkill.once("error", () => resolve());
    taskkill.once("exit", () => resolve());
  });
};

export async function terminateProcess(
  child: ChildProcessWithoutNullStreams,
  graceMilliseconds = 2_000,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid !== undefined) {
    await terminateWindowsTree(child.pid);
    await waitForExit(child, graceMilliseconds);
    return;
  }
  try {
    if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await waitForExit(child, graceMilliseconds);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}
