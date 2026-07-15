import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TraceRecorder, redact } from "../src/index.js";
describe("tracing", () => {
  it("creates ordered redacted local traces", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "tracing-"));
    const tracePath = path.join(base, "trace.jsonl");
    const recorder = new TraceRecorder("run", tracePath);
    await recorder.record("agent_started", {
      password: "bad",
      message: "token=visible",
    });
    await recorder.record("agent_completed");
    const events = (await readFile(tracePath, "utf8"))
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
