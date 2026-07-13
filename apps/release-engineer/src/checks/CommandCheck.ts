import type { ProcessManager } from "@laboratory/process-tools";
import type { CheckDefinition, CheckResult } from "./CheckDefinition.js";
export class CommandCheck implements CheckDefinition {
  constructor(
    readonly id: string,
    readonly mandatory: boolean,
    private readonly processes: ProcessManager,
  ) {}
  async run(): Promise<CheckResult> {
    const result = await this.processes.run(this.id);
    return {
      id: this.id,
      type: "command",
      mandatory: this.mandatory,
      success: result.exitCode === 0,
      message:
        result.exitCode === 0
          ? "Command passed."
          : `Command failed with exit code ${result.exitCode}.`,
      details: result,
    };
  }
}
