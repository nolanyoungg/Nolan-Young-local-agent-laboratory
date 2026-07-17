import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

export const requiredTrackerHeaders = [
  "Blog ID",
  "Topic",
  "Title",
  "Status",
  "Completed",
  "Scheduled Date",
  "Draft Path",
  "Email Sent At",
  "Error",
] as const;

type Header = (typeof requiredTrackerHeaders)[number];
export interface BlogDelivery {
  send(input: {
    recipient: string;
    subject: string;
    markdown: string;
    idempotencyKey: string;
  }): Promise<{ messageId: string }>;
}
export interface BlogGenerator {
  generate(input: { topic: string; title: string }): Promise<string>;
}
export interface BlogWriterOptions {
  readonly tracker: string;
  readonly outputDirectory: string;
  readonly recipient: string;
  readonly approve?: boolean;
  readonly send?: boolean;
  readonly confirmBlogId?: string;
  readonly now?: Date;
  readonly delivery?: BlogDelivery;
  readonly generator?: BlogGenerator;
  readonly model?: string;
  readonly ollamaUrl?: string;
  readonly targetWordCount?: number;
}
export interface BlogWriterResult {
  readonly blogId: string;
  readonly draftPath: string;
  readonly delivery: "previewed" | "sent";
}

const value = (cell: ExcelJS.Cell): string => {
  const raw = cell.value;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return raw === null || raw === undefined ? "" : String(raw).trim();
};
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/(^-|-$)/gu, "") || "wordpress-blog";
const done = (text: string): boolean => /^(true|yes|1|checked)$/iu.test(text);
const pending = (text: string): boolean =>
  text === "" || /^pending$/iu.test(text);
const scheduled = (text: string, now: Date): boolean =>
  !text || Date.parse(text) <= now.getTime();
const assertValidTracker = (
  sheet: ExcelJS.Worksheet,
  column: (header: Header) => number,
): void => {
  const seenBlogIds = new Map<string, number>();
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const row = sheet.getRow(number);
    const blogId = value(row.getCell(column("Blog ID")));
    if (blogId) {
      const firstRow = seenBlogIds.get(blogId);
      if (firstRow !== undefined)
        throw new Error(
          `Duplicate Blog ID ${blogId} in rows ${firstRow} and ${number}.`,
        );
      seenBlogIds.set(blogId, number);
    }
    const scheduledDate = value(row.getCell(column("Scheduled Date")));
    if (scheduledDate && Number.isNaN(Date.parse(scheduledDate)))
      throw new Error(`Invalid Scheduled Date in row ${number}.`);
  }
};
const frontMatter = (title: string, tags: readonly string[]): string =>
  `---\ntitle: "${title.replaceAll('"', "'")}"\nslug: "${slug(title)}"\nmeta_description: "${title.replaceAll('"', "'")}"\ncategories:\n  - WordPress\ntags:\n${tags.map((tag) => `  - ${tag}`).join("\n")}\n---\n`;

// The tracker supplies the subject. This is intentionally the only blog body template.
const blog = async (
  topic: string,
  suppliedTitle: string,
  model = "qwen2.5-coder:14b",
  ollamaUrl = "http://127.0.0.1:11434",
  targetWordCount = 1200,
): Promise<string> => {
  const subject = topic || suppliedTitle || "your WordPress project";
  const title = suppliedTitle || `A practical guide to ${subject}`;
  if (!Number.isInteger(targetWordCount) || targetWordCount < 100)
    throw new Error("Word count must be a whole number of at least 100.");
  const response = await fetch(
    `${ollamaUrl.replace(/\/$/u, "")}/api/generate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        options: { num_predict: 6000, temperature: 0.55 },
        prompt: `Write a complete, original, publication-ready Markdown blog article about: ${subject}\n\nAudience: beginners who want practical, trustworthy guidance. Write at least ${targetWordCount} words. Explain the decisions, workflow, common mistakes, and a realistic example where useful. Include accurate technical details appropriate to the topic. If the topic involves WordPress, use current WordPress conventions and official WordPress links where relevant. Do not use filler, placeholders, bracketed research notes, or generic sections that could apply unchanged to an unrelated topic. Do not invent statistics, customer stories, or citations.\n\nDo not use placeholder text.\n\nReturn only the article body in Markdown. Do not include YAML front matter or a preamble.`,
      }),
    },
  );
  if (!response.ok)
    throw new Error(`Blog generation returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("response" in payload) ||
    typeof payload.response !== "string" ||
    !payload.response.trim()
  )
    throw new Error("Blog generation returned no article content.");
  const article = payload.response.trim();
  const wordCount = article.split(/\s+/u).filter(Boolean).length;
  const hasPlaceholder =
    /\b(?:lorem ipsum|placeholder|research needed|todo|tbd)\b/iu.test(article);
  if (wordCount < targetWordCount || hasPlaceholder)
    throw new Error(
      `Blog generation did not meet the requested word count or included placeholder text (${wordCount} words, placeholder text: ${hasPlaceholder}).`,
    );
  return `${frontMatter(title, ["wordpress", slug(subject), "beginners"])}\n# ${title}\n\n${article}\n`;
  /*
  return `${frontMatter(title, ["wordpress", slug(subject), "beginners"])}
# ${title}

${subject} becomes much easier when you treat it as a sequence of decisions instead of one large task. This guide gives you a complete, repeatable process: define the result, choose a sensible foundation, build in small verified steps, and keep the finished work maintainable. Adapt each step to your audience and site rather than adding tools simply because they are popular.

## 1. Define the outcome and the reader

Start with a one-sentence brief: who is this for, what problem are they trying to solve, and what should they be able to do when they finish? Then list the non-negotiables: the primary action, the information needed to take it, and any constraints such as budget, deadline, accessibility, privacy, or a required platform.

This brief is a practical filter. If a feature, page, plugin, component, or design decision does not support the outcome, postpone it. A narrow first version that solves the main problem is more useful than an ambitious version full of unfinished edges.

## 2. Plan the smallest useful version

Break ${subject} into the smallest independently testable pieces. Put the reader journey first: what do they see first, what do they need to understand next, and what confirms that the task worked? Write a short checklist for the initial release and a separate “later” list. Keeping these lists separate protects the work from scope creep.

For a WordPress project, this normally means identifying the essential pages, content types, navigation, calls to action, and administrative tasks. For a technical feature, identify inputs, outputs, states, error handling, and the people who need permission to use it. Draw the flow before you start styling or optimizing it.

## 3. Choose a stable foundation

Use current, supported tools that match the job and that you can maintain. Keep WordPress core, themes, and plugins updated; use a child theme or plugin when a change must survive a theme update; and avoid modifying core files. If the work involves code, use version control and make small commits with a clear purpose.

Make safety part of the setup. Use strong, unique credentials and multi-factor authentication where available. Build on a local or staging environment before changing a public site. Create a backup you can restore, and check that you control the domain, hosting account, source files, and any third-party accounts the work depends on.

## 4. Build the core experience first

Create the main path before optional enhancements. Use clear headings, direct labels, and one obvious next action. In WordPress, pages are best for durable information such as services, contact details, and policies; posts are best for dated articles. Keep navigation short and describe destinations plainly.

For every screen or section, ask three questions: Can a first-time visitor understand it? Can they complete the intended action without guessing? Does it work on a phone as well as a desktop browser? Use real content whenever possible. Placeholder copy and decorative images can hide problems that a real reader will notice immediately.

## 5. Make quality, accessibility, and security routine

Use a logical heading order, readable contrast, keyboard-accessible controls, descriptive link text, and alternative text for meaningful images. Do not rely on color alone to convey status. Test forms and interactive elements with a keyboard, and check that error messages explain what needs to be corrected.

Treat all input as untrusted. Use WordPress capabilities for privileged actions, nonces for administrative forms, sanitization before storing data, and context-appropriate escaping when displaying it. Give each person only the access they need. Install extensions only for a clear purpose, keep them updated, and remove ones you no longer use.

## 6. Test the complete journey

Test the work as the intended reader, not only as an administrator or developer. Start from the entry point, follow each primary action, submit forms, try empty and unexpected input, and confirm the success state. Check links, page titles, images, responsive layouts, and email notifications. Repeat the test in a private browser window so cached sessions do not hide permission or login problems.

Also test recovery: restore a backup in a safe environment, disable a nonessential extension, and confirm that important information can be exported. Record the few steps someone else would need to repeat the process. Good documentation is part of a finished deliverable, not an optional extra.

## 7. Launch deliberately and measure what matters

Before launch, proofread the public copy, confirm HTTPS is active, review privacy and contact information, and make a fresh backup. Publish during a time when you can monitor the result. Keep a rollback plan: know which change to reverse and where the backup is stored if a critical issue appears.

After launch, watch the measures connected to the original brief: completed inquiries, purchases, sign-ups, successful task completion, or feedback from real visitors. Do not optimize against vanity numbers alone. Use questions and behavior from actual users to decide what to improve next.

## 8. Maintain and improve the work

Schedule regular updates for WordPress, themes, plugins, dependencies, and backups. Review content that can become outdated, test critical forms periodically, and remove unused accounts and extensions. When making a larger change, use staging, take a backup first, and document the reason for the change.

${subject} does not need to be perfect on day one. A clearly defined goal, a useful first version, careful testing, and steady maintenance will produce a stronger result than trying to solve every future need at once.

## Helpful resources

- [WordPress documentation](https://wordpress.org/documentation/)
- [WordPress developer resources](https://developer.wordpress.org/)
- [WordPress security hardening](https://wordpress.org/documentation/article/hardening-wordpress/)
`;
*/
};

const sendWithResend = async (input: {
  recipient: string;
  subject: string;
  markdown: string;
  idempotencyKey: string;
}): Promise<{ messageId: string }> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BLOG_EMAIL_SENDER;
  if (!apiKey || !from)
    throw new Error(
      "Email delivery needs RESEND_API_KEY and BLOG_EMAIL_SENDER.",
    );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.recipient],
      subject: input.subject,
      text: input.markdown,
      attachments: [
        {
          filename: "blog.md",
          content: Buffer.from(input.markdown).toString("base64"),
        },
      ],
    }),
  });
  if (!response.ok)
    throw new Error(`Email provider returned HTTP ${response.status}.`);
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("id" in body) ||
    typeof body.id !== "string"
  )
    throw new Error("Email provider returned no message ID.");
  return { messageId: body.id };
};

export const runWordPressBlogWriter = async (
  options: BlogWriterOptions,
): Promise<BlogWriterResult> => {
  if (options.send && !options.approve)
    throw new Error("Email delivery requires --approve.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(options.tracker);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Tracker workbook has no worksheet.");
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(value(cell), column));
  for (const header of requiredTrackerHeaders)
    if (!headers.has(header))
      throw new Error(`Tracker is missing required header: ${header}.`);
  const column = (header: Header): number => headers.get(header)!;
  assertValidTracker(sheet, column);
  const now = options.now ?? new Date();
  let row: ExcelJS.Row | undefined;
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const candidate = sheet.getRow(number);
    const topic = value(candidate.getCell(column("Topic")));
    const title = value(candidate.getCell(column("Title")));
    if (
      (topic || title) &&
      !done(value(candidate.getCell(column("Completed")))) &&
      pending(value(candidate.getCell(column("Status")))) &&
      scheduled(value(candidate.getCell(column("Scheduled Date"))), now) &&
      value(candidate.getCell(column("Blog ID")))
    ) {
      row = candidate;
      break;
    }
  }
  if (!row) throw new Error("No eligible blog row is available.");
  const blogId = value(row.getCell(column("Blog ID")));
  if (options.send && options.confirmBlogId !== blogId)
    throw new Error(`Sending requires --confirm ${blogId}.`);
  const topic = value(row.getCell(column("Topic")));
  const title = value(row.getCell(column("Title")));
  const markdown = options.generator
    ? await options.generator.generate({ topic, title })
    : await blog(topic, title, options.model, options.ollamaUrl);
  const draftPath = path.resolve(options.outputDirectory, `${slug(blogId)}.md`);
  await mkdir(options.outputDirectory, { recursive: true });
  await writeFile(draftPath, markdown, "utf8");
  let delivery: "previewed" | "sent" = "previewed";
  if (!options.approve) return { blogId, draftPath, delivery };
  if (options.send) {
    const key = createHash("sha256")
      .update(`${path.resolve(options.tracker)}:${blogId}`)
      .digest("hex");
    const sender = options.delivery ?? { send: sendWithResend };
    await sender.send({
      recipient: options.recipient,
      subject: value(row.getCell(column("Title"))) || `Blog draft: ${blogId}`,
      markdown,
      idempotencyKey: key,
    });
    row.getCell(column("Email Sent At")).value = now.toISOString();
    delivery = "sent";
  }
  row.getCell(column("Draft Path")).value = draftPath;
  row.getCell(column("Status")).value = "completed";
  row.getCell(column("Completed")).value = true;
  row.getCell(column("Error")).value = "";
  const temporary = `${options.tracker}.${randomUUID()}.tmp`;
  await workbook.xlsx.writeFile(temporary);
  await rename(temporary, options.tracker);
  return { blogId, draftPath, delivery };
};
