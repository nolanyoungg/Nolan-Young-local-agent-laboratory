import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RunDirectoryManager, TraceRecorder, redact } from "../src/index.js";
describe("tracing", () => {
  it("creates complete run metadata and ordered redacted local traces", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "tracing-"));
    const run = await RunDirectoryManager.create(base, "code-editor", {
      token: "hidden",
      workspace: "fixture",
    });
    const recorder = new TraceRecorder(run.runId, run.tracePath);
    await recorder.record("workflow_started", {
      password: "bad",
      message: "token=visible",
    });
    await recorder.record("workflow_completed");
    const events = (await readFile(run.tracePath, "utf8"))
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            sequence: number;
            data: Record<string, unknown>;
          },
      );
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(events[0]?.data.password).toBe("[REDACTED]");
    expect(JSON.stringify(events[0])).not.toContain("visible");
    const metadata = await readFile(
      path.join(run.directory, "run-metadata.json"),
      "utf8",
    );
    expect(metadata).not.toContain("hidden");
  });
  it("redacts secret keys and private-key blocks", () => {
    expect(redact({ authorization: "Bearer abc", safe: "ok" })).toEqual({
      authorization: "[REDACTED]",
      safe: "ok",
    });
    expect(
      String(
        redact(
          "-----BEGIN TEST PRIVATE KEY-----abc-----END TEST PRIVATE KEY-----",
        ),
      ),
    ).not.toContain("abc");
  });
});
