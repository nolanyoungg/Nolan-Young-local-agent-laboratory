#!/usr/bin/env node
import { runCodeEditorCli } from "./cli.js";
process.exitCode = await runCodeEditorCli();
