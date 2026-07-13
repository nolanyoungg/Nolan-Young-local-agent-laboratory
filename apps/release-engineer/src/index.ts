#!/usr/bin/env node
import { runReleaseEngineerCli } from "./cli.js";
process.exitCode = await runReleaseEngineerCli();
