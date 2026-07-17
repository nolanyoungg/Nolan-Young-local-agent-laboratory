import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import {
  type BlogGenerator,
  requiredTrackerHeaders,
  runWordPressBlogWriter,
} from "../wordpress-blog-writer.js";

const generator: BlogGenerator = {
  generate: async ({ topic, title }) =>
    `---\ntitle: "${title || topic}"\n---\n# ${title || topic}\n\n## 1. Define the outcome and the reader\n\nDetailed, topic-specific guidance for ${topic}.\n\n## 8. Maintain and improve the work\n\nReview and improve ${topic}.\n`,
};

const createTracker = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordpress-blog-writer-"));
  const tracker = path.join(root, "content.xlsx");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Content");
  sheet.addRow(requiredTrackerHeaders);
  sheet.addRow([
    "blog-1",
    "How to build a WordPress website",
    "How to build a WordPress website",
    "pending",
    false,
    "2026-01-01",
    "",
    "",
    "",
  ]);
  sheet.addRow([
    "blog-2",
    "How to build a WordPress plugin for beginners",
    "",
    "pending",
    false,
    "2026-01-02",
    "",
    "",
    "",
  ]);
  sheet.addRow([
    "blog-3",
    "How to choose a hosting provider",
    "How to choose a hosting provider",
    "pending",
    false,
    "2026-01-03",
    "",
    "",
    "",
  ]);
  await book.xlsx.writeFile(tracker);
  return tracker;
};
describe("WordPress blog writer workflow", () => {
  it("writes and sends three distinct WordPress-ready markdown drafts, then advances each completed row", async () => {
    const tracker = await createTracker();
    const root = path.dirname(tracker);
    const emails: { recipient: string; markdown: string }[] = [];
    const delivery = {
      send: async (input: {
        recipient: string;
        subject: string;
        markdown: string;
        idempotencyKey: string;
      }) => {
        emails.push(input);
        return { messageId: `message-${emails.length}` };
      },
    };
    for (const id of ["blog-1", "blog-2", "blog-3"])
      await expect(
        runWordPressBlogWriter({
          tracker,
          outputDirectory: path.join(root, "drafts"),
          recipient: "nolanyoung7@yahoo.com",
          approve: true,
          send: true,
          confirmBlogId: id,
          now: new Date("2026-07-16T12:00:00Z"),
          delivery,
          generator,
        }),
      ).resolves.toMatchObject({ blogId: id, delivery: "sent" });
    expect(emails).toHaveLength(3);
    expect(
      emails.every((email) => email.recipient === "nolanyoung7@yahoo.com"),
    ).toBe(true);
    for (const email of emails)
      expect(email.markdown).toMatch(/^---[\s\S]*# /m);
    for (const email of emails)
      expect(email.markdown).toMatch(
        /## 1\. Define the outcome and the reader[\s\S]*## 8\. Maintain and improve the work/m,
      );
    expect(emails[0]!.markdown).toContain("How to build a WordPress website");
    expect(emails[1]!.markdown).toContain(
      "How to build a WordPress plugin for beginners",
    );
    expect(emails[2]!.markdown).toContain("How to choose a hosting provider");
    expect(
      emails.some((email) => email.markdown.includes("[RESEARCH NEEDED:")),
    ).toBe(false);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(tracker);
    const sheet = book.getWorksheet("Content")!;
    for (const number of [2, 3, 4]) {
      expect(sheet.getRow(number).getCell(5).value).toBe(true);
      expect(sheet.getRow(number).getCell(4).value).toBe("completed");
      expect(sheet.getRow(number).getCell(8).value).toBeTruthy();
    }
  });
  it("does not mutate the tracker when the confirmation does not match the selected row", async () => {
    const tracker = await createTracker();
    await expect(
      runWordPressBlogWriter({
        tracker,
        outputDirectory: path.join(path.dirname(tracker), "drafts"),
        recipient: "nolanyoung7@yahoo.com",
        approve: true,
        send: true,
        confirmBlogId: "blog-2",
        generator,
      }),
    ).rejects.toThrow("--confirm blog-1");
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(tracker);
    expect(book.getWorksheet("Content")!.getRow(2).getCell(5).value).toBe(
      false,
    );
  });
  it("creates a draft preview without mutating the selected tracker row", async () => {
    const tracker = await createTracker();
    const result = await runWordPressBlogWriter({
      tracker,
      outputDirectory: path.join(path.dirname(tracker), "drafts"),
      recipient: "nolanyoung7@yahoo.com",
      generator,
    });
    await expect(result.draftPath).toBeTruthy();
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(tracker);
    const row = book.getWorksheet("Content")!.getRow(2);
    expect(row.getCell(4).value).toBe("pending");
    expect(row.getCell(5).value).toBe(false);
    expect(row.getCell(7).value).toBe("");
  });
  it("rejects duplicate Blog IDs and invalid scheduled dates before drafting or sending", async () => {
    const tracker = await createTracker();
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(tracker);
    const sheet = book.getWorksheet("Content")!;
    sheet.getRow(3).getCell(1).value = "blog-1";
    await book.xlsx.writeFile(tracker);
    await expect(
      runWordPressBlogWriter({
        tracker,
        outputDirectory: path.join(path.dirname(tracker), "drafts"),
        recipient: "nolanyoung7@yahoo.com",
        generator,
      }),
    ).rejects.toThrow("Duplicate Blog ID blog-1");
    sheet.getRow(3).getCell(1).value = "blog-2";
    sheet.getRow(3).getCell(6).value = "not-a-date";
    await book.xlsx.writeFile(tracker);
    await expect(
      runWordPressBlogWriter({
        tracker,
        outputDirectory: path.join(path.dirname(tracker), "drafts"),
        recipient: "nolanyoung7@yahoo.com",
        generator,
      }),
    ).rejects.toThrow("Invalid Scheduled Date in row 3");
  });
  it("delivers a blog.md attachment to the requested recipient through the configured provider", async () => {
    const tracker = await createTracker();
    const originalKey = process.env.RESEND_API_KEY;
    const originalSender = process.env.BLOG_EMAIL_SENDER;
    const requests: RequestInit[] = [];
    const request = vi.fn(async (_input: string, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response(JSON.stringify({ id: "provider-message-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    process.env.RESEND_API_KEY = "test-key";
    process.env.BLOG_EMAIL_SENDER = "blogs@example.test";
    vi.stubGlobal("fetch", request);
    try {
      await runWordPressBlogWriter({
        tracker,
        outputDirectory: path.join(path.dirname(tracker), "drafts"),
        recipient: "nolanyoung7@yahoo.com",
        approve: true,
        send: true,
        confirmBlogId: "blog-1",
        generator,
      });
      const payload = JSON.parse(String(requests[0]?.body)) as {
        to: string[];
        attachments: { filename: string; content: string }[];
      };
      expect(payload.to).toEqual(["nolanyoung7@yahoo.com"]);
      expect(payload.attachments[0]).toMatchObject({ filename: "blog.md" });
      expect(
        Buffer.from(payload.attachments[0]!.content, "base64").toString(),
      ).toContain("# How to build a WordPress website");
    } finally {
      vi.unstubAllGlobals();
      if (originalKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = originalKey;
      if (originalSender === undefined) delete process.env.BLOG_EMAIL_SENDER;
      else process.env.BLOG_EMAIL_SENDER = originalSender;
    }
  });
});
