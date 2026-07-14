# `@laboratory/local-model-client`

Provider-neutral local model interface with Ollama and deterministic mock implementations. Requests may select text, JSON mode, or a provider-supported JSON Schema. Ollama requests are bounded by timeouts and retries, classify non-retryable invalid requests separately, require no API key, and never fall back to a hosted provider.
