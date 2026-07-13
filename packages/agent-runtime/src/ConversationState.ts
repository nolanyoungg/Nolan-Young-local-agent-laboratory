import type { AgentMessage } from "@laboratory/shared-types";
export class ConversationState {
  private readonly values: AgentMessage[];
  constructor(initial: readonly AgentMessage[]) {
    this.values = [...initial];
  }
  append(...messages: AgentMessage[]): void {
    this.values.push(...messages);
  }
  messages(): AgentMessage[] {
    return [...this.values];
  }
  estimatedTokens(): number {
    return Math.ceil(
      this.values.reduce((sum, message) => sum + message.content.length, 0) / 4,
    );
  }
}
