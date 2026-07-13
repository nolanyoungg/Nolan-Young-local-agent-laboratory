import { AgentRuntimeError } from "./errors.js";
export class StepLimiter {
  private current = 0;
  constructor(readonly maximum: number) {}
  next(): number {
    if (this.current >= this.maximum)
      throw new AgentRuntimeError(
        "MAXIMUM_STEPS",
        `Agent exceeded maximum step count of ${this.maximum}`,
      );
    return this.current++;
  }
}
