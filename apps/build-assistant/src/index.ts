#!/usr/bin/env node
import { runBuildAssistantCli } from "./cli.js";
process.exitCode = await runBuildAssistantCli();
