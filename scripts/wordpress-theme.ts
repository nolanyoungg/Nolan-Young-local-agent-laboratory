import { access, readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

export type ThemeKind = "classic" | "block" | "hybrid" | "unknown";
export type ThemeVerdict =
  "valid-static-structure" | "invalid-static-structure" | "inconclusive";
export interface ThemeIssue {
  readonly severity: "high" | "medium" | "low" | "info";
  readonly path: string;
  readonly evidence: string;
  readonly impact: string;
  readonly recommendedNextStep: string;
  readonly confidence: "high" | "medium" | "low";
  readonly classification:
    "confirmed" | "inferred" | "runtime-verification-needed";
}
export interface ThemeVerification {
  readonly verdict: ThemeVerdict;
  readonly themeType: ThemeKind;
  readonly issues: readonly ThemeIssue[];
  readonly checks: Record<
    string,
    "present" | "missing" | "optional" | "not-applicable"
  >;
  readonly limitations: readonly string[];
}

const exists = async (candidate: string): Promise<boolean> =>
  access(candidate)
    .then(() => true)
    .catch(() => false);
const execFileAsync = promisify(execFile);
const phpFiles = async (root: string, depth = 0): Promise<string[]> => {
  if (depth > 8) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.slice(0, 500).map(async (entry) => {
      const candidate = path.join(root, entry.name);
      if (entry.isDirectory()) return phpFiles(candidate, depth + 1);
      return entry.isFile() && entry.name.endsWith(".php") ? [candidate] : [];
    }),
  );
  return nested.flat().slice(0, 200);
};
const checkPhp = async (
  file: string,
): Promise<"valid" | "invalid" | "unavailable"> => {
  try {
    await execFileAsync("php", ["-l", file], {
      timeout: 15_000,
      windowsHide: true,
    });
    return "valid";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return "unavailable";
    return "invalid";
  }
};
const issue = (
  pathValue: string,
  evidence: string,
  impact: string,
  next: string,
): ThemeIssue => ({
  severity: "high",
  path: pathValue,
  evidence,
  impact,
  recommendedNextStep: next,
  confidence: "high",
  classification: "confirmed",
});

export const parseThemeHeader = (contents: string): string | undefined => {
  const match =
    /^\s*(?:\/\*\s*)?\*?\s*Theme Name:\s*(.+?)\s*(?:\*\/)?\s*$/imu.exec(
      contents.slice(0, 8_192),
    );
  const value = match?.[1]?.replace(/\*\/\s*$/u, "").trim();
  return value || undefined;
};

export async function verifyWordPressTheme(
  target: string,
): Promise<ThemeVerification> {
  const root = path.resolve(target);
  const checks: ThemeVerification["checks"] = {};
  const issues: ThemeIssue[] = [];
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch {
    return {
      verdict: "inconclusive",
      themeType: "unknown",
      issues: [
        issue(
          ".",
          "Target cannot be read.",
          "Static verification cannot begin.",
          "Provide a readable theme directory.",
        ),
      ],
      checks,
      limitations: [],
    };
  }
  if (!rootStat.isDirectory())
    return {
      verdict: "invalid-static-structure",
      themeType: "unknown",
      issues: [
        issue(
          ".",
          "Target is not a directory.",
          "A WordPress theme must be a directory.",
          "Select a theme root directory.",
        ),
      ],
      checks,
      limitations: [],
    };
  const style = path.join(root, "style.css");
  checks["style.css"] = (await exists(style)) ? "present" : "missing";
  if (!(await exists(style)))
    issues.push(
      issue(
        "style.css",
        "Root style.css is missing.",
        "WordPress cannot identify the theme header.",
        "Add a root style.css with a non-empty Theme Name header.",
      ),
    );
  else {
    const header = parseThemeHeader(await readFile(style, "utf8"));
    if (!header)
      issues.push(
        issue(
          "style.css",
          "No non-empty Theme Name header was found.",
          "The theme is not reliably identifiable by WordPress.",
          "Add a valid Theme Name header comment.",
        ),
      );
  }
  const templates = path.join(root, "templates");
  const blockIndex = path.join(templates, "index.html");
  const classicIndex = path.join(root, "index.php");
  const hasBlock = await exists(blockIndex);
  const hasClassic = await exists(classicIndex);
  const themeType: ThemeKind =
    hasBlock && hasClassic
      ? "hybrid"
      : hasBlock
        ? "block"
        : hasClassic
          ? "classic"
          : "unknown";
  checks["templates/index.html"] = hasBlock
    ? "present"
    : themeType === "block"
      ? "missing"
      : "not-applicable";
  checks["index.php"] = hasClassic
    ? "present"
    : themeType === "classic"
      ? "missing"
      : "not-applicable";
  if (themeType === "unknown")
    issues.push(
      issue(
        "index.php",
        "Neither index.php nor templates/index.html is present.",
        "No supported classic or block entry-template evidence was found.",
        "Add the applicable classic index.php or block templates/index.html entry template.",
      ),
    );
  const themeJson = path.join(root, "theme.json");
  checks["theme.json"] = (await exists(themeJson)) ? "present" : "optional";
  if (await exists(themeJson))
    try {
      JSON.parse(await readFile(themeJson, "utf8"));
    } catch (error) {
      issues.push(
        issue(
          "theme.json",
          `Invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
          "WordPress cannot reliably load theme settings.",
          "Correct the JSON syntax and retry static verification.",
        ),
      );
    }
  for (const optional of [
    "functions.php",
    "parts",
    "patterns",
    "assets",
    "languages",
    "screenshot.png",
  ])
    checks[optional] = (await exists(path.join(root, optional)))
      ? "present"
      : "optional";
  const limitations = [
    "Static verification does not activate WordPress, execute PHP application code, render pages, check browser output, plugin compatibility, or performance.",
  ];
  const php = await phpFiles(root);
  if (php.length) {
    for (const file of php) {
      const syntax = await checkPhp(file);
      if (syntax === "unavailable") {
        limitations.push(
          "Local PHP is unavailable, so PHP syntax checks were not run.",
        );
        break;
      }
      if (syntax === "invalid")
        issues.push(
          issue(
            path.relative(root, file).replaceAll("\\", "/"),
            "The local `php -l` static syntax check failed.",
            "WordPress may fail while loading this PHP file.",
            "Correct the PHP syntax and rerun verification.",
          ),
        );
    }
  }
  return {
    verdict: issues.length
      ? "invalid-static-structure"
      : "valid-static-structure",
    themeType,
    issues,
    checks,
    limitations,
  };
}
