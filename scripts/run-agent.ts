#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient } from "@laboratory/local-model-client";
import { listLibraryEntries, runLibraryAgent } from "./agent-library.js";

interface Arguments {
  agent?: string;
  workspace?: string;
  task?: string;
  model?: string;
  ollamaUrl?: string;
  maxSteps?: number;
  reportDirectory?: string;
  skills: string[];
  list: boolean;
  help: boolean;
}

const help = `Local Agent Library\n\nUsage:\n  npm run agent:list\n  npm run agent -- AGENT --target PATH [--task TEXT] [options]\n\nOptions:\n  --model NAME              Default: OLLAMA_MODEL or qwen2.5-coder:14b\n  --ollama-url URL          Default: OLLAMA_BASE_URL or http://127.0.0.1:11434\n  --task TEXT               Optional review request\n  --max-steps N             Override the agent step budget\n  --help`;

const parseArguments = (values: readonly string[]): Arguments => {
  const parsed: Arguments = { skills: [], list: false, help: false };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key && !key.startsWith("-")) {
      if (parsed.agent) throw new Error(`Unexpected positional value: ${key}`);
      parsed.agent = key;
      continue;
    }
    if (key === "--help") parsed.help = true;
    else if (key === "--list") parsed.list = true;
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
