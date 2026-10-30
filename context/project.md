## Project

- Name: Zog
- Description: Better integration for Zod and MongoDB
- Package scope: `@mp-lb`
- Project slug: `zog`

### Workspace

- Use `pnpm` for package management.
- Docs app: `apps/docs`
- Library package: `packages/zog` (`@mp-lb/zog`)

MongoDB is a library dependency tested through existing fixtures and connection configuration; it does not imply a deployed database service.

### Related tooling

Shared tooling is developed in sibling checkouts under `~/Work`: Zapper (`zapper`) runs tasks, Forum (`forum`) provides `fm`, Tools (`tools`) provides ArcNet, and Stackforge (`stackforge`) owns setup conventions. When a change belongs in an owned dependency, inspect and update that source repository as needed, follow its `AGENTS.md`, then rebuild/relink the CLI or update the consuming dependency. Verify the command resolves to the intended build.

## Documentation

Keep project-specific documentation under `docs/`.

This project has no dedicated Forum store or `.forum/` sync configuration. Read shared standards with `fm read <file>.md --store mp-lb/dev` (list them with `fm ls --store mp-lb/dev`). Read shared extensions with `fm read extensions/<extension>/README.md --store mp-lb/fssstack` (list them with `fm ls extensions --store mp-lb/fssstack`).

## Validation

Run these after setup or code changes:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

For full setup validation, also run:

```bash
zap task setup
zap up
```
