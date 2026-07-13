# Code Editor

Runs distinct read-only planner, policy-confined editor, and read-only reviewer agents. `plan-only` never invokes the editor, `dry-run` forces every requested mutation to remain virtual, and `apply` writes atomically. Reports include the plan, proposed diff, changed-file hashes, review, final result, and trace.
