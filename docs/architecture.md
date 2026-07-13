# Architecture

```mermaid
flowchart TD
  CLI["Independent application CLI"] --> WF["Application-owned workflow"]
  WF --> AR["Focused agent runtime"]
  AR --> LM["Local Ollama model"]
  AR --> PG["Permission guard"]
  PG --> FS["Workspace-confined filesystem tools"]
  WF --> PM["Allowlisted process manager"]
  WF --> TR["Redacted local traces and reports"]
```

Applications own policy, orchestration, commands, pass/fail, locks, and reports. Agents are role configurations sharing a provider-neutral runtime. Tools are deterministic TypeScript capabilities. The model reasons over supplied evidence and can only request registered actions.
