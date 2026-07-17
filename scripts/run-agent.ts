#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient } from "@laboratory/local-model-client";
import { listLibraryEntries, runLibraryAgent } from "./agent-library.js";
import { runWordPressBlogWriter } from "./wordpress-blog-writer.js";

interface Arguments {
  agent?: string;
  workspace?: string;
  task?: string;
  model?: string;
  ollamaUrl?: string;
  maxSteps?: number;
  reportDirectory?: string;
  outputDirectory?: string;
  recipient?: string;
  approve: boolean;
  send: boolean;
  confirm?: string;
  wordCount?: number;
  skills: string[];
  list: boolean;
  help: boolean;
}

const help = `Local Agent Library\n\nUsage:\n  npm run agent:list\n  npm run agent -- AGENT --target PATH [--task TEXT] [options]\n\nWordPress Blog Writer:\n  npm run agent -- wordpress-blog-writer-agent --target content.xlsx\n  npm run agent -- wordpress-blog-writer-agent --target content.xlsx --approve --word-count 1200\n  npm run agent -- wordpress-blog-writer-agent --target content.xlsx --approve --send --confirm BLOG-ID --recipient nolanyoung7@yahoo.com\n  The first command creates a non-mutating draft preview.\n\nOptions:\n  --model NAME              Default: OLLAMA_MODEL or qwen2.5-coder:14b\n  --ollama-url URL          Default: OLLAMA_BASE_URL or http://127.0.0.1:11434\n  --task TEXT               Optional review request\n  --max-steps N             Override the agent step budget\n  --output-directory PATH   Draft output directory (blog writer)\n  --recipient EMAIL         Email recipient (blog writer)\n  --word-count N            Approximate requested blog length; default: 1200\n  --approve                 Allow the selected tracker row to be completed\n  --send                    Send the generated blog via the configured provider\n  --confirm BLOG-ID         Required exact Blog ID when sending\n  --help`;

const parseArguments = (values: readonly string[]): Arguments => {
  const parsed: Arguments = {
    skills: [],
    list: false,
    help: false,
    approve: false,
    send: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key && !key.startsWith("-")) {
      if (parsed.agent) throw new Error(`Unexpected positional value: ${key}`);
      parsed.agent = key;
      continue;
    }
    if (key === "--help") parsed.help = true;
    else if (key === "--list") parsed.list = true;
    else if (key === "--approve") parsed.approve = true;
    else if (key === "--send") parsed.send = true;
    else {
      const value = values[++index];
      if (!value) throw new Error(`Missing value for ${key}`);
      if (key === "--agent") parsed.agent = value;
      else if (key === "--target" || key === "--workspace")
        parsed.workspace = value;
      else if (key === "--task") parsed.task = value;
      else if (key === "--model") parsed.model = value;
      else if (key === "--ollama-url") parsed.ollamaUrl = value;
      else if (key === "--max-steps") parsed.maxSteps = Number(value);
      else if (key === "--report-directory") parsed.reportDirectory = value;
      else if (key === "--output-directory") parsed.outputDirectory = value;
      else if (key === "--recipient") parsed.recipient = value;
      else if (key === "--confirm") parsed.confirm = value;
      else if (key === "--word-count") parsed.wordCount = Number(value);
      else if (key === "--skill") parsed.skills.push(value);
      else throw new Error(`Unknown option: ${key}`);
    }
  }
  return parsed;
};

export const runAgentCli = async (
  values = process.argv.slice(2),
): Promise<number> => {
  try {
    const args = parseArguments(values);
    const repositoryRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    if (args.help) {
      console.log(help);
      return 0;
    }
    if (args.list) {
      const entries = await listLibraryEntries(repositoryRoot);
      console.log(
        `Agents:\n${entries.agents.map((name) => `  - ${name}`).join("\n")}\n\nSkills:\n${entries.skills.map((name) => `  - ${name}`).join("\n")}`,
      );
      return 0;
    }
    if (!args.agent || !args.workspace)
      throw new Error(
        "AGENT and --target are required; run with --help for examples",
      );
    if (args.agent === "wordpress-blog-writer-agent") {
      const result = await runWordPressBlogWriter({
        tracker: path.resolve(args.workspace),
        outputDirectory: path.resolve(args.outputDirectory ?? "drafts"),
        recipient: args.recipient ?? "nolanyoung7@yahoo.com",
        approve: args.approve,
        send: args.send,
        model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b",
        ollamaUrl:
          args.ollamaUrl ??
          process.env.OLLAMA_BASE_URL ??
          "http://127.0.0.1:11434",
        ...(args.wordCount !== undefined
          ? { targetWordCount: args.wordCount }
          : {}),
        ...(args.confirm ? { confirmBlogId: args.confirm } : {}),
      });
      console.log(
        `Blog ID: ${result.blogId}\nDraft: ${result.draftPath}\nDelivery: ${result.delivery}`,
      );
      return 0;
    }
    const result = await runLibraryAgent(
      {
        repositoryRoot,
        agentId: args.agent,
        workspace: path.resolve(args.workspace ?? process.cwd()),
        task:
          args.task ??
          "Perform the static, read-only review defined by this agent.",
        model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b",
        baseUrl:
          args.ollamaUrl ??
          process.env.OLLAMA_BASE_URL ??
          "http://127.0.0.1:11434",
        ...(args.maxSteps ? { maximumSteps: args.maxSteps } : {}),
        ...(args.reportDirectory
          ? { reportDirectory: path.resolve(args.reportDirectory) }
          : {}),
        additionalSkills: args.skills,
      },
      createModelClient("ollama"),
    );
    console.log(`Agent: ${result.agent.name}`);
    console.log(`Model: ${result.model}`);
    console.log(`Findings: ${result.result.findings.length}`);
    console.log(`Report: ${result.reportDirectory}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await runAgentCli();
