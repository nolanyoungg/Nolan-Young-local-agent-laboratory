# Repository audit checklist

## Structure and ownership

- Clear entry points and package boundaries
- Manifests and workspace declarations match directories
- Generated, source, test, fixture, report, and artifact locations are distinguishable
- Shared behavior is not inconsistently duplicated

## Logic and failure handling

- Inputs are validated at trust boundaries
- Errors propagate without false success or lost context
- Cleanup occurs on success, failure, timeout, and interruption
- Async work is awaited and race-prone state changes are deterministic
- Defaults, limits, and retry behavior match documented intent

## Tests and automation

- Primary workflows, negative paths, and security invariants have meaningful assertions
- Test names match what is actually exercised
- CI and local validation use compatible commands
- Fixtures are valid and do not silently depend on developer-machine state
- Build/lint/typecheck/test scripts include the intended source surfaces

## Documentation and configuration

- README setup and command examples match manifests and CLIs
- Environment examples contain current names and safe values
- Configuration schemas, sample files, and runtime consumers agree
- Architecture and security claims are enforced by code
- Deprecated commands, files, and capabilities are removed or clearly labeled

## Repository hygiene

- No accidental console output stored as source
- No credentials, private keys, local caches, generated reports, or dependency folders tracked
- Ignore rules reflect actual generated output
- Naming and casing are portable across supported operating systems
- Dependencies and scripts have a clear current purpose
