# Zog

Zog is a tiny Zod-first persistence layer for MongoDB.

This repository is a pnpm workspace containing the publishable Zog library and
a Fumadocs-powered documentation site.

## Projects

- `packages/core`: shared runtime-safe constants and helpers.
- `packages/server`: Node/server helpers.
- `packages/trpc`: placeholder API contract package.
- `packages/zog`: publishable `@mp-lb/zog` library package.
- `apps/docs`: Fumadocs MDX documentation website.

## Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
zap up
```

## Docs

- [Quick start](docs/quick-start.md) covers the basic model and repository flow.
- [Schema evolution](docs/schema-evolution.md) covers legacy collection names, key renames, and custom normalization.
- [Indexes](docs/indexes.md) covers declaring, diffing, and syncing MongoDB indexes.
- [References](docs/references.md) covers modeling fields that contain another model's primary key.
