<!-- Standard -->

## Agent context

Agent instructions are compiled from reusable blocks in `context/`, with `context/index.md` listing the blocks in order. This keeps shared and project-specific instructions easy to maintain.

Edit the blocks and index in `context/`, then run `zap task context-build` to regenerate `AGENTS.md` and `CLAUDE.md`.



## Code style

- Use PascalCase for components
- Files should have 1 export, and should be named the same. E.g. MyComponent lives in MyComponent.tsx
- Use camelCase for constants, functions, mongo collections
- Use train_case for typed strings
- File routers are an exception
- Generally 1 function/class per file

### Functional decomposition

Good functional decomposition is essential. This applies to react components, hooks, backend functions. Continuously abstract and centralise important code. Functions should be small and "do one thing".

### Code organization

Maintain an extreme approach to code organization. Functions/components should never be large or complex. Generally every function should have it's own file. Those files should be well organised. Continuously break down programs and organise files so that it's always crystal clear what modules relate to each other. You have permission to do this at all times. Flag concerns with the developer if unsure.

Take extra care when organizing tests.

### Tech debt

In general, follow the boy scout principle. But if you come across tech debt that's too big to address, add a .md doc to docs/tech-debt and raise it with the user.


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

## Standards

Read the relevant MAP Lab standards before changing the corresponding code. List them with `fm ls --store mp-lb/dev` and read one with `fm read <file>.md --store mp-lb/dev`.

- `style-guide.md` and `component-decomposition.md`: code and component structure.
- `crud.md`, `errors.md`, `trpc.md` and `logging.md`: backend APIs, services and error handling; list the store for current available guidance.
- `event-schema.md` and `event-sourcing.md`: event schemas and event-sourced domains.
- `libs.md`, `lib-release.md` and `clis.md`: libraries, publishing and command-line tools.
- For agent context, read `standards/context-files.md` from `mp-lb/fssstack`.



## Development

Use Zapper for processes and tasks: `zap status`, `zap up`, `zap logs <service> --no-follow`, and `zap task <task>`. Inspect the existing stack before starting another copy. Services and tasks that need environment variables must receive Zapper's resolved environment.

Keep service names, dynamic ports and task commands in `zap.yaml`; do not hardcode development ports. Non-secret defaults live in `.env.local`; secrets belong in ignored `.env` or the configured secret source. Never put secret values in context.

The canonical tool versions are `.node-version` and `package.json#packageManager`; preserve them when changing local tooling or CI.

### Local tool versions

Mise is the base layer: it selects Node and the package manager. Zapper runs tasks and services on top of those tools. Run `mise trust` and `mise install` for checkout setup, then use an activated mise shell or `mise exec -- zap task <task>`.

Read Node from `.node-version` and pnpm from `package.json#packageManager`; `mise.toml` reads these pins rather than duplicating them. npm projects use npm bundled with Node. Preserve the project's versions and package manager. Keep locally built CLI entrypoints in a version-independent PATH directory so switching Node does not hide `zap` or `fm`.



## Validation

Run the applicable configured checks, tests and builds; use `zap task check`, `zap task test` and `zap task build` where available. Run focused checks and follow project-specific validation instructions; report checks that could not run.


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

## Scripts

Write project scripts in TypeScript in the package that owns the behaviour, or `packages/scripts` when there is no natural owner, and include them in normal lint and typecheck checks. Expose each script as a thin Zap task that invokes it with `tsx` (for example, `zap t somemigration` runs `packages/scripts/somemigration.ts`); keep CI callers aligned when moving scripts.



## Documentation

Keep project-specific documentation in `docs/` and update it with behavior changes. Follow the project's own instructions for any Forum sync mapping; read shared standards and extension setup from their Forum stores.


## Documentation

Keep project-specific documentation under `docs/`.

This project has no dedicated Forum store or `.forum/` sync configuration. Read shared standards with `fm read <file>.md --store mp-lb/dev` (list them with `fm ls --store mp-lb/dev`). Read shared extensions with `fm read extensions/<extension>/README.md --store mp-lb/fssstack` (list them with `fm ls extensions --store mp-lb/fssstack`).

## Delivery

Push `main` to run the configured delivery workflows for applications and packages. Check GitHub Actions and follow any project-specific release exceptions.



<!-- Project types -->

<!-- Extensions -->

## ArcNet

This project uses ArcNet. `.arcnet/arcnet.yaml` records its configured sources, consumers and selected deployment services. Read that configuration and the project’s delivery instructions before changing infrastructure. Minimal installations may only manage secrets/variables; do not assume an application is deployed.

Keep deployment build paths, runtime entrypoints, health settings and domains aligned with the actual applications. Local databases are not automatically deployment services. Verify the relevant workflow and runtime result after delivery.

Setup and updates: `fm read extensions/arcnet/README.md --store mp-lb/fssstack` and `fm read SETUP.md --store mp-lb/arcnet`.

## ArcNet secrets and variables

Read `.arcnet/arcnet.yaml` for the actual Forum sources and configured consumers. Source values live in those stores; encrypted snapshots under `.arcnet/secrets/` are committed. GitHub repository secrets contain CI decryption keys, not the plaintext source values.

After changing sources, run `arcnet secrets sync` or `arcnet variables sync` as appropriate and commit refreshed snapshots. Use `arcnet env check --password` for local validation and `arcnet env run --consumer <name> -- <command>` for a configured consumer. Keep plaintext, passwords and decryption keys out of context and Git.

These delivery sources are distinct from local `.env` secrets and `.env.local` non-secret defaults where the project uses those files.
