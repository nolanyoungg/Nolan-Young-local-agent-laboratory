import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const outputDir = fileURLToPath(new URL(".", import.meta.url));
const workbook = new ExcelJS.Workbook();
workbook.creator = "WordPress Blog Writer Agent";
const queue = workbook.addWorksheet("Content Queue", {
  views: [{ showGridLines: false, state: "frozen", ySplit: 1 }],
});
queue.columns = [
  { header: "Blog ID", key: "blogId", width: 16 },
  { header: "Topic", key: "topic", width: 32 },
  { header: "Title", key: "title", width: 34 },
  { header: "Status", key: "status", width: 14 },
  { header: "Completed", key: "completed", width: 13 },
  { header: "Scheduled Date", key: "scheduledDate", width: 17 },
  { header: "Draft Path", key: "draftPath", width: 34 },
  { header: "Email Sent At", key: "emailSentAt", width: 23 },
  { header: "Error", key: "error", width: 30 },
];
queue.addRows([
  {
    blogId: "blog-001",
    topic: "How to build a WordPress website",
    status: "pending",
  },
  {
    blogId: "blog-002",
    topic: "How to build a WordPress plugin for beginners",
    status: "pending",
  },
  ...Array.from({ length: 13 }, () => ({})),
]);
const header = queue.getRow(1);
header.height = 30;
header.eachCell((cell) => {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" },
  };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: "FF0B5C59" } } };
});
for (let rowNumber = 2; rowNumber <= 16; rowNumber += 1) {
  const row = queue.getRow(rowNumber);
  row.alignment = { vertical: "middle" };
  row.getCell(2).alignment = { vertical: "middle", wrapText: true };
  row.getCell(3).alignment = { vertical: "middle", wrapText: true };
  row.getCell(6).numFmt = "yyyy-mm-dd";
  row.getCell(8).numFmt = "yyyy-mm-dd hh:mm";
}
queue.dataValidations.add("D2:D16", {
  type: "list",
  allowBlank: true,
  formulae: ['"pending,completed"'],
});
queue.dataValidations.add("E2:E16", {
  type: "list",
  allowBlank: true,
  formulae: ['"TRUE,FALSE"'],
});
queue.autoFilter = "A1:I16";

const guide = workbook.addWorksheet("Instructions", {
  views: [{ showGridLines: false }],
});
guide.columns = [{ width: 24 }, { width: 92 }];
guide.mergeCells("A1:B1");
guide.getCell("A1").value = "WordPress Blog Writer — tracker instructions";
guide.getCell("A1").font = {
  bold: true,
  size: 14,
  color: { argb: "FFFFFFFF" },
};
guide.getCell("A1").fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F766E" },
};
guide.getCell("A1").alignment = { vertical: "middle" };
guide.getRow(1).height = 28;
const instructions = [
  ["1. Blog ID", "Enter a unique, stable identifier such as blog-001."],
  [
    "2. Topic or Title",
    "Provide at least one. The agent uses the first pending eligible row.",
  ],
  ["3. Status", "Leave blank or use pending. Completed rows are skipped."],
  ["4. Completed", "Leave blank or FALSE until the agent completes the row."],
  [
    "5. Scheduled Date",
    "Leave blank to make it immediately eligible, or use a valid yyyy-mm-dd date.",
  ],
  [
    "6. Run safely",
    "Run without --approve for a draft preview; use --approve --send --confirm <Blog ID> only when ready to deliver.",
  ],
];
guide.addRows(instructions);
for (let rowNumber = 2; rowNumber <= 7; rowNumber += 1) {
  const row = guide.getRow(rowNumber);
  row.height = 34;
  row.getCell(1).font = { bold: true, color: { argb: "FF0F172A" } };
  row.eachCell((cell) => {
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });
}

await workbook.xlsx.writeFile(
  path.join(outputDir, "wordpress-blog-content-tracker.xlsx"),
);
