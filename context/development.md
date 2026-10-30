## Development

Use Zapper for processes and tasks: `zap status`, `zap up`, `zap logs <service> --no-follow`, and `zap task <task>`. Inspect the existing stack before starting another copy. Services and tasks that need environment variables must receive Zapper's resolved environment.

Keep service names, dynamic ports and task commands in `zap.yaml`; do not hardcode development ports. Non-secret defaults live in `.env.local`; secrets belong in ignored `.env` or the configured secret source. Never put secret values in context.

The canonical tool versions are `.node-version` and `package.json#packageManager`; preserve them when changing local tooling or CI.
